import { describe, expect, it } from "vitest";
import type { RGBAImage, RipenessClass } from "../types";
import { RIPENESS_CLASSES } from "../types";
import { analyze } from "./index";
import { classify, ripenessAxis } from "./classify";
import { extractFeatures } from "./features";
import { backgroundPrior, segment } from "./segment";
import { whiteBalance } from "./whitebalance";

/**
 * Sentetik test görüntüleri.
 *
 * Gerçek fotoğraf yerine sentetik kare kullanmamızın sebebi: burada ölçtüğümüz şey
 * motorun İÇ TUTARLILIĞI (eksen monotonluğu, sınıf sıralaması, dağılım normalizasyonu).
 * Gerçek DOĞRULUK bu testlerle ölçülemez — o, gerçek fotoğraflarla test modunda
 * ölçülür (CLAUDE.md Faz 6). Bu ayrımı karıştırmamak önemli.
 */

/** Deterministik PRNG — testler her koşuda aynı sonucu vermeli. */
function prng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0xffffffff;
  };
}

interface SceneOptions {
  fruit: [number, number, number];
  background?: [number, number, number];
  /** Yüzey dokusu genliği (0 = düz renk). Düz renk = Laplacian 0 = yapay netlik cezası. */
  noise?: number;
  /** Küresel gövde gölgesi genliği */
  shading?: number;
  size?: number;
}

/** Ortada avokado benzeri bir elips, etrafında nötr zemin. */
function scene(opts: SceneOptions): RGBAImage {
  const {
    fruit,
    background = [206, 204, 200],
    noise = 10,
    shading = 0.25,
    size = 256,
  } = opts;
  const width = size;
  const height = size;
  const data = new Uint8ClampedArray(width * height * 4);
  const rnd = prng(42);
  const cx = width / 2;
  const cy = height / 2;
  const rx = width * 0.34;
  const ry = height * 0.4;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const dx = (x - cx) / rx;
      const dy = (y - cy) / ry;
      const inside = dx * dx + dy * dy <= 1;
      const base = inside ? fruit : background;

      // Küresel gölge: merkez aydınlık, kenar koyu — gerçek bir meyvedeki gibi
      const shade = inside ? 1 - shading * Math.min(1, dx * dx + dy * dy) : 1;
      const n = (rnd() - 0.5) * noise;

      data[i] = base[0] * shade + n;
      data[i + 1] = base[1] * shade + n;
      data[i + 2] = base[2] * shade + n;
      data[i + 3] = 255;
    }
  }
  return { width, height, data };
}

/** Olgunlaşma sırasına göre temsili kabuk renkleri (Lab değerleri probe edilerek seçildi). */
const SAMPLES: { name: string; rgb: [number, number, number]; expect: RipenessClass }[] = [
  // Renkler, sahne gölgesi uygulandıktan SONRA gerçek Hass kabuğunun aşama başına
  // tipik L*a*b* ölçümlerine denk gelecek şekilde seçildi (scripts/ içindeki probe ile).
  { name: "canlı yeşil", rgb: [110, 134, 71], expect: "hard" },
  { name: "koyu yeşil", rgb: [92, 110, 65], expect: "pre-conditioned" },
  { name: "zeytin/geçiş", rgb: [86, 88, 55], expect: "breaking" },
  { name: "kahverengi-mor", rgb: [84, 72, 55], expect: "firm-ripe" },
  { name: "siyaha yakın", rgb: [60, 52, 47], expect: "ripe" },
];

describe("olgunluk ekseni", () => {
  it("kabuk koyulaştıkça monoton artar", () => {
    const axes = SAMPLES.map((s) => {
      const img = scene({ fruit: s.rgb });
      const seg = segment(img);
      return ripenessAxis(extractFeatures(img, seg.mask)).value;
    });

    for (let i = 1; i < axes.length; i++) {
      expect(axes[i], `${SAMPLES[i].name} > ${SAMPLES[i - 1].name}`).toBeGreaterThan(
        axes[i - 1],
      );
    }
    expect(axes[0]).toBeLessThan(0.3);
    expect(axes[axes.length - 1]).toBeGreaterThan(0.7);
  });

  it("bileşenleri 0-1 aralığında kalır", () => {
    for (const s of SAMPLES) {
      const img = scene({ fruit: s.rgb });
      const { parts, value } = ripenessAxis(extractFeatures(img, segment(img).mask));
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThanOrEqual(1);
      for (const [key, v] of Object.entries(parts)) {
        expect(v, `${s.name}/${key}`).toBeGreaterThanOrEqual(0);
        expect(v, `${s.name}/${key}`).toBeLessThanOrEqual(1);
      }
    }
  });
});

describe("sınıflandırma", () => {
  it.each(SAMPLES)("$name → $expect", ({ rgb, expect: want }) => {
    const img = scene({ fruit: rgb });
    const result = classify(extractFeatures(img, segment(img).mask));
    expect(result.topClass).toBe(want);
  });

  it("olasılıklar 1'e toplanır", () => {
    for (const s of SAMPLES) {
      const img = scene({ fruit: s.rgb });
      const { probabilities } = classify(extractFeatures(img, segment(img).mask));
      const sum = RIPENESS_CLASSES.reduce((a, c) => a + probabilities[c], 0);
      expect(sum).toBeCloseTo(1, 6);
      for (const c of RIPENESS_CLASSES) expect(probabilities[c]).toBeGreaterThan(0);
    }
  });

  it("dataset prior'ı ölçümü tamamen ezmez", () => {
    // "dark green" kategorisi dataset'te %100 hard; Laplace düzeltmesi sayesinde
    // diğer sınıflara da sıfırdan büyük olasılık kalmalı.
    const img = scene({ fruit: [110, 134, 71] });
    const { probabilities } = classify(extractFeatures(img, segment(img).mask));
    expect(probabilities["pre-conditioned"]).toBeGreaterThan(0.001);
  });
});

describe("segmentasyon", () => {
  it("meyveyi bulur, arka planı dışarıda bırakır", () => {
    const img = scene({ fruit: [92, 110, 65] });
    const seg = segment(img);
    // Elips alanı ≈ π·0.34·0.40 ≈ %43. Rehber elips kırpması ve erozyon payıyla:
    expect(seg.maskArea).toBeGreaterThan(0.25);
    expect(seg.maskArea).toBeLessThan(0.5);
    expect(seg.compactness).toBeGreaterThan(0.5);
  });

  it("meyve yoksa maske boşa yakın kalır", () => {
    const img = scene({ fruit: [206, 204, 200], shading: 0, noise: 4 });
    expect(segment(img).maskArea).toBeLessThan(0.05);
  });
});

describe("beyaz denge", () => {
  it("sıcak ışık kaymasını nötrleştirir", () => {
    const neutral = scene({ fruit: [92, 110, 65] });
    const warm: RGBAImage = {
      width: neutral.width,
      height: neutral.height,
      data: new Uint8ClampedArray(neutral.data),
    };
    // Tungsten benzeri kayma: kırmızı yukarı, mavi aşağı
    for (let i = 0; i < warm.data.length; i += 4) {
      warm.data[i] = Math.min(255, warm.data[i] * 1.18);
      warm.data[i + 2] = warm.data[i + 2] * 0.82;
    }

    const wb = whiteBalance(warm, backgroundPrior(warm.width, warm.height));
    expect(wb.applied).toBe(true);
    expect(wb.gain[0]).toBeLessThan(1); // fazla kırmızı geri alınır
    expect(wb.gain[2]).toBeGreaterThan(1); // eksik mavi telafi edilir

    // Düzeltme sonrası meyve rengi, orijinal nötr ölçüme yaklaşmalı
    const before = extractFeatures(warm, segment(warm).mask);
    const after = extractFeatures(wb.image, segment(wb.image).mask);
    const truth = extractFeatures(neutral, segment(neutral).mask);
    expect(Math.abs(after.a - truth.a)).toBeLessThan(Math.abs(before.a - truth.a));
  });

  it("nötr referans yoksa düzeltme yapmaz", () => {
    // Tüm kare doygun yeşil: güvenilir beyaz referansı yok.
    const img = scene({ fruit: [92, 110, 65], background: [40, 130, 40], noise: 4 });
    const wb = whiteBalance(img, backgroundPrior(img.width, img.height));
    expect(wb.applied).toBe(false);
    expect(wb.gain).toEqual([1, 1, 1]);
  });
});

describe("analyze", () => {
  it("uçtan uca çalışır ve tutarlı sonuç döner", () => {
    const img = scene({ fruit: [60, 52, 47] });
    const result = analyze(img);

    expect(result.topClass).toBe("ripe");
    expect(result.skinTone).toBe("near-black");
    expect(result.colorCategory).toBe("black");
    expect(result.confidence).toBeGreaterThan(0);
    expect(result.confidence).toBeLessThanOrEqual(1);
    expect(result.reasons.length).toBeGreaterThan(0);
    // Sınırlarımızı belirten madde her sonuçta bulunmalı.
    expect(result.reasons.some((r) => r.kind === "limit")).toBe(true);
    expect(result.debug.maskPreview).toBeDefined();
  });

  it("meyve bulunamazsa sonuç üretmez", () => {
    const img = scene({ fruit: [206, 204, 200], shading: 0, noise: 4 });
    const result = analyze(img);
    expect(result.ok).toBe(false);
    expect(result.confidence).toBe(0);
    expect(result.warnings.length).toBeGreaterThan(0);
  });

  it("girdi görüntüsünü değiştirmez", () => {
    const img = scene({ fruit: [84, 72, 55] });
    const copy = new Uint8ClampedArray(img.data);
    analyze(img);
    expect(img.data).toEqual(copy);
  });

  it("aynı görüntü için her zaman aynı sonucu verir", () => {
    const img = scene({ fruit: [86, 88, 55] });
    const a = analyze(img);
    const b = analyze(img);
    expect(a.topClass).toBe(b.topClass);
    expect(a.confidence).toBeCloseTo(b.confidence, 10);
    expect(a.reasons.map((r) => r.text)).toEqual(b.reasons.map((r) => r.text));
  });
});
