import type { ColorFeatures, RGBAImage } from "../types";
import {
  circularHueStats,
  clamp,
  luminance,
  median,
  percentileSorted,
  rgbToHsv,
  rgbToLab,
  variance,
} from "./color";
import {
  SHADOW_TRIM_RATIO,
  SPECULAR_TRIM_RATIO,
  SPOT_L_DELTA,
} from "./constants";
import { erode } from "./segment";

/**
 * Maske içindeki piksellerden renk ve doku ölçümlerini çıkarır.
 *
 * MEDYAN KULLANILIR, ORTALAMA DEĞİL: kadraja sızan tek bir parlak/koyu bölge
 * ortalamayı kolayca kaydırır; medyan bundan etkilenmez.
 */
export function extractFeatures(img: RGBAImage, mask: Uint8Array): ColorFeatures {
  const { width, height, data } = img;

  const idx: number[] = [];
  for (let i = 0; i < mask.length; i++) if (mask[i]) idx.push(i);

  if (idx.length === 0) return emptyFeatures();

  const L: number[] = new Array(idx.length);
  const A: number[] = new Array(idx.length);
  const B: number[] = new Array(idx.length);
  const H: number[] = new Array(idx.length);
  const S: number[] = new Array(idx.length);
  const V: number[] = new Array(idx.length);

  for (let k = 0; k < idx.length; k++) {
    const p = idx[k] * 4;
    const r = data[p];
    const g = data[p + 1];
    const b = data[p + 2];
    const lab = rgbToLab(r, g, b);
    const hsv = rgbToHsv(r, g, b);
    L[k] = lab[0];
    A[k] = lab[1];
    B[k] = lab[2];
    H[k] = hsv[0];
    S[k] = hsv[1];
    V[k] = hsv[2];
  }

  // L*'a göre sırala, sonra iki uçtan kırp:
  // en parlaklar → parlama (specular), rengi beyaza çeker
  // en karanlıklar → kenar gölgesi, yapay koyuluk üretir
  const order = idx.map((_, k) => k).sort((x, y) => L[x] - L[y]);
  const lo = Math.floor(order.length * SHADOW_TRIM_RATIO);
  const hi = order.length - Math.floor(order.length * SPECULAR_TRIM_RATIO);
  const kept = order.slice(lo, Math.max(lo + 1, hi));

  const kL = kept.map((k) => L[k]);
  const kA = kept.map((k) => A[k]);
  const kB = kept.map((k) => B[k]);
  const kS = kept.map((k) => S[k]);
  const kV = kept.map((k) => V[k]).sort((x, y) => x - y);
  // Doygunluğu çok düşük piksellerde hue gürültüdür; dairesel ortalamaya sokulmaz.
  const kH = kept.filter((k) => S[k] > 0.08).map((k) => H[k]);

  const medL = median(kL);
  const hueStats = circularHueStats(kH);

  // Lekeler maskenin İÇİNDEN ölçülür: kenardaki gölge şeridi leke sanılmasın diye
  // maske birkaç piksel içeri çekilir.
  const interior = erode(mask, width, height, 3);
  let spotPixels = 0;
  let interiorPixels = 0;
  for (let k = 0; k < idx.length; k++) {
    if (!interior[idx[k]]) continue;
    interiorPixels++;
    if (L[k] < medL - SPOT_L_DELTA) spotPixels++;
  }

  return {
    hue: hueStats.hue,
    hueSpread: hueStats.spread,
    sat: median(kS),
    val: median(kV),
    L: medL,
    a: median(kA),
    b: median(kB),
    valP10: percentileSorted(kV, 0.1),
    valP50: percentileSorted(kV, 0.5),
    valP90: percentileSorted(kV, 0.9),
    darkSpotRatio: interiorPixels > 0 ? spotPixels / interiorPixels : 0,
    textureVariance: variance(kL),
    pixelCount: kept.length,
  };
}

/**
 * Laplacian varyansı — netlik ölçüsü. Bulanık görüntüde yüksek frekans bileşeni
 * kalmaz, varyans çöker. Sadece maskenin içi ölçülür: arka planın bulanık olması
 * (alan derinliği) avokadonun netliğini etkilemez.
 *
 * Not: Değer çözünürlüğe bağlıdır; analiz hep ANALYSIS_MAX_EDGE'de yapıldığı için
 * karşılaştırılabilir kalır.
 */
export function computeSharpness(img: RGBAImage, mask: Uint8Array): number {
  const { width, height, data } = img;
  const responses: number[] = [];

  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const i = y * width + x;
      if (!mask[i] || !mask[i - 1] || !mask[i + 1] || !mask[i - width] || !mask[i + width]) {
        continue;
      }
      const c = lum(data, i);
      const lap =
        4 * c -
        lum(data, i - 1) -
        lum(data, i + 1) -
        lum(data, i - width) -
        lum(data, i + width);
      responses.push(lap * 255);
    }
  }

  return responses.length < 32 ? 0 : variance(responses);
}

/** Pozlama sağlığı: yanmış piksel oranı ve genel parlaklık. */
export function exposureStats(img: RGBAImage): { clipRatio: number; meanV: number } {
  const { data } = img;
  const n = data.length / 4;
  let clipped = 0;
  let sumV = 0;
  for (let i = 0; i < n; i++) {
    const p = i * 4;
    const v = Math.max(data[p], data[p + 1], data[p + 2]) / 255;
    sumV += v;
    if (v >= 0.99) clipped++;
  }
  return { clipRatio: clipped / n, meanV: clamp(sumV / n, 0, 1) };
}

function lum(data: Uint8ClampedArray, i: number): number {
  const p = i * 4;
  return luminance(data[p], data[p + 1], data[p + 2]);
}

function emptyFeatures(): ColorFeatures {
  return {
    hue: 0,
    hueSpread: 1,
    sat: 0,
    val: 0,
    L: 0,
    a: 0,
    b: 0,
    valP10: 0,
    valP50: 0,
    valP90: 0,
    darkSpotRatio: 0,
    textureVariance: 0,
    pixelCount: 0,
  };
}
