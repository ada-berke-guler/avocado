import type { ColorFeatures, ProbabilityMap, QualitySignals } from "../types";
import { RIPENESS_CLASSES } from "../types";
import { chroma, clamp, normalize } from "./color";
import {
  CONFIDENCE_WEIGHTS,
  EXPOSURE_CLIP_LIMIT,
  EXPOSURE_V_MAX,
  EXPOSURE_V_MIN,
  MASK_AREA_IDEAL_MAX,
  MASK_AREA_IDEAL_MIN,
  NEAR_BLACK_MAX_CHROMA,
  SHARPNESS_BLURRY,
  SHARPNESS_SHARP,
} from "./constants";
import { topTwo } from "./classify";
import type { WhiteBalanceResult } from "./whitebalance";

export interface QualityInput {
  wb: WhiteBalanceResult;
  exposure: { clipRatio: number; meanV: number };
  maskArea: number;
  compactness: number;
  sharpnessRaw: number;
  features: ColorFeatures;
  probabilities: ProbabilityMap;
}

/**
 * Güven bileşenleri. Her biri 0-1 ve her biri kullanıcıya gerekçe olarak
 * gösterilebilecek somut bir şeyi ölçer — "model %87 dedi" gibi anlamsız bir
 * sayı yerine "ışık iyi, kare net, renk sınıra yakın değil" diyebilmek için.
 */
export function computeQuality(input: QualityInput): QualitySignals {
  return {
    lightingQuality: lightingQuality(input),
    maskQuality: maskQuality(input),
    sharpness: normalize(input.sharpnessRaw, SHARPNESS_BLURRY, SHARPNESS_SHARP),
    colorSeparation: colorSeparation(input.probabilities),
    colorPurity: colorPurity(input.features),
  };
}

function lightingQuality({ wb, exposure }: QualityInput): number {
  // Nötr referans bulunamadıysa renk sıcaklığını doğrulayamadık: orta seviyede kal.
  const wbTerm = wb.applied ? 1 - 0.6 * wb.strain : 0.55;
  // Yanmış pikseller kabuk rengini beyaza çeker.
  const clipTerm = 1 - 0.7 * clamp(exposure.clipRatio / EXPOSURE_CLIP_LIMIT, 0, 1);
  // Fazla karanlık veya fazla aydınlık kare, renk ölçümünü sıkıştırır.
  const expoTerm =
    exposure.meanV < EXPOSURE_V_MIN
      ? normalize(exposure.meanV, 0, EXPOSURE_V_MIN)
      : exposure.meanV > EXPOSURE_V_MAX
        ? normalize(exposure.meanV, 1, EXPOSURE_V_MAX)
        : 1;

  return clamp(wbTerm * clipTerm * expoTerm, 0.02, 1);
}

function maskQuality({ maskArea, compactness }: QualityInput): number {
  // İdeal bantta 1, dışına çıkınca yumuşak düşüş.
  const areaTerm =
    maskArea < MASK_AREA_IDEAL_MIN
      ? normalize(maskArea, 0, MASK_AREA_IDEAL_MIN)
      : maskArea > MASK_AREA_IDEAL_MAX
        ? normalize(maskArea, 1, MASK_AREA_IDEAL_MAX)
        : 1;

  // Avokado dışbükey ve pürüzsüz; saçaklı maske yanlış segmentasyon demektir.
  const shapeTerm = normalize(compactness, 0.3, 0.8);

  return clamp(Math.sqrt(areaTerm * shapeTerm), 0.02, 1);
}

/**
 * Dağılım ne kadar keskin? İki sinyal:
 *  - en yüksek iki sınıf arasındaki fark (sınırda mıyız?)
 *  - dağılımın entropisi (genel kararsızlık)
 */
function colorSeparation(p: ProbabilityMap): number {
  const { first, second } = topTwo(p);
  const marginTerm = normalize(first - second, 0.04, 0.42);

  let entropy = 0;
  for (const c of RIPENESS_CLASSES) {
    const v = p[c];
    if (v > 0) entropy -= v * Math.log(v);
  }
  const maxEntropy = Math.log(RIPENESS_CLASSES.length);
  const entropyTerm = 1 - clamp(entropy / maxEntropy, 0, 1);

  return clamp(0.7 * marginTerm + 0.3 * entropyTerm, 0.02, 1);
}

/** Yüzey ne kadar tekdüze? Alacalı / lekeli yüzeyde tek bir renk ölçümü daha az anlamlı. */
function colorPurity(f: ColorFeatures): number {
  // Kroma tükendiğinde hue matematiksel olarak gürültüdür; onu ceza olarak yazmak
  // olgun (siyah) avokadoları haksız yere cezalandırırdı.
  const hueMeaningful = chroma(f.a, f.b) >= NEAR_BLACK_MAX_CHROMA;
  const spreadTerm = hueMeaningful ? 1 - normalize(f.hueSpread, 0.15, 0.6) : 0.85;

  // L* varyansı: düzgün kabuk < 40, alacalı/gölgeli yüzey > 200
  const textureTerm = 1 - normalize(f.textureVariance, 40, 220);

  return clamp(Math.sqrt(spreadTerm * textureTerm), 0.02, 1);
}

/**
 * Bileşenleri tek bir güvene indirger — AĞIRLIKLI GEOMETRİK ORTALAMA.
 *
 * Neden aritmetik değil: fotoğraf bulanıksa sonuç güvenilmezdir, diğer dört
 * bileşenin mükemmel olması bunu telafi etmez. Geometrik ortalamada tek bir
 * düşük bileşen sonucu aşağı çeker; aritmetik ortalamada maskelenirdi.
 */
export function combineConfidence(q: QualitySignals): number {
  const w = CONFIDENCE_WEIGHTS;
  const terms: [number, number][] = [
    [q.lightingQuality, w.lightingQuality],
    [q.maskQuality, w.maskQuality],
    [q.sharpness, w.sharpness],
    [q.colorSeparation, w.colorSeparation],
    [q.colorPurity, w.colorPurity],
  ];

  let logSum = 0;
  let weightSum = 0;
  for (const [value, weight] of terms) {
    logSum += weight * Math.log(clamp(value, 0.02, 1));
    weightSum += weight;
  }
  return clamp(Math.exp(logSum / weightSum), 0, 1);
}
