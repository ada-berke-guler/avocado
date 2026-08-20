import type { RGBAImage } from "../types";
import { clamp, median, rgbToHsv, rgbToLab } from "./color";
import {
  BG_BRIGHT_MAX_SAT,
  BG_BRIGHT_V,
  BG_SIMILARITY_DE,
  GUIDE_ELLIPSE_RX,
  GUIDE_ELLIPSE_RY,
  SKIN_HUE_MAX,
  SKIN_HUE_MIN,
  SKIN_MAX_SAT,
  SKIN_MIN_SAT,
  SKIN_MIN_V,
} from "./constants";

export interface SegmentResult {
  /** 1 = avokado pikseli */
  mask: Uint8Array;
  /** Maskenin kadraja oranı, 0-1 */
  maskArea: number;
  /** Şekil düzgünlüğü, 0-1. Avokado dışbükey ve pürüzsüzdür → yüksek olmalı. */
  compactness: number;
  bbox: { x0: number; y0: number; x1: number; y1: number };
}

/** Rehber elipsin içi (1) — kullanıcının avokadoyu hizaladığı bölge. */
export function guidePrior(width: number, height: number): Uint8Array {
  const out = new Uint8Array(width * height);
  const cx = width / 2;
  const cy = height / 2;
  const rx = width * GUIDE_ELLIPSE_RX;
  const ry = height * GUIDE_ELLIPSE_RY;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const dx = (x - cx) / rx;
      const dy = (y - cy) / ry;
      out[y * width + x] = dx * dx + dy * dy <= 1 ? 1 : 0;
    }
  }
  return out;
}

/** Rehber elipsin dışı (1) — beyaz denge referansı buradan alınır. */
export function backgroundPrior(width: number, height: number): Uint8Array {
  const inside = guidePrior(width, height);
  const out = new Uint8Array(inside.length);
  for (let i = 0; i < inside.length; i++) out[i] = inside[i] ? 0 : 1;
  return out;
}

/**
 * Avokado maskesini çıkarır.
 *
 * Mükemmel segmentasyon MVP hedefi değil; hedef ölçüme SADECE kabuk piksellerinin
 * girmesi. Kadraja giren masa, el veya duvar rengi medyanı kaydırır ve tüm sonucu bozar,
 * bu yüzden şüpheli pikselleri dahil etmek yerine dışlamayı tercih ediyoruz.
 */
export function segment(img: RGBAImage): SegmentResult {
  const { width, height, data } = img;
  const total = width * height;
  const inside = guidePrior(width, height);

  // 1) Arka planın tipik rengi — renkli bir masa örtüsünü avokado sanmamak için referans.
  const bgL: number[] = [];
  const bgA: number[] = [];
  const bgB: number[] = [];
  for (let i = 0; i < total; i += 3) {
    if (inside[i]) continue;
    const p = i * 4;
    const [L, a, b] = rgbToLab(data[p], data[p + 1], data[p + 2]);
    bgL.push(L);
    bgA.push(a);
    bgB.push(b);
  }
  const bgRef = { L: median(bgL), a: median(bgA), b: median(bgB) };

  // 2) Piksel bazlı ön eleme
  const cand = new Uint8Array(total);
  for (let i = 0; i < total; i++) {
    if (!inside[i]) continue;
    const p = i * 4;
    const r = data[p];
    const g = data[p + 1];
    const b = data[p + 2];
    const [h, s, v] = rgbToHsv(r, g, b);

    // Parlak ve renksiz = tezgah / duvar / kağıt
    if (v > BG_BRIGHT_V && s < BG_BRIGHT_MAX_SAT) continue;
    // Ten rengi = avokadoyu tutan el
    if (h >= SKIN_HUE_MIN && h <= SKIN_HUE_MAX && s >= SKIN_MIN_SAT && s <= SKIN_MAX_SAT && v >= SKIN_MIN_V) {
      continue;
    }
    // Arka planla neredeyse aynı renk = arka planın elips içine taşan kısmı
    const [L, aa, bb] = rgbToLab(r, g, b);
    const de = Math.hypot(L - bgRef.L, aa - bgRef.a, bb - bgRef.b);
    if (de < BG_SIMILARITY_DE) continue;

    cand[i] = 1;
  }

  // 3) Gürültü temizliği: aç (erode→dilate) — tek piksellik lekeler ve saçaklar gider
  const opened = dilate(erode(cand, width, height, 1), width, height, 1);

  // 4) Merkeze en yakın en büyük bağlı bileşen — kadraja giren ikinci bir nesneyi eler
  const largest = largestComponentNearCenter(opened, width, height);

  // 5) Delikleri doldur (parlama lekesi maskede delik açmış olabilir)
  const filled = fillHoles(largest, width, height);

  let area = 0;
  let x0 = width;
  let y0 = height;
  let x1 = -1;
  let y1 = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (!filled[y * width + x]) continue;
      area++;
      if (x < x0) x0 = x;
      if (y < y0) y0 = y;
      if (x > x1) x1 = x;
      if (y > y1) y1 = y;
    }
  }

  return {
    mask: filled,
    maskArea: area / total,
    compactness: compactness(filled, width, height, area),
    bbox: x1 < 0 ? { x0: 0, y0: 0, x1: 0, y1: 0 } : { x0, y0, x1, y1 },
  };
}

/** Maskeyi n piksel içeri çeker. Kenar gölgesini ölçüm dışında bırakmak için de kullanılır. */
export function erode(mask: Uint8Array, width: number, height: number, n: number): Uint8Array {
  let src = mask;
  for (let it = 0; it < n; it++) {
    const dst = new Uint8Array(src.length);
    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        const i = y * width + x;
        if (!src[i]) continue;
        if (
          src[i - 1] &&
          src[i + 1] &&
          src[i - width] &&
          src[i + width]
        ) {
          dst[i] = 1;
        }
      }
    }
    src = dst;
  }
  return src;
}

export function dilate(mask: Uint8Array, width: number, height: number, n: number): Uint8Array {
  let src = mask;
  for (let it = 0; it < n; it++) {
    const dst = new Uint8Array(src.length);
    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        const i = y * width + x;
        if (src[i] || src[i - 1] || src[i + 1] || src[i - width] || src[i + width]) {
          dst[i] = 1;
        }
      }
    }
    src = dst;
  }
  return src;
}

/**
 * En büyük bağlı bileşen. Eşitlik durumunda merkeze yakın olan kazanır —
 * kullanıcı avokadoyu ortalıyor, kadraja giren başka nesneler kenarda kalır.
 */
function largestComponentNearCenter(
  mask: Uint8Array,
  width: number,
  height: number,
): Uint8Array {
  const labels = new Int32Array(mask.length).fill(-1);
  const stack: number[] = [];
  let best = -1;
  let bestScore = -Infinity;
  let label = 0;
  const cx = width / 2;
  const cy = height / 2;
  const diag = Math.hypot(width, height);

  for (let start = 0; start < mask.length; start++) {
    if (!mask[start] || labels[start] !== -1) continue;
    stack.push(start);
    labels[start] = label;
    let size = 0;
    let sumX = 0;
    let sumY = 0;

    while (stack.length) {
      const i = stack.pop()!;
      size++;
      const x = i % width;
      const y = (i / width) | 0;
      sumX += x;
      sumY += y;
      if (x > 0 && mask[i - 1] && labels[i - 1] === -1) {
        labels[i - 1] = label;
        stack.push(i - 1);
      }
      if (x < width - 1 && mask[i + 1] && labels[i + 1] === -1) {
        labels[i + 1] = label;
        stack.push(i + 1);
      }
      if (y > 0 && mask[i - width] && labels[i - width] === -1) {
        labels[i - width] = label;
        stack.push(i - width);
      }
      if (y < height - 1 && mask[i + width] && labels[i + width] === -1) {
        labels[i + width] = label;
        stack.push(i + width);
      }
    }

    // Skor = boyut × merkeze yakınlık. Merkez ağırlığı boyutu tamamen ezmemeli.
    const dist = Math.hypot(sumX / size - cx, sumY / size - cy) / diag;
    const score = size * (1 - clamp(dist, 0, 0.9));
    if (score > bestScore) {
      bestScore = score;
      best = label;
    }
    label++;
  }

  const out = new Uint8Array(mask.length);
  if (best < 0) return out;
  for (let i = 0; i < mask.length; i++) if (labels[i] === best) out[i] = 1;
  return out;
}

/** Kenardan erişilemeyen 0 bölgeleri maskenin içindeki deliklerdir; doldurulur. */
function fillHoles(mask: Uint8Array, width: number, height: number): Uint8Array {
  const outside = new Uint8Array(mask.length);
  const stack: number[] = [];

  const push = (i: number) => {
    if (!mask[i] && !outside[i]) {
      outside[i] = 1;
      stack.push(i);
    }
  };

  for (let x = 0; x < width; x++) {
    push(x);
    push((height - 1) * width + x);
  }
  for (let y = 0; y < height; y++) {
    push(y * width);
    push(y * width + width - 1);
  }

  while (stack.length) {
    const i = stack.pop()!;
    const x = i % width;
    const y = (i / width) | 0;
    if (x > 0) push(i - 1);
    if (x < width - 1) push(i + 1);
    if (y > 0) push(i - width);
    if (y < height - 1) push(i + width);
  }

  const out = new Uint8Array(mask.length);
  for (let i = 0; i < mask.length; i++) out[i] = mask[i] || !outside[i] ? 1 : 0;
  return out;
}

/**
 * 4πA/P² — daire için 1, saçaklı/parçalı şekiller için 0'a yaklaşır.
 * Avokado dışbükey ve pürüzsüz olduğundan düşük değer "maske yanlış" demektir.
 */
function compactness(
  mask: Uint8Array,
  width: number,
  height: number,
  area: number,
): number {
  if (area === 0) return 0;
  let perimeter = 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      if (!mask[i]) continue;
      if (
        x === 0 ||
        y === 0 ||
        x === width - 1 ||
        y === height - 1 ||
        !mask[i - 1] ||
        !mask[i + 1] ||
        !mask[i - width] ||
        !mask[i + width]
      ) {
        perimeter++;
      }
    }
  }
  if (perimeter === 0) return 0;
  return clamp((4 * Math.PI * area) / (perimeter * perimeter), 0, 1);
}
