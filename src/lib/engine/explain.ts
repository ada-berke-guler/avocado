import type {
  ColorFeatures,
  ProbabilityMap,
  QualitySignals,
  Reason,
  RipenessClass,
  SkinTone,
} from "../types";
import { RIPENESS } from "../ripeness";
import { chroma } from "./color";
import type { AxisParts } from "./classify";
import { topTwo } from "./classify";
import {
  MASK_AREA_IDEAL_MAX,
  MASK_AREA_IDEAL_MIN,
  SKIN_TONE_LABEL,
} from "./constants";
import type { WhiteBalanceResult } from "./whitebalance";

export interface ExplainInput {
  features: ColorFeatures;
  quality: QualitySignals;
  axisParts: AxisParts;
  skinTone: SkinTone;
  probabilities: ProbabilityMap;
  topClass: RipenessClass;
  wb: WhiteBalanceResult;
  maskArea: number;
}

/**
 * Ölçümlerden okunabilir gerekçeler üretir.
 *
 * LLM YOK, ŞABLON YOK-RASTGELE YOK: cümleler tetiklenen eşiklerden deterministik
 * olarak seçilir. Aynı fotoğraf her zaman aynı gerekçeyi verir — kullanıcı sonucu
 * sorgulayabilsin ve biz kalibrasyonda hangi kuralın konuştuğunu görebilelim diye.
 */
export function explain(input: ExplainInput): { reasons: Reason[]; warnings: Reason[] } {
  const { features: f, quality: q, axisParts: parts, wb } = input;
  const reasons: Reason[] = [];
  const warnings: Reason[] = [];

  // 1) Ana renk gözlemi — her zaman var, sonucun birincil dayanağı.
  reasons.push({
    kind: "color",
    tone: "neutral",
    text: `Kabuk tonu ${SKIN_TONE_LABEL[input.skinTone]}: koyuluk L* ${round(f.L)}, canlılık C* ${round(chroma(f.a, f.b))}.`,
  });

  // 2) Yeşil pigment ekseni
  if (parts.greenLoss >= 0.65) {
    reasons.push({
      kind: "color",
      tone: "neutral",
      text: `Yeşil pigment büyük ölçüde çekilmiş (a* ${dec(f.a)}) — kabuk kahverengiye dönmüş.`,
    });
  } else if (parts.greenLoss <= 0.3) {
    reasons.push({
      kind: "color",
      tone: "neutral",
      text: `Kabuk hâlâ belirgin yeşil (a* ${dec(f.a)}) — renk dönüşümü başlamamış.`,
    });
  } else {
    reasons.push({
      kind: "color",
      tone: "neutral",
      text: `Yeşilden kahverengiye geçişin ortasında (a* ${dec(f.a)}).`,
    });
  }

  // 3) Olgunlaşma benekleri
  if (f.darkSpotRatio >= 0.08) {
    reasons.push({
      kind: "spots",
      tone: "neutral",
      text: `Yüzeyin ${pct(f.darkSpotRatio)}'inde koyu olgunlaşma benekleri var.`,
    });
  } else if (f.darkSpotRatio <= 0.02 && parts.darkness < 0.5) {
    reasons.push({
      kind: "spots",
      tone: "neutral",
      text: "Yüzey tekdüze, olgunlaşma beneği görünmüyor.",
    });
  }

  // 4) Sınırda mıyız? Kullanıcı bunu bilmeyi hak ediyor.
  const { first, second } = topTwo(input.probabilities);
  const runnerUp = runnerUpClass(input.probabilities, input.topClass);
  if (first - second < 0.15 && runnerUp) {
    reasons.push({
      kind: "color",
      tone: "negative",
      text: `Ölçüm iki aşama arasında sınırda: "${RIPENESS[input.topClass].label}" ve "${RIPENESS[runnerUp].label}".`,
    });
  }

  // 5) Ölçüm koşulları iyiyse bunu söylemek güvenin nereden geldiğini açıklar.
  if (q.lightingQuality >= 0.75 && q.sharpness >= 0.55) {
    reasons.push({
      kind: "quality",
      tone: "positive",
      text: "Işık dengeli ve kare net — renk ölçümü güvenilir.",
    });
  }

  // 6) Sınırımız. Her sonuçta görünür; kullanıcı neyi ölçmediğimizi bilmeli.
  reasons.push({
    kind: "limit",
    tone: "neutral",
    text: "Sadece kabuk rengini ölçebiliyorum; sertliği, sapın altını ve iç dokuyu göremiyorum.",
  });

  // ── Uyarılar ──
  if (!wb.applied) {
    warnings.push({
      kind: "quality",
      tone: "negative",
      text: "Arka planda nötr bir yüzey bulamadım, ortam ışığının rengini düzeltemedim.",
    });
  } else if (q.lightingQuality < 0.55) {
    warnings.push({
      kind: "quality",
      tone: "negative",
      text: "Işık dengesiz görünüyor. Gün ışığında, gölgesiz bir yerde tekrar çekersen sonuç daha güvenilir olur.",
    });
  }

  if (q.sharpness < 0.4) {
    warnings.push({
      kind: "quality",
      tone: "negative",
      text: "Kare biraz bulanık. Telefonu sabit tutup tekrar dene.",
    });
  }

  if (input.maskArea < MASK_AREA_IDEAL_MIN) {
    warnings.push({
      kind: "quality",
      tone: "negative",
      text: "Avokado kadrajda küçük kalmış — biraz yaklaşırsan renk ölçümü iyileşir.",
    });
  } else if (input.maskArea > MASK_AREA_IDEAL_MAX) {
    warnings.push({
      kind: "quality",
      tone: "negative",
      text: "Avokado kadraja sığmamış olabilir — biraz uzaklaş.",
    });
  }

  if (q.colorPurity < 0.45) {
    warnings.push({
      kind: "quality",
      tone: "negative",
      text: "Yüzeyde güçlü gölge veya parlama var; renk okuması alacalı çıktı.",
    });
  }

  return { reasons, warnings };
}

function runnerUpClass(p: ProbabilityMap, top: RipenessClass): RipenessClass | null {
  let best: RipenessClass | null = null;
  for (const c of Object.keys(p) as RipenessClass[]) {
    if (c === top) continue;
    if (best === null || p[c] > p[best]) best = c;
  }
  return best;
}

const round = (v: number) => String(Math.round(v));
/** Türkçe ondalık ayırıcı virgüldür. */
const dec = (v: number) => v.toFixed(1).replace(".", ",");
const pct = (v: number) => `%${Math.round(v * 100)}`;
