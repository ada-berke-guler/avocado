import type {
  ColorCategory,
  ColorFeatures,
  ProbabilityMap,
  RipenessClass,
  SkinTone,
} from "../types";
import { RIPENESS_CLASSES, SKIN_TONES } from "../types";
import { chroma, clamp, normalize } from "./color";
import {
  A_GREEN,
  A_NEUTRAL,
  AXIS_WEIGHTS,
  CLASS_AXIS_POSITION,
  CLASS_SIGMA,
  C_DULL,
  C_VIVID,
  L_DARK,
  L_LIGHT,
  NEAR_BLACK_MAX_CHROMA,
  NEAR_BLACK_MAX_L,
  PRIOR_SMOOTHING,
  SKIN_TONE_TO_DATASET,
  SPOT_SATURATION_RATIO,
  TONE_BOUNDS,
} from "./constants";
import model from "./model.json";

export interface AxisParts {
  darkness: number;
  greenLoss: number;
  dullness: number;
  spots: number;
}

export interface ClassifyResult {
  skinTone: SkinTone;
  colorCategory: ColorCategory;
  probabilities: ProbabilityMap;
  topClass: RipenessClass;
  /** Olgunluk ekseni üzerindeki sürekli konum, 0-1 */
  axis: number;
  axisParts: AxisParts;
  toneDistances: Record<SkinTone, number>;
  firedRules: string[];
}

/**
 * Sürekli olgunluk ekseni: r ∈ [0,1], 0 = taş gibi ham, 1 = tam olgun.
 *
 * Dört bağımsız sinyalin ağırlıklı toplamı. Tek bir sinyale bağlı kalmamak kritik:
 * koyuluk ışıktan, kroma beyaz dengeden, lekeler segmentasyondan etkilenir —
 * ama hepsi aynı anda aynı yönde yanılmaz.
 */
export function ripenessAxis(f: ColorFeatures): { value: number; parts: AxisParts } {
  const C = chroma(f.a, f.b);

  const parts: AxisParts = {
    // Kabuk olgunlaştıkça koyulaşır: L* 58 → 20
    darkness: normalize(f.L, L_LIGHT, L_DARK),
    // Yeşil pigment kaybı: a* -22 → 0
    greenLoss: normalize(f.a, A_GREEN, A_NEUTRAL),
    // Renk canlılığı kaybı (matlaşma): C* 30 → 6
    dullness: normalize(C, C_VIVID, C_DULL),
    // Olgunlaşma benekleri
    spots: clamp(f.darkSpotRatio / SPOT_SATURATION_RATIO, 0, 1),
  };

  const value =
    parts.darkness * AXIS_WEIGHTS.darkness +
    parts.greenLoss * AXIS_WEIGHTS.greenLoss +
    parts.dullness * AXIS_WEIGHTS.dullness +
    parts.spots * AXIS_WEIGHTS.spots;

  return { value: clamp(value, 0, 1), parts };
}

/** Eksen konumundan kabuk tonuna. Renk bilgisi tükendiyse doğrudan siyaha sabitlenir. */
export function classifySkinTone(
  f: ColorFeatures,
  axis: number,
): { tone: SkinTone; distances: Record<SkinTone, number>; fired: string[] } {
  const fired: string[] = [];
  const distances = {} as Record<SkinTone, number>;

  for (const tone of SKIN_TONES) {
    const [lo, hi] = TONE_BOUNDS[tone];
    distances[tone] = axis < lo ? lo - axis : axis > hi ? axis - hi : 0;
  }

  let tone: SkinTone =
    SKIN_TONES.find((t) => distances[t] === 0) ??
    SKIN_TONES.reduce((best, t) => (distances[t] < distances[best] ? t : best), SKIN_TONES[0]);
  fired.push(`tone=${tone}`);

  // Kroma tükendiyse renk ekseni artık bilgi taşımıyor: kabuk fiilen siyahtır.
  // L* koşulu, gri bir arka planın maskeye sızıp "siyah avokado" sanılmasını engeller.
  const C = chroma(f.a, f.b);
  if (C < NEAR_BLACK_MAX_CHROMA && f.L < NEAR_BLACK_MAX_L) {
    if (tone !== "near-black") fired.push("near-black-override");
    tone = "near-black";
  }

  return { tone, distances, fired };
}

/**
 * Ton (dataset prior'ı) + eksen konumu (ölçüm) → 5 sınıf üzerinde olasılık dağılımı.
 *
 * posterior(c) ∝ prior(c | ton) × exp(-(r - merkez(c))² / 2σ²)
 *
 * Ton kaba kovayı, eksen kova içindeki ince konumu belirler. İkisi çeliştiğinde
 * dağılım doğal olarak yayılır ve bu, güven skoruna düşük colorSeparation olarak yansır —
 * yani uydurma bir kesinlik üretilmez.
 */
export function classify(f: ColorFeatures): ClassifyResult {
  const { value: axis, parts } = ripenessAxis(f);
  const { tone, distances, fired } = classifySkinTone(f, axis);
  const colorCategory = SKIN_TONE_TO_DATASET[tone];

  const counts = model.categoryCounts[colorCategory] as Record<RipenessClass, number>;
  const totalCount = RIPENESS_CLASSES.reduce((s, c) => s + counts[c], 0);
  const denom = totalCount + PRIOR_SMOOTHING * RIPENESS_CLASSES.length;

  const scores = {} as ProbabilityMap;
  let sum = 0;
  for (const c of RIPENESS_CLASSES) {
    // Laplace düzeltmesi: %100'lük ham prior, ölçüm ne derse desin diğer sınıfları
    // tamamen öldürürdü. Dataset baskın kalır ama son sözü söylemez.
    const prior = (counts[c] + PRIOR_SMOOTHING) / denom;
    const d = axis - CLASS_AXIS_POSITION[c];
    const likelihood = Math.exp(-(d * d) / (2 * CLASS_SIGMA * CLASS_SIGMA));
    const s = prior * likelihood;
    scores[c] = s;
    sum += s;
  }

  const probabilities = {} as ProbabilityMap;
  for (const c of RIPENESS_CLASSES) {
    probabilities[c] = sum > 0 ? scores[c] / sum : 1 / RIPENESS_CLASSES.length;
  }

  const topClass = RIPENESS_CLASSES.reduce((best, c) =>
    probabilities[c] > probabilities[best] ? c : best,
  );

  return {
    skinTone: tone,
    colorCategory,
    probabilities,
    topClass,
    axis,
    axisParts: parts,
    toneDistances: distances,
    firedRules: fired,
  };
}

/** Olasılık dağılımının en yüksek iki değeri — güven hesabı ve UI için. */
export function topTwo(p: ProbabilityMap): { first: number; second: number } {
  const sorted = RIPENESS_CLASSES.map((c) => p[c]).sort((a, b) => b - a);
  return { first: sorted[0] ?? 0, second: sorted[1] ?? 0 };
}
