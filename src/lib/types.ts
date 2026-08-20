/**
 * Uygulama genelinde paylaşılan tipler.
 * Motor katmanı (src/lib/engine) bu tiplerden başka hiçbir şeye bağlı değildir —
 * DOM, React veya Next.js import etmez, böylece Vitest'te doğrudan çalışır.
 */

/** Dataset'teki 5 olgunluk sınıfı (endüstri standardı 1-5 skalası). */
export type RipenessClass =
  | "hard"
  | "pre-conditioned"
  | "breaking"
  | "firm-ripe"
  | "ripe";

export const RIPENESS_CLASSES: readonly RipenessClass[] = [
  "hard",
  "pre-conditioned",
  "breaking",
  "firm-ripe",
  "ripe",
] as const;

/**
 * Dataset'teki `color_category` kolonu. Fotoğraftan gerçekten gözlemlenebilen
 * tek köprü bu (bkz. CLAUDE.md Bölüm 0, Bulgu 3).
 * "purple" = yeşilden siyaha giderken oluşan koyu kahve/mor geçiş rengi.
 */
export type ColorCategory = "dark green" | "green" | "purple" | "black";

export const COLOR_CATEGORIES: readonly ColorCategory[] = [
  "dark green",
  "green",
  "purple",
  "black",
] as const;

/**
 * Fotoğraftan okunan kabuk tonu. Dataset'in `color_category` isimleri yerine kendi
 * isimlerimizi kullanıyoruz; eşleme birebir değil (bkz. engine/constants.ts →
 * SKIN_TONE_TO_DATASET, "BİLİNÇLİ SAPMA" notu).
 */
export type SkinTone = "vivid-green" | "deep-green" | "brown-purple" | "near-black";

export const SKIN_TONES: readonly SkinTone[] = [
  "vivid-green",
  "deep-green",
  "brown-purple",
  "near-black",
] as const;

/** Bir olgunluk sınıfının kullanıcıya sunum bilgisi. */
export interface RipenessInfo {
  id: RipenessClass;
  /** 1 (en ham) .. 5 (en olgun) */
  stage: 1 | 2 | 3 | 4 | 5;
  /** Kısa etiket: "Sert / Ham" */
  label: string;
  /** Sonuç ekranı başlığı: "Henüz erken" */
  headline: string;
  /** Ne yapmalı: "4-6 gün daha oda sıcaklığında beklet." */
  advice: string;
  /** Tahmini yenmeye hazır olma aralığı (gün). ripe için ikisi de 0. */
  daysMin: number;
  daysMax: number;
  /** Palet rengi (assets/Screenshot 2026-08-20 204114.png) */
  color: string;
  /** Bu rengin üstüne yazılabilecek AA kontrastlı metin rengi */
  onColor: string;
}

/** Maske içindeki piksellerden çıkarılan ham renk/doku ölçümleri. */
export interface ColorFeatures {
  /** Dairesel medyan hue, 0-360. Sınıflandırmada tek başına kullanılmaz. */
  hue: number;
  /** Hue dağılımının genişliği, 0-1. Yüksek = alacalı yüzey. */
  hueSpread: number;
  /** Medyan doygunluk, 0-1 */
  sat: number;
  /** Medyan parlaklık (HSV V), 0-1 */
  val: number;
  /** CIE L*, 0-100 — koyuluk ekseni, ana sinyal */
  L: number;
  /** CIE a*, negatif = yeşil, pozitif = kırmızı/kahve — yeşilden kahveye kayış */
  a: number;
  /** CIE b*, pozitif = sarı */
  b: number;
  valP10: number;
  valP50: number;
  valP90: number;
  /** Yüzeyin ne kadarı belirgin koyu leke, 0-1 */
  darkSpotRatio: number;
  /** Doku varyansı (L* üzerinden), alacalılık ölçüsü */
  textureVariance: number;
  /** Ölçüme giren piksel sayısı */
  pixelCount: number;
}

/** Güvenin nereden geldiğini oluşturan bileşenler. Hepsi 0-1. */
export interface QualitySignals {
  /** Beyaz denge ne kadar zorlandı + pozlama makul mü */
  lightingQuality: number;
  /** Avokado kadrajın makul bir oranını kaplıyor mu, maske temiz mi */
  maskQuality: number;
  /** Laplacian varyansından türetilen netlik */
  sharpness: number;
  /** En yakın sınıf merkezine yakınlık + 2. sınıfla arasındaki fark */
  colorSeparation: number;
  /** Piksellerin renk dağılımı ne kadar dar */
  colorPurity: number;
}

export type ReasonKind = "color" | "spots" | "quality" | "limit";

/** Kullanıcıya gösterilen tek bir gerekçe maddesi. */
export interface Reason {
  kind: ReasonKind;
  text: string;
  /** Bu gerekçe güveni artırıyor mu azaltıyor mu (UI ikonu için) */
  tone: "positive" | "neutral" | "negative";
}

export type ProbabilityMap = Record<RipenessClass, number>;

/** Test modunun debug paneli için taşınan ham veriler. */
export interface DebugInfo {
  features: ColorFeatures;
  quality: QualitySignals;
  /** Beyaz denge için uygulanan kanal kazançları [r, g, b] */
  whiteBalanceGain: [number, number, number];
  /** Maskenin kadraja oranı, 0-1 */
  maskArea: number;
  /** Olgunluk ekseni üzerindeki sürekli konum, 0 (ham) - 1 (olgun) */
  ripenessAxis: number;
  /** Olgunluk ekseninin bileşenleri — hangi sinyal ne kadar katkı verdi */
  axisParts: { darkness: number; greenLoss: number; dullness: number; spots: number };
  /** Ton sınırlarına göre ölçümün her tona uzaklığı (0 = tam içinde) */
  toneDistances: Record<SkinTone, number>;
  /** Tetiklenen kural isimleri — hangi eşiklerin devreye girdiği */
  firedRules: string[];
  /** Analiz süresi (ms) */
  elapsedMs: number;
  /** Maskenin görsel overlay'i için 0/1 dizisi (küçültülmüş boyutta) */
  maskPreview?: { width: number; height: number; data: Uint8Array };
}

/** analyze() çıktısı. */
export interface AnalysisResult {
  /** false ise güven eşiğin altında kaldı; UI sonuç yerine "tekrar dene" gösterir */
  ok: boolean;
  topClass: RipenessClass;
  probabilities: ProbabilityMap;
  /** Fotoğraftan okunan kabuk tonu */
  skinTone: SkinTone;
  /** Bu tonun karşılık geldiği dataset kategorisi (prior kaynağı) */
  colorCategory: ColorCategory;
  /** 0-1 birleşik güven */
  confidence: number;
  /** Sonucu destekleyen gerekçeler */
  reasons: Reason[];
  /** Fotoğraf kalitesiyle ilgili uyarılar (boş olabilir) */
  warnings: Reason[];
  debug: DebugInfo;
}

/**
 * ImageData ile yapısal olarak uyumlu minimal görüntü tipi.
 * Motorun tarayıcı global'lerine bağlanmaması için ayrı tanımlandı;
 * bir `ImageData` doğrudan bu tipe atanabilir.
 */
export interface RGBAImage {
  width: number;
  height: number;
  data: Uint8ClampedArray;
}
