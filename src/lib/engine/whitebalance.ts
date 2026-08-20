import type { RGBAImage } from "../types";
import { clamp, linearToSrgb, luminance, rgbToHsv, srgbToLinear } from "./color";
import {
  WB_CLIPPED_V,
  WB_GAIN_MAX,
  WB_GAIN_MIN,
  WB_MIN_REFERENCE_RATIO,
  WB_REFERENCE_MAX_SAT,
  WB_REFERENCE_MIN_V,
  WB_WHITE_PATCH_RATIO,
} from "./constants";

export interface WhiteBalanceResult {
  /** Düzeltilmiş yeni görüntü (girdi değiştirilmez) */
  image: RGBAImage;
  /** Uygulanan kanal kazançları [r, g, b] */
  gain: [number, number, number];
  /** Referans olarak kullanılabilen piksel oranı */
  referenceRatio: number;
  /** Yeterli/uygun referans bulunamadıysa false — düzeltme yapılmadı */
  applied: boolean;
  /** Kazançların sınıra dayanma miktarı, 0-1. Yüksek = ışık zaten sorunlu. */
  strain: number;
}

/**
 * Beyaz denge düzeltmesi — "beyaz yama" (white patch) yöntemi.
 *
 * NEDEN GEREKLİ: Ortam ışığı (tungsten, floresan, gölge) kabuk rengini 20-30° hue
 * kaydırabilir. Bu adım olmadan sarı ışıkta çekilmiş ham bir avokado "kahverengi",
 * mavi gölgede çekilmiş olgun bir avokado "yeşil" ölçülür.
 *
 * NEDEN GRAY-WORLD DEĞİL: Klasik gray-world tüm kareyi nötrleştirir. Kadrajın büyük
 * kısmı yeşil bir avokado olduğunda bu, avokadonun yeşilini "ışık hatası" sanıp siler —
 * yani tam da ölçmek istediğimiz sinyali yok eder. Bu yüzden referans olarak SADECE
 * rehber elipsin DIŞINDAKİ pikselleri kullanıyoruz.
 *
 * NEDEN EN PARLAK DİLİM: Sahnedeki en parlak yüzey, ışığı en az filtrelenmiş haliyle
 * yansıtır; ışık kaynağının rengine en yakın örnek odur.
 *
 * GÜVENLİK KAPISI: Referans kümesinin ortalama doygunluğu WB_REFERENCE_MAX_SAT'i
 * aşarsa arka plan gerçekten renklidir (yeşil örtü vb.) ve düzeltme yapılmaz —
 * yanlış düzeltme, düzeltmemekten daha zararlıdır.
 *
 * @param background 1 = referans olabilecek arka plan pikseli (elips dışı)
 */
export function whiteBalance(img: RGBAImage, background: Uint8Array): WhiteBalanceResult {
  const { width, height, data } = img;
  const total = width * height;

  const candidates: { i: number; lum: number; sat: number }[] = [];
  for (let i = 0; i < total; i++) {
    if (!background[i]) continue;
    const p = i * 4;
    const [, s, v] = rgbToHsv(data[p], data[p + 1], data[p + 2]);
    // Gölge beyaz noktayı kaydırır, yanmış piksel renk bilgisi taşımaz.
    if (v < WB_REFERENCE_MIN_V || v > WB_CLIPPED_V) continue;
    candidates.push({ i, lum: luminance(data[p], data[p + 1], data[p + 2]), sat: s });
  }

  const out: RGBAImage = { width, height, data: new Uint8ClampedArray(data) };
  const skip = (referenceRatio: number): WhiteBalanceResult => ({
    image: out,
    gain: [1, 1, 1],
    referenceRatio,
    applied: false,
    strain: 1,
  });

  if (candidates.length / total < WB_MIN_REFERENCE_RATIO) {
    return skip(candidates.length / total);
  }

  // En parlak dilim = beyaz yama
  candidates.sort((a, b) => b.lum - a.lum);
  const patch = candidates.slice(
    0,
    Math.max(32, Math.round(candidates.length * WB_WHITE_PATCH_RATIO)),
  );
  const referenceRatio = patch.length / total;

  const meanSat = patch.reduce((s, c) => s + c.sat, 0) / patch.length;
  if (meanSat > WB_REFERENCE_MAX_SAT) {
    // Arka plan renkli: beyaz referansı yok.
    return skip(referenceRatio);
  }

  // Ortalama doğrusal uzayda alınır; sRGB'de alınan ortalama fiziksel olarak yanlıştır.
  let sumR = 0;
  let sumG = 0;
  let sumB = 0;
  for (const c of patch) {
    const p = c.i * 4;
    sumR += srgbToLinear(data[p] / 255);
    sumG += srgbToLinear(data[p + 1] / 255);
    sumB += srgbToLinear(data[p + 2] / 255);
  }
  if (sumR === 0 || sumB === 0 || sumG === 0) return skip(referenceRatio);

  const mR = sumR / patch.length;
  const mG = sumG / patch.length;
  const mB = sumB / patch.length;

  // Yeşil kanal sabit tutulur → pozlama korunur, sadece renk sıcaklığı düzelir.
  const rawR = mG / mR;
  const rawB = mG / mB;
  const gainR = clamp(rawR, WB_GAIN_MIN, WB_GAIN_MAX);
  const gainB = clamp(rawB, WB_GAIN_MIN, WB_GAIN_MAX);

  // Kazanç sınıra ne kadar dayandıysa ışık o kadar sorunlu demektir.
  const limit = Math.abs(Math.log(WB_GAIN_MAX));
  const strain = clamp(
    Math.max(Math.abs(Math.log(rawR)), Math.abs(Math.log(rawB))) / limit,
    0,
    1,
  );

  for (let i = 0; i < total; i++) {
    const p = i * 4;
    const lr = srgbToLinear(out.data[p] / 255) * gainR;
    const lb = srgbToLinear(out.data[p + 2] / 255) * gainB;
    out.data[p] = Math.round(linearToSrgb(clamp(lr, 0, 1)) * 255);
    out.data[p + 2] = Math.round(linearToSrgb(clamp(lb, 0, 1)) * 255);
  }

  return { image: out, gain: [gainR, 1, gainB], referenceRatio, applied: true, strain };
}
