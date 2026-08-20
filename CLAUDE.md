# Avokado Olgunluk Testi — Teknik Plan

Mobil tarayıcıda çalışan (native app değil), tek seferlik, fotoğraf saklamayan bir avokado
olgunluk analiz uygulaması. Kullanıcı telefonuyla avokadonun fotoğrafını çeker; uygulama
kabuk rengi analizinden olgunluk tahmini + gerekçe + güven skoru üretir.

**Durum (2026-08-20):** Faz 1-4 tamam — MVP çalışıyor, `npm run build` ve 17 birim testi
geçiyor. Sırada Faz 5 (Vercel deploy) ve Faz 6 (gerçek fotoğraflarla kalibrasyon) var.

---

## 0. Önce: Dataset Gerçeği (ONAY ÖNCESİ OKU)

`dataset/avocado_ripeness_dataset.csv` incelendi. 250 satır, 5 sınıf (her biri 50 adet).
Kolonlar: `firmness, hue, saturation, brightness, color_category, sound_db, weight_g, size_cm3, ripeness`

**Bulgu 1 — Bu bir görüntü dataseti değil, tablo dataseti.**
9 kolondan sadece 4'ü (`hue, saturation, brightness, color_category`) fotoğraftan elde edilebilir.
`firmness` (sertlik), `sound_db` (fiske sesi), `weight_g` (tartı), `size_cm3` (hacim) fiziksel
ölçümlerdir — kameradan çıkmaz. Yani datasetin bilgi gücünün yarısından fazlası bizim için kullanılamaz.

**Bulgu 2 — Dataset sentetik; sınıflar kusursuz ayrık.**
Her sınıfın feature aralıkları hiç kesişmiyor (örn. firmness: ripe 10-19, firm-ripe 20-38,
breaking 40-59, pre-conditioned 60-78, hard 80-99). `sound_db` tek başına 5 sınıfı %100 ayırıyor.
Bu veriyle eğitilen herhangi bir model %100 accuracy verir ve **bu sayı hiçbir şey ifade etmez.**
Gerçek doğruluk ancak gerçek fotoğraflarla ölçülebilir → bu yüzden Test Modu MVP'nin parçası.

**Bulgu 3 — `hue` kolonu gerçek kamera HSV'si değil.**
`color_category` bazında hue aralıkları: `purple` 270-329°, `black` 1-29°, `dark green` 60-119°,
`green` 46-89°. Gerçek avokado kabuğunda 270-329° (macenta/mor) hue fiziksel olarak oluşmaz;
olgunlaşan kabuk yeşil (~60-140°) → düşük doygunluklu koyu kahve/siyaha gider. Yani datasetin
hue ekseni stilize bir kodlama. **Kameradan gelen ham hue'yu bu tabloya doğrudan bağlamak çöp
sonuç üretir.**

**Bulgu 4 — Yeşil kategorilerin sıralaması fiziksel olarak ters.**
Dataset `dark green`i `hard`, `green`i `pre-conditioned` sayıyor; ortalama parlaklıklar
55.1 ve 69.0. Yani dataset'e göre daha KOYU yeşil daha HAM. Gerçekte Hass avokado
olgunlaştıkça kabuk koyulaşır, açılmaz. Dataset'ten sadece "yeşil aile = {hard,
pre-conditioned}" küme bilgisini alıp küme içi sıralamayı koyuluğa göre kendimiz
yapıyoruz. Bu sapma `engine/constants.ts` → `SKIN_TONE_TO_DATASET` içinde belgeli.
Zaten renkten hard/pre-conditioned ayrımı doğası gereği zayıf (ikisi de yeşil); bu
belirsizlik uydurma kesinlik yerine düşük güven olarak raporlanıyor.

**Bu yüzden köprümüz `color_category`.**
Fotoğraftan ölçülen renk → `dark green | green | purple (koyu kahve-mor geçiş) | black`
kategorisine sınıflandırılır, kategori→olgunluk eşlemesi datasetten alınır:

| color_category | ripeness | dataset n |
|---|---|---|
| dark green | hard | 50 |
| green | pre-conditioned | 50 |
| purple | breaking (50) / firm-ripe (25) | 75 |
| black | ripe (50) / firm-ripe (25) | 75 |

`purple` ve `black` iki sınıfa birden gidiyor → ayrıştırma için ikincil eksen olarak
**parlaklık (V/L*) ve doygunluk (S)** kullanılır (dataset: black avgBri=22.9, purple avgBri=44.6).

**Sonuç:** MVP'de dataset, ML modeli eğitmek için değil, **kural motorunun sınıf sınırlarını ve
öncelikli olasılıklarını kalibre etmek** için kullanılacak. Gerçek CNN için görüntü dataseti
gerekli (Faz 7) — Kaggle'dan avokado *fotoğraf* dataseti bulunup yüklenmesi gerekecek.

---

## 1. Ürün Kararları

- **Platform:** Mobil-first responsive web (kurulum yok). Masaüstü çalışır ama tasarım telefona göre.
- **Akış:** Tek fotoğraf yeterli. Opsiyonel 2. kare (sap/göbek bölgesi) güveni artırır — Faz 7.
- **Gizlilik:** Fotoğraf **cihazdan hiç çıkmaz.** Tüm analiz tarayıcıda (Canvas + JS). Sunucuya
  upload yok, DB yok, log yok, çerez yok. "Fotoğrafın telefonundan çıkmıyor" ekranda yazılı vaat.
- **Oturum:** State sadece bellekte. Sayfa yenilenince her şey sıfırlanır.
- **Dil:** Türkçe (birincil). i18n altyapısı hazır bırakılır, EN Faz 7.
- **Maliyet:** 0. Client-side analiz → Vercel free tier'da sınırsız çalışır.

### Olgunluk Skalası (endüstri standardı 1-5, dataset ile birebir)

| # | ripeness | TR etiket | Kullanıcıya mesaj | Renk |
|---|---|---|---|---|
| 1 | hard | Sert / Ham | ~4-6 gün bekle | `#D4E157` |
| 2 | pre-conditioned | Ön Olgunlaşma | ~3-4 gün bekle | `#A4C639` |
| 3 | breaking | Olgunlaşmaya Başlamış | ~2-3 gün | `#689F38` |
| 4 | firm-ripe | Sıkı-Olgun | 1-2 gün. Dilimlemek/salata için ideal | `#558B2F` |
| 5 | ripe | Olgun / Hazır | Bugün ye. Guacamole zamanı | `#2C3E50` |

---

## 2. Renk Sistemi (assets/Screenshot 2026-08-20 204114.png)

```css
--av-unripe:  #D4E157;  /* HAM */
--av-medium:  #A4C639;  /* YARIM OLGUN */
--av-ripe:    #558B2F;  /* TAM OLGUN */
--av-ready:   #DCE775;  /* HAZIR — birincil aksan / CTA */
--av-natural: #689F38;  /* DOĞAL */
--av-fresh:   #C5E1A5;  /* TAZE — yüzey/kart zemini */
--av-skin:    #2C3E50;  /* KABUK — metin & koyu zemin */
```

Kural: `--av-skin` metin rengi, `--av-fresh` kart zemini, `--av-ready` tek birincil CTA rengi.
Sonuç ekranının vurgu rengi = tahmin edilen sınıfın rengi. Kontrast AA (4.5:1) zorunlu;
`--av-ready` / `--av-unripe` üstüne asla beyaz metin yazma, `--av-skin` kullan.
Dark mode Faz 7.

---

## 3. Teknik Stack

| Katman | Seçim | Neden |
|---|---|---|
| Framework | Next.js 15 (App Router) + TypeScript | Vercel'e sıfır konfig deploy |
| Stil | Tailwind CSS v4 + CSS değişkenleri | Palet token'ları tek yerde |
| Kamera | `getUserMedia` (canlı önizleme) + `<input capture>` fallback | iOS Safari uyumu |
| Analiz | Canvas 2D + saf TS (bağımlılıksız) | Bundle küçük, cihazda çalışır |
| Model | Build-time üretilen `model.json` (~5KB) | Runtime'da fetch yok |
| Test | Vitest (engine birim testleri) + fixture fotoğraflar | Regresyon koruması |
| Deploy | Vercel (static) | Kullanıcı isteği |

Sunucu tarafı **yok**. API route yok. Bu, gizlilik vaadinin teknik garantisi.

---

## 4. Klasör Yapısı

```
avokado/
├── CLAUDE.md
├── assets/                      # palet görseli (kaynak, build'e girmez)
├── dataset/
│   └── avocado_ripeness_dataset.csv
├── scripts/
│   └── build-model.ts           # CSV → src/lib/engine/model.json
├── public/
│   └── fixtures/                # test modu için örnek fotoğraflar (opsiyonel)
└── src/
    ├── app/
    │   ├── layout.tsx           # tema, font, meta
    │   ├── page.tsx             # landing + "Kamerayı Aç"
    │   ├── analiz/page.tsx      # kamera → çekim → sonuç (tek sayfa akışı)
    │   └── test/page.tsx        # TEST MODU
    ├── components/
    │   ├── CameraCapture.tsx    # getUserMedia + shutter + canlı kadraj ipuçları
    │   ├── AvocadoMark.tsx      # marka/sonuç işareti (inline SVG)
    │   ├── GuideOverlay.tsx     # çerçeve, "avokadoyu buraya sığdır" rehberi
    │   ├── ResultCard.tsx       # sınıf + gün tahmini + renk
    │   ├── ConfidenceMeter.tsx  # güven barı
    │   ├── ReasonList.tsx       # "neden böyle düşündük" maddeleri
    │   └── DebugPanel.tsx       # sadece test modu
    └── lib/
        ├── engine/          # saf TS — DOM/React yok, Vitest'te doğrudan çalışır
        │   ├── model.json       # build-time üretilir, elle düzenlenmez
        │   ├── constants.ts     # fotoğraf uzayı eşikleri, her biri gerekçeli
        │   ├── color.ts         # sRGB↔Lab/HSV, dairesel hue istatistiği, medyan
        │   ├── decode.ts        # blob/video → ImageData (EXIF, kırpma, downscale)
        │   ├── whitebalance.ts  # beyaz yama düzeltmesi (elips DIŞI referans)
        │   ├── segment.ts       # maske: ön eleme → aç → bağlı bileşen → delik doldur
        │   ├── features.ts      # Lab/HSV medyanları, leke oranı, doku, netlik, pozlama
        │   ├── classify.ts      # eksen + prior → 5 sınıf olasılık dağılımı
        │   ├── confidence.ts    # 5 güven bileşeni + ağırlıklı geometrik ortalama
        │   ├── explain.ts       # tetiklenen kurallar → TR gerekçe cümleleri
        │   ├── index.ts         # analyze(RGBAImage) → AnalysisResult
        │   └── engine.test.ts   # 17 birim testi (sentetik sahneler)
        ├── ripeness.ts      # 5 sınıfın TR etiketi, tavsiyesi, rengi
        └── types.ts
```

---

## 5. Analiz Motoru (kalbi burası)

`analyze(ImageData) → AnalysisResult` — tamamen saf fonksiyon, DOM'suz, test edilebilir.

**Adım 1 — Hazırlık (`decode.ts`)**
EXIF yönü düzelt → uzun kenar 512px'e küçült → sRGB linearize.

**Adım 2 — Beyaz denge (`whitebalance.ts`)**
Telefon kameraları ve ortam ışığı hue'yu 20-30° kaydırabilir; bu adım olmadan sistem çöker.
Yöntem "beyaz yama": referans olarak rehber elipsin DIŞINDAKİ en parlak %30 piksel alınır.
Klasik gray-world burada işe yaramaz — kadrajın büyük kısmı yeşil avokado olduğu için
gray-world tam da ölçmek istediğimiz yeşili "ışık hatası" sanıp siler.
Referans kümesinin ortalama doygunluğu yüksekse (renkli masa örtüsü) düzeltme yapılmaz:
yanlış düzeltme, düzeltmemekten daha zararlıdır.
Düzeltme miktarı `lightingQuality` sinyaline dönüşür (aşırı düzeltme = güvensiz ışık).

**Adım 3 — Segmentasyon (`segment.ts`)**
Amaç: sadece kabuk pikselleri. Sırayla:
1. Merkez ağırlıklı elips önceliği (rehber çerçeve zaten kullanıcıyı hizalar)
2. Arka plan eleme: çok açık/nötr (masa, tezgah) + ten rengi (el tutuyorsa) pikselleri at
3. En büyük bağlı bileşen (flood fill) → maske
4. **Specular highlight temizliği:** en parlak %8 piksel atılır (parlama rengi bozar)
5. Gölge temizliği: en karanlık %5 atılır

Çıktı: maske + `maskArea` (kadrajın %'si) → güven sinyali.

**Adım 4 — Öznitelikler (`features.ts`)**
Maske içinden: medyan H/S/V, medyan L*a*b*, hue dairesel ortalama + dağılım, V'nin 10/50/90
persentilleri, doygunluk medyanı, koyu leke oranı (olgunlaşma benekleri), doku varyansı.
Medyan kullanılır (ortalama değil) — aykırı piksellere dayanıklı.

**Adım 5 — Sınıflandırma (`classify.ts`)**

```
renk ölçümü → color_category (dark green | green | purple | black)
              ↓ dataset'ten gelen kategori→sınıf öncelikli olasılıkları
            + parlaklık/doygunluk ekseninde alt-ayrıştırma (purple ve black için)
              ↓
            5 sınıf üzerinde olasılık dağılımı (toplam 1.0)
```

`hue` ham değeri **kullanılmaz** (Bulgu 3). Ana eksenler: L* (koyuluk), C* (canlılık kaybı),
yeşil→kahve kayması (a* kanalı), koyu leke oranı — ağırlıkları `AXIS_WEIGHTS`'te.

Kategori→sınıf prior'ı Laplace düzeltmesinden geçer (`PRIOR_SMOOTHING`): dataset'teki
%100'lük prior'ların ölçümü tamamen ezmesini engeller.

**Makullük kapısı:** Avokado kabuğu her aşamada sarıya çalar (b* pozitif). Belirgin negatif
b* (mavi/mor bir nesne) ölçülürse sınıf uydurmak yerine sonuç reddedilir.

**Adım 6 — Güven (`confidence.ts`)**
Güven tek bir sayı değil, çarpanların birleşimi — ve her biri kullanıcıya gerekçe olarak gösterilir:
- `lightingQuality` — beyaz denge düzeltmesi ne kadar agresifti, aşırı/az pozlama var mı
- `maskQuality` — avokado kadrajın makul bir oranını kaplıyor mu, kenarları net mi
- `sharpness` — Laplacian varyansı (bulanık fotoğraf = düşük güven)
- `colorSeparation` — ölçüm en yakın sınıf merkezine ne kadar yakın, 2. sınıfla arası ne kadar
- `colorPurity` — piksellerin renk dağılımı dar mı (alacalı = belirsiz)

Güven < %55 → sonuç yerine "net bir yorum yapamadım, şu şartlarda tekrar dene" ekranı gösterilir.
**Emin olmadığında emin gibi davranma** — ürünün güvenilirliği buna bağlı.

**Adım 7 — Gerekçe (`explain.ts`)**
Tetiklenen kurallardan TR cümleler üretilir; LLM yok, deterministik:
> "Kabuk rengi koyu yeşilden kahverengiye dönmüş (L* 31, doygunluk %38)"
> "Yüzeyin %12'sinde olgunlaşma benekleri var"
> "Işık dengeli ve fotoğraf net — ölçüm güvenilir"

Ve dürüst sınırlar: "Sadece kabuk rengine bakabiliyorum; sertlik ve iç doku ölçemiyorum."

---

## 6. Kullanıcı Akışı

1. **Landing** — ne yaptığımız, "Fotoğrafın telefonundan çıkmıyor" rozeti, tek CTA: **Kamerayı Aç**
2. **Kamera** — canlı önizleme + oval rehber çerçeve + canlı ipuçları ("biraz yaklaş", "ışık az")
   - İzin reddedilirse: sessizce dosya seçme fallback'ine düş
3. **Analiz** — 1 saniyeden kısa, iskelet/animasyon
4. **Sonuç** — büyük sınıf etiketi + renk, gün tahmini, güven barı, 3-4 gerekçe maddesi,
   "Nasıl saklamalı?" ipucu, **Tekrar Çek** butonu
5. Fotoğraf bellekten silinir (`URL.revokeObjectURL`, canvas temizlenir)

---

## 7. Test Modu (`/test`)

Amaç: sistemin doğruluğunu insanlara sunmadan önce ölçmek.

- Landing'de küçük bir "Test Modu" girişi (veya doğrudan `/test` linki)
- Galeriden/dosyadan **çoklu** fotoğraf import (kamera zorunlu değil)
- Her fotoğraf için: küçük önizleme + tahmin + güven
- **DebugPanel:** segmentasyon maskesi görsel overlay, beyaz denge öncesi/sonrası, ham feature
  değerleri (H/S/V, L*a*b*, leke %, keskinlik), 5 sınıfın olasılık dağılımı, tetiklenen kurallar
- **Manuel etiketleme:** her fotoğrafa gerçek sınıfı işaretle → oturum sonunda confusion matrix
  + accuracy. Etiketler `localStorage`'da (sadece test modunda; ana akış hâlâ sıfır-depolama)
- **JSON export:** sonuçları dışa aktar → eşik kalibrasyonunda kullanılır

Bu ekran son kullanıcı için değil; üretimde `/test` linki landing'de gizli kalabilir.

---

## 8. Faz Planı

**Faz 1 — İskelet ✅:** Next.js kurulum, palet token'ları, layout, landing, `/test` rotası
**Faz 2 — Yakalama ✅:** CameraCapture + guide overlay + fallback + decode/EXIF
**Faz 3 — Motor ✅:** `build-model.ts` ile CSV→model.json; segment → whitebalance → features →
classify → confidence → explain; Vitest birim testleri
**Faz 4 — Sonuç UI + Test Modu ✅:** ResultCard, ConfidenceMeter, ReasonList, DebugPanel,
confusion matrix → **MVP burada biter**
**Faz 5 — Deploy (sırada):** Vercel, mobil Lighthouse kontrolü, gizlilik metni
**Faz 6 — Kalibrasyon:** gerçek internet fotoğraflarıyla test modunda eşik ayarı — asıl doğruluk
kazanımı burada olur, dataset'te değil
**Faz 7+ (MVP sonrası):** sap/göbek ikinci karesi; gerçek görüntü dataseti ile MobileNet/TF.js
modeli ve kural motoruyla A/B; EN dili; dark mode; sonucu paylaşılabilir görsel olarak dışa aktarma

---

## 9. Kod Kuralları

- Motor katmanı saf TypeScript, DOM/React bağımsız → doğrudan Vitest'te çalışır
- Sihirli sayı yok: tüm eşikler `model.json` veya `engine/constants.ts` içinde, isimli
- Her eşiğin yanında **neden o değer** yorumu (kalibrasyon geçmişi kaybolmasın)
- Kullanıcıya gösterilen tüm metinler tek dosyada toplanır (i18n hazırlığı)
- Analiz sonucunda `console.log` yok; debug bilgisi `AnalysisResult.debug` alanında taşınır
- Ana akışta hiçbir yere yazma yok: `localStorage` / `sessionStorage` / cookie / fetch **yasak**
  (sadece `/test` rotası `localStorage` kullanabilir)

---

## 10. Komutlar

```bash
npm run dev            # yerel geliştirme (telefondan test için --hostname 0.0.0.0)
npm run build:model    # dataset/*.csv → src/lib/engine/model.json
npm run test           # Vitest
npm run build          # prod build
```

---

## 11. Açık Riskler

1. **Renk ≠ olgunluk (Hass dışı çeşitlerde).** Fuerte gibi çeşitler olgunlaşınca kararmaz.
   MVP varsayımı: Hass. Sonuç ekranında bu varsayım yazılı belirtilir.
2. **Ortam ışığı** en büyük hata kaynağı. Beyaz denge + güven skoru bunu yönetir, yok etmez.
3. **Dataset kalibrasyon için zayıf** (Bölüm 0). Gerçek doğruluk Faz 6'da kazanılır.
4. Kullanıcıya asla "kesin" dili kurulmaz — bu bir tahmin aracı, gıda güvenliği aracı değil.
