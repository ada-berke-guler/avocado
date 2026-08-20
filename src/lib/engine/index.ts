import type { AnalysisResult, ProbabilityMap, RGBAImage } from "../types";
import { RIPENESS_CLASSES } from "../types";
import { classify } from "./classify";
import { combineConfidence, computeQuality } from "./confidence";
import { CONFIDENCE_MIN, MASK_AREA_FAIL, SKIN_PLAUSIBLE_MIN_B } from "./constants";
import { explain } from "./explain";
import { computeSharpness, exposureStats, extractFeatures } from "./features";
import { backgroundPrior, segment } from "./segment";
import { whiteBalance } from "./whitebalance";

export { CONFIDENCE_MIN } from "./constants";
export { SKIN_TONE_LABEL } from "./constants";
export type { SkinTone } from "../types";

/**
 * Tek giriş noktası: piksel → sonuç.
 *
 * Saf fonksiyon. Ağ isteği yok, depolama yok, yan etki yok — girdi görüntüsü de
 * değiştirilmez. "Fotoğraf cihazdan çıkmıyor" vaadi bu yüzden tutulabiliyor.
 */
export function analyze(source: RGBAImage): AnalysisResult {
  const started = now();

  // 1) Beyaz denge — referans olarak rehber elipsin dışı kullanılır,
  //    çünkü elipsin içi (avokadonun kendisi) nötr değil, ölçmek istediğimiz şey.
  const wb = whiteBalance(source, backgroundPrior(source.width, source.height));

  // 2) Segmentasyon — düzeltilmiş görüntü üzerinde
  const seg = segment(wb.image);

  // 3) Pozlama, orijinal karede ölçülür: çekim anının sağlığını gösterir.
  const exposure = exposureStats(source);

  if (seg.maskArea < MASK_AREA_FAIL) {
    return rejected(
      "Karede avokadoyu seçemedim. Sade bir zemin üzerinde, çerçeveyi dolduracak şekilde tekrar çek.",
      "mask-too-small",
      wb,
      seg.maskArea,
      exposure,
      now() - started,
    );
  }

  // 4) Öznitelikler + netlik
  const features = extractFeatures(wb.image, seg.mask);
  const sharpnessRaw = computeSharpness(wb.image, seg.mask);

  // 4b) Makullük kapısı: avokado kabuğu yeşilden siyaha kadar her aşamada sarıya çalar
  //     (b* pozitif). Belirgin mavi/mor bir nesne için sınıf uydurmak yerine reddediyoruz.
  if (features.b < SKIN_PLAUSIBLE_MIN_B) {
    return rejected(
      "Çerçevedeki nesne avokado kabuğuna benzemiyor. Avokadoyu çerçeveye alıp tekrar dene.",
      "implausible-skin-color",
      wb,
      seg.maskArea,
      exposure,
      now() - started,
    );
  }

  // 5) Sınıflandırma
  const cls = classify(features);

  // 6) Güven
  const quality = computeQuality({
    wb,
    exposure,
    maskArea: seg.maskArea,
    compactness: seg.compactness,
    sharpnessRaw,
    features,
    probabilities: cls.probabilities,
  });
  const confidence = combineConfidence(quality);

  // 7) Gerekçeler
  const { reasons, warnings } = explain({
    features,
    quality,
    axisParts: cls.axisParts,
    skinTone: cls.skinTone,
    probabilities: cls.probabilities,
    topClass: cls.topClass,
    wb,
    maskArea: seg.maskArea,
  });

  return {
    ok: confidence >= CONFIDENCE_MIN,
    topClass: cls.topClass,
    probabilities: cls.probabilities,
    skinTone: cls.skinTone,
    colorCategory: cls.colorCategory,
    confidence,
    reasons,
    warnings,
    debug: {
      features,
      quality,
      whiteBalanceGain: wb.gain,
      maskArea: seg.maskArea,
      ripenessAxis: cls.axis,
      axisParts: cls.axisParts,
      toneDistances: cls.toneDistances,
      firedRules: [
        ...cls.firedRules,
        wb.applied ? "wb-applied" : "wb-skipped",
        `sharpness-raw=${sharpnessRaw.toFixed(1)}`,
      ],
      elapsedMs: now() - started,
      maskPreview: downsampleMask(seg.mask, source.width, source.height, 128),
    },
  };
}

/**
 * Ölçüm reddedildi. Uydurma bir sınıf döndürmek yerine düz olasılık ve sıfır
 * güvenle dönüyoruz; UI bunu "tekrar dene" ekranı olarak gösterir.
 */
function rejected(
  message: string,
  rule: string,
  wb: ReturnType<typeof whiteBalance>,
  maskArea: number,
  exposure: { clipRatio: number; meanV: number },
  elapsedMs: number,
): AnalysisResult {
  const uniform = Object.fromEntries(
    RIPENESS_CLASSES.map((c) => [c, 1 / RIPENESS_CLASSES.length]),
  ) as ProbabilityMap;

  return {
    ok: false,
    topClass: "breaking",
    probabilities: uniform,
    skinTone: "deep-green",
    colorCategory: "green",
    confidence: 0,
    reasons: [],
    warnings: [
      {
        kind: "quality",
        tone: "negative",
        text: message,
      },
    ],
    debug: {
      features: extractFeatures({ width: 1, height: 1, data: new Uint8ClampedArray(4) }, new Uint8Array(1)),
      quality: {
        lightingQuality: 0,
        maskQuality: 0,
        sharpness: 0,
        colorSeparation: 0,
        colorPurity: 0,
      },
      whiteBalanceGain: wb.gain,
      maskArea,
      ripenessAxis: 0,
      axisParts: { darkness: 0, greenLoss: 0, dullness: 0, spots: 0 },
      toneDistances: {
        "vivid-green": 0,
        "deep-green": 0,
        "brown-purple": 0,
        "near-black": 0,
      },
      firedRules: [rule, `exposure-meanV=${exposure.meanV.toFixed(2)}`],
      elapsedMs,
    },
  };
}

/** Debug overlay için maskeyi küçültür — 512×512'lik diziyi UI'a taşımaya gerek yok. */
function downsampleMask(
  mask: Uint8Array,
  width: number,
  height: number,
  maxEdge: number,
): { width: number; height: number; data: Uint8Array } {
  const scale = Math.min(1, maxEdge / Math.max(width, height));
  const w = Math.max(1, Math.round(width * scale));
  const h = Math.max(1, Math.round(height * scale));
  const out = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    const sy = Math.min(height - 1, Math.floor((y / h) * height));
    for (let x = 0; x < w; x++) {
      const sx = Math.min(width - 1, Math.floor((x / w) * width));
      out[y * w + x] = mask[sy * width + sx];
    }
  }
  return { width: w, height: h, data: out };
}

const now = () =>
  typeof performance !== "undefined" ? performance.now() : Date.now();
