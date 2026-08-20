/**
 * FOTOĞRAF UZAYI EŞİKLERİ.
 *
 * model.json dataset'ten üretilir ve kategori→sınıf önsel olasılıklarını verir.
 * Buradaki sabitler ise gerçek kamera görüntüsünden ölçülen değerlerin hangi
 * kategoriye düştüğünü belirler — dataset bu bilgiyi veremez (bkz. CLAUDE.md Bölüm 0).
 *
 * KURAL: Sihirli sayı yok. Her eşiğin yanında neden o değerde olduğu yazar.
 * Faz 6'da gerçek fotoğraflarla kalibre edilecek; değiştirirken yorumu da güncelle.
 */

import type { ColorCategory, RipenessClass, SkinTone } from "../types";

/** Kullanıcıya gösterilecek ton adı. */
export const SKIN_TONE_LABEL: Record<SkinTone, string> = {
  "vivid-green": "canlı yeşil",
  "deep-green": "koyu yeşil",
  "brown-purple": "kahverengi-mor",
  "near-black": "siyaha yakın",
};

/**
 * Ölçülen ton → dataset kategorisi (model.json'daki prior'ları çekmek için).
 *
 * DİKKAT — BİLİNÇLİ SAPMA: Dataset "dark green"i `hard`, "green"i `pre-conditioned`
 * olarak etiketliyor ve "dark green"in ortalama parlaklığı (55.1) "green"den (69.0) düşük.
 * Yani dataset'e göre daha KOYU yeşil daha HAM demek. Bu fiziksel olarak tersine:
 * Hass avokado olgunlaştıkça kabuk koyulaşır, açılmaz.
 *
 * Dataset sentetik olduğu için (bkz. Bulgu 2) bu sıralamayı fizik lehine çeviriyoruz:
 * dataset'ten sadece "yeşil aile = {hard, pre-conditioned}" küme bilgisini alıyoruz,
 * küme içi sıralamayı koyuluğa göre kendimiz yapıyoruz.
 *
 * Zaten renkten hard/pre-conditioned ayrımı doğası gereği zayıftır (ikisi de yeşildir);
 * bu belirsizlik uydurma bir kesinlik yerine düşük güven olarak raporlanır.
 */
export const SKIN_TONE_TO_DATASET: Record<SkinTone, ColorCategory> = {
  "vivid-green": "dark green", // → hard
  "deep-green": "green", // → pre-conditioned
  "brown-purple": "purple", // → breaking / firm-ripe
  "near-black": "black", // → firm-ripe / ripe
};

// ─────────────────────────────────────────────────────────────
// Görüntü hazırlığı
// ─────────────────────────────────────────────────────────────

/**
 * Analiz çözünürlüğü (uzun kenar). 512px, renk medyanı için fazlasıyla yeterli;
 * daha büyüğü segmentasyonu yavaşlatır, daha küçüğü doku/leke sinyalini yok eder.
 */
export const ANALYSIS_MAX_EDGE = 512;

// ─────────────────────────────────────────────────────────────
// Beyaz denge
// ─────────────────────────────────────────────────────────────

/**
 * Referans kümesinin ORTALAMA doygunluğu bunu aşarsa arka plan gerçekten renklidir
 * (yeşil masa örtüsü gibi) ve beyaz referansı olamaz → düzeltme yapılmaz.
 *
 * Bu eşik neden piksel bazlı değil: düzeltmek istediğimiz sıcak/soğuk ışık, nötr bir
 * duvarı zaten doygun gösterir (tungsten altında beyaz duvar s≈0.30). Piksel bazlı
 * "doygunsa referans olamaz" kuralı tam da düzeltilmesi gereken kareleri elerdi.
 */
export const WB_REFERENCE_MAX_SAT = 0.45;

/**
 * Beyaz yama oranı: arka planın en parlak bu dilimi beyaz referansı sayılır.
 * En parlak bölge sahnedeki ışığı en az filtrelenmiş haliyle taşır.
 */
export const WB_WHITE_PATCH_RATIO = 0.3;
/** Referans pikselin en az bu kadar parlak olması gerekir (gölge, beyaz noktayı kaydırır). */
export const WB_REFERENCE_MIN_V = 0.35;
/** Kırpılmış (yanmış) piksel eşiği — beyaz referansı bozar, dışlanır. */
export const WB_CLIPPED_V = 0.97;
/** Güvenilir bir düzeltme için gereken minimum nötr referans piksel oranı. */
export const WB_MIN_REFERENCE_RATIO = 0.02;
/** Kanal kazançlarının izin verilen aralığı. Dışına taşma = ışık zaten sorunlu. */
export const WB_GAIN_MIN = 0.72;
export const WB_GAIN_MAX = 1.45;

// ─────────────────────────────────────────────────────────────
// Segmentasyon
// ─────────────────────────────────────────────────────────────

/** Rehber çerçeve elipsi — kullanıcı avokadoyu buraya hizalar, öncelik oradan başlar. */
export const GUIDE_ELLIPSE_RX = 0.44; // kadraj genişliğinin oranı
export const GUIDE_ELLIPSE_RY = 0.47;

/** Bu kadar parlak ve renksiz pikseller arka plandır (masa, tezgah, duvar). */
export const BG_BRIGHT_V = 0.8;
export const BG_BRIGHT_MAX_SAT = 0.2;

/**
 * Arka planın medyan rengine bu ΔE'den yakın pikseller arka plan sayılır.
 * 14 ≈ "açıkça farklı renk" sınırı: aynı tonun gölgeli/aydınlık varyasyonlarını
 * ayırmaz (iyi), ama yeşil avokado ile bej tezgahı ayırır.
 */
export const BG_SIMILARITY_DE = 14;

/** Ten rengi bandı — avokadoyu elde tutan parmakları ölçümden çıkarır. */
export const SKIN_HUE_MIN = 5;
export const SKIN_HUE_MAX = 45;
export const SKIN_MIN_SAT = 0.15;
export const SKIN_MAX_SAT = 0.62;
export const SKIN_MIN_V = 0.32;

/** Parlama (specular) pikselleri rengi beyaza doğru çeker — en parlak bu oran atılır. */
export const SPECULAR_TRIM_RATIO = 0.08;
/** Gölgeli kenar pikselleri yapay koyuluk üretir — en karanlık bu oran atılır. */
export const SHADOW_TRIM_RATIO = 0.05;

/** Maske kadrajın bu aralığında olmalı; dışı "çok uzak" / "çok yakın" demektir. */
export const MASK_AREA_IDEAL_MIN = 0.14;
export const MASK_AREA_IDEAL_MAX = 0.72;
/** Bu oranın altında maske kaldıysa avokado bulunamamış sayılır. */
export const MASK_AREA_FAIL = 0.04;

// ─────────────────────────────────────────────────────────────
// Olgunluk ekseni (r ∈ 0..1)
// ─────────────────────────────────────────────────────────────

/**
 * Koyuluk ekseni. Ham Hass kabuğu L* ≈ 55-60, tam olgun (siyah) L* ≈ 18-22.
 * Bu iki uç 0 ve 1'e karşılık gelir.
 */
export const L_LIGHT = 58;
export const L_DARK = 20;

/**
 * Krom ekseni: taze kabuk canlı (C* ≈ 30+), tam olgun kabuk neredeyse renksiz (C* ≈ 3).
 * Alt uç 6 değil 3: 6'da doyduğunda son iki aşama aynı görünüyordu.
 */
export const C_VIVID = 30;
export const C_DULL = 3;

/**
 * Yeşillik: a* = -22 tam yeşil kabuk, a* = +5 yeşillik tamamen bitmiş.
 * Üst uç 0 değil +5: kararmış kabukta kahverengileşme a*'ı hafif pozitife taşır ve
 * eksen 0'da doyarsa firm-ripe ile ripe ayırt edilemez hale gelir.
 */
export const A_GREEN = -22;
export const A_NEUTRAL = 5;

/** Koyu leke oranı bu değere ulaştığında sinyal doyar. */
export const SPOT_SATURATION_RATIO = 0.25;
/** Bir piksel, maske medyanından bu kadar koyuysa "leke" sayılır (L* farkı). */
export const SPOT_L_DELTA = 12;

/**
 * Olgunluk ekseninin bileşen ağırlıkları. Toplamı 1.
 * Koyuluk en güvenilir sinyal (ışıktan en az etkilenen, en geniş dinamik aralığa sahip),
 * bu yüzden en yüksek ağırlıkta. Lekeler en gürültülü sinyal, en düşük ağırlıkta.
 */
export const AXIS_WEIGHTS = {
  darkness: 0.45,
  greenLoss: 0.25,
  dullness: 0.2,
  spots: 0.1,
} as const;

// ─────────────────────────────────────────────────────────────
// Ton (kategori) sınırları — olgunluk ekseni üzerinde
// ─────────────────────────────────────────────────────────────

/**
 * Ton sınırları doğrudan r ekseninde tanımlanır; böylece kategori ve eksen
 * birbiriyle tutarlı kalır ve tek bir kalibrasyon noktası olur.
 */
export const TONE_BOUNDS: Record<SkinTone, [number, number]> = {
  "vivid-green": [0.0, 0.22],
  "deep-green": [0.22, 0.46],
  // Üst sınır 0.78: yeşillik ve kroma bileşenleri bu bölgede doyduğu için eksenin
  // üst ucu sıkışır. 0.74'te kahverengi-mor bir kabuk "siyah" kovasına düşüyor ve
  // siyahın ripe-ağırlıklı prior'ı firm-ripe'ı eziyordu.
  "brown-purple": [0.46, 0.78],
  "near-black": [0.78, 1.0],
};

/**
 * Avokado kabuğu her aşamada sarıya çalar (b* pozitif): yeşil → zeytin → kahve → siyah
 * yolunun tamamı sarı-kırmızı çeyrektedir. Belirgin negatif b* (mavi/mor bir nesne)
 * avokado kabuğu değildir — sonuç uydurmak yerine ölçümü reddediyoruz.
 * -5, tam siyah kabukta ölçüm gürültüsüne pay bırakır.
 */
export const SKIN_PLAUSIBLE_MIN_B = -5;

/** Kroma bu değerin altındaysa renk bilgisi kalmamıştır — ton doğrudan siyaha sabitlenir. */
export const NEAR_BLACK_MAX_CHROMA = 8;
/** ...ve L* de bu değerin altında olmalı ki gri bir arka planı siyah sanmayalım. */
export const NEAR_BLACK_MAX_L = 30;

// ─────────────────────────────────────────────────────────────
// Sınıflandırma
// ─────────────────────────────────────────────────────────────

/**
 * Her sınıfın olgunluk ekseni üzerindeki merkezi. Eşit aralıklı:
 * 5 sınıf, ham (0.1) → olgun (0.9).
 */
export const CLASS_AXIS_POSITION: Record<RipenessClass, number> = {
  hard: 0.1,
  "pre-conditioned": 0.3,
  breaking: 0.5,
  "firm-ripe": 0.7,
  ripe: 0.9,
};

/**
 * Olabilirlik çanının genişliği. Sınıf merkezleri 0.2 aralıklı; σ=0.16 komşu sınıflara
 * anlamlı olasılık bırakır (gerçekte sınırlar keskin değildir) ama 2 sınıf ötesini söndürür.
 */
export const CLASS_SIGMA = 0.16;

/**
 * Laplace düzeltme katsayısı. Dataset kategori başına 50 örnek içeriyor ve bazı
 * kategorilerde tek sınıf %100. α=2.5 ile %100'lük prior ≈ %84'e iner: dataset hâlâ
 * baskın kalır ama ölçüm güçlü şekilde aksini söylüyorsa komşu sınıf kazanabilir.
 */
export const PRIOR_SMOOTHING = 2.5;

// ─────────────────────────────────────────────────────────────
// Güven
// ─────────────────────────────────────────────────────────────

/**
 * Güven bileşenlerinin ağırlıkları (ağırlıklı geometrik ortalama).
 * Geometrik ortalama seçildi: tek bir bileşen çok kötüyse (ör. fotoğraf bulanık)
 * sonuç toptan düşer — aritmetik ortalamada diğerleri bunu maskelerdi.
 */
export const CONFIDENCE_WEIGHTS = {
  lightingQuality: 0.22,
  maskQuality: 0.2,
  sharpness: 0.15,
  colorSeparation: 0.28,
  colorPurity: 0.15,
} as const;

/** Bunun altında sonuç gösterilmez; kullanıcıya "tekrar dene" ekranı çıkar. */
export const CONFIDENCE_MIN = 0.55;

/** Netlik normalizasyonu: Laplacian varyansı bu değerin altı bulanık, üstü nettir. */
export const SHARPNESS_BLURRY = 12;
export const SHARPNESS_SHARP = 120;

/** Kadrajın bu oranından fazlası yanmışsa pozlama bozuktur. */
export const EXPOSURE_CLIP_LIMIT = 0.06;
/** Ortalama parlaklık bu aralığın dışındaysa kare fazla karanlık / fazla aydınlık. */
export const EXPOSURE_V_MIN = 0.16;
export const EXPOSURE_V_MAX = 0.88;
