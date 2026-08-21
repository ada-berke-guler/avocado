# Handoff — Avokado Olgunluk Testi

Bir sonraki oturumun hızlı başlaması için. Teknik plan ve mimari gerekçeler `CLAUDE.md`'de;
burada **nerede kaldığımız, neden bazı şeyleri farklı yaptığımız ve hangi tuzaklara düştüğümüz** var.

Son güncelleme: 2026-08-20

---

## 1. Tek bakışta durum

| | |
|---|---|
| Durum | **MVP çalışıyor.** Faz 1-4 tamam |
| Doğrulama | 17 birim testi + `tsc` + `next build` geçiyor; gerçek Chrome'da uçtan uca test edildi |
| Repo | `github.com/ada-berke-guler/avocado`, `main` |
| Git | Working tree temiz, her şey push'lu (`origin/main` ile eşit) |
| Deploy | Vercel, main'e push otomatik deploy tetikliyor |
| Sürümler | Next 15.5.9 · React 19.1.1 · Tailwind v4 · TypeScript 5.9 |
| Sıradaki iş | **Faz 6 — gerçek fotoğraflarla kalibrasyon** (bkz. §5) |

Kurulum: `npm install` → `npm run dev`.
Komutlar: `npm run test` · `npm run typecheck` · `npm run build` · `npm run build:model`

---

## 2. Ne yapıldı

- **Faz 1 ✅** İskelet: Next.js 15 App Router, Tailwind v4, palet token'ları, landing
- **Faz 2 ✅** Yakalama: canlı kamera + rehber elips + canlı kadraj ipuçları, galeri fallback
- **Faz 3 ✅** Motor: 7 adımlı analiz hattı, dataset→model derleyicisi, 17 birim testi
- **Faz 4 ✅** Sonuç UI + test modu: sonuç kartı, güven barı, gerekçeler, debug paneli,
  etiketleme, karışıklık matrisi, JSON export
- **Faz 5 ✅** Deploy: Vercel'de canlı
- **Faz 6 ⏳** Kalibrasyon — **sıradaki iş**
- **Faz 7+** Sap/göbek ikinci karesi, gerçek görüntü dataseti + CNN, EN dili, dark mode

3 rota var: `/` (landing) · `/analiz` (kamera → sonuç) · `/test` (test modu).
Sunucu tarafı **yok**, API route **yok**. Tüm analiz tarayıcıda; fotoğraf cihazdan çıkmıyor.

---

## 3. Motor 30 saniyede

`analyze(RGBAImage) → AnalysisResult` — saf fonksiyon, DOM'suz, Vitest'te doğrudan koşar.

```
decode → beyaz denge → segmentasyon → öznitelik → sınıflandırma → güven → gerekçe
```

Sınıflandırmanın çekirdeği:

```
posterior(c) ∝ prior(c | ton) × exp(-(r - merkez(c))² / 2σ²)
```

- **r** = sürekli olgunluk ekseni (0 ham → 1 olgun), dört sinyalin ağırlıklı toplamı:
  koyuluk %45, yeşil kaybı %25, matlaşma %20, lekeler %10
- **ton** = r'nin düştüğü kova (`vivid-green` / `deep-green` / `brown-purple` / `near-black`)
- **prior** = dataset'ten gelen ton→sınıf dağılımı, Laplace düzeltmeli

Ton ile eksen çeliştiğinde dağılım yayılır → `colorSeparation` düşer → güven düşer.
Yani belirsizlik uydurma kesinliğe değil, düşük güvene dönüşür. **Bu davranışı bozma.**

Güven < `CONFIDENCE_MIN` (0.55) ise kullanıcıya sınıf **gösterilmez**, "net yorum yapamadım"
ekranı çıkar. Ürünün güvenilirliği buna bağlı; eşiği düşürmeden önce iki kez düşün.

Dosya haritası: `src/lib/engine/` → `constants.ts` (tüm eşikler, her biri gerekçeli),
`color.ts`, `decode.ts`, `whitebalance.ts`, `segment.ts`, `features.ts`, `classify.ts`,
`confidence.ts`, `explain.ts`, `index.ts`, `model.json` (üretilen), `engine.test.ts`.

---

## 4. Bilinçli sapmalar — geri almadan önce oku

Dataset (`dataset/avocado_ripeness_dataset.csv`) **sentetik ve tablo tabanlı**. 250 satır,
9 kolondan sadece 4'ü fotoğraftan elde edilebiliyor. Sınıflar kusursuz ayrık; bu veriyle
eğitilen model %100 accuracy verir ve **o sayı hiçbir şey ifade etmez.** Detay: `CLAUDE.md` §0.

Bu yüzden dataset model eğitmek için değil, **prior üretmek** için kullanılıyor. Üç sapma:

1. **`hue` kolonu kullanılmıyor.** Dataset'te `purple` = 270-329° (macenta). Gerçek avokado
   kabuğunda o hue fiziksel olarak oluşmaz. Kamera hue'sunu o tabloya bağlamak çöp üretir.

2. **Yeşil kategorilerin sırası ters çevrildi.** Dataset `dark green`→hard, `green`→
   pre-conditioned diyor ve "dark green"in ortalama parlaklığı daha düşük — yani dataset'e
   göre daha koyu yeşil daha ham. Gerçekte Hass olgunlaştıkça koyulaşır. Dataset'ten sadece
   "yeşil aile = {hard, pre-conditioned}" küme bilgisi alındı, küme içi sıralama koyuluğa
   göre yapıldı. Kod: `constants.ts` → `SKIN_TONE_TO_DATASET`.

3. **Prior'lara Laplace düzeltmesi** (`PRIOR_SMOOTHING = 2.5`). Ham prior'larda bazı
   kategoriler %100 tek sınıf; düzeltme olmadan ölçüm ne derse desin diğer sınıflar ölüyordu.

Ek olarak **makullük kapısı**: avokado kabuğu her aşamada sarıya çalar (b\* pozitif).
`features.b < SKIN_PLAUSIBLE_MIN_B` ise sınıf uydurmak yerine sonuç reddediliyor.

---

## 5. Sıradaki iş: Faz 6 kalibrasyon

Asıl doğruluk kazanımı burada. Birim testleri motorun **iç tutarlılığını** ölçüyor,
**doğruluğunu** değil — o ayrımı karıştırma.

**Yöntem:**
1. İnternetten olgunluk aşaması belli 15-20 Hass fotoğrafı topla
2. `/test` sayfasına yükle, her birine gerçek aşamayı işaretle
3. Karışıklık matrisine bak; hatalı olanlarda "Detayı göster" ile ölçülen `L*`, `a*`, `C*`
   ve eksen bileşenlerini oku
4. "JSON dışa aktar" ile ham veriyi al

**Hangi sabiti ne zaman oynatmalı** (`src/lib/engine/constants.ts`):

| Belirti | Sabit | Şu anki |
|---|---|---|
| Her şey fazla ham / fazla olgun çıkıyor | `L_LIGHT` / `L_DARK` | 58 / 20 |
| Son iki aşama (firm-ripe ↔ ripe) karışıyor | `TONE_BOUNDS["brown-purple"]` üst sınırı | 0.78 |
| Kahverengileşme geç algılanıyor | `A_GREEN` / `A_NEUTRAL` | -22 / +5 |
| Mat kabuklar erken "olgun" çıkıyor | `C_VIVID` / `C_DULL` | 30 / 3 |
| Dağılım fazla keskin/yayvan | `CLASS_SIGMA` | 0.16 |
| Çok fazla foto eşik altı kalıyor | `CONFIDENCE_MIN` | 0.55 |

**Kural:** her eşik değişikliğinde yanındaki "neden bu değer" yorumunu da güncelle.
Kalibrasyon geçmişi kodda yaşıyor.

---

## 6. Düştüğümüz tuzaklar — tekrar etme

Hepsi çözüldü, ama sebepleri kalıcı:

- **Canlı `FileList`.** `input.files` bir kopya değil, input'a bağlı canlı referans.
  `input.value = ""` ile input sıfırlanınca elindeki `FileList` de boşalır. Test modu tam
  olarak bu yüzden sessizce hiçbir şey yapmıyordu — hata yok, mesaj yok. Chrome'da ölçüldü:
  `lengthBefore: 1 → lengthAfterReset: 0`. **Sıfırlamadan önce `Array.from()` ile diziye
  kopyala.** Tek `File` çekiyorsan sorun yok, `File` referansı sıfırlamadan etkilenmiyor.

- **Korumasız `createImageBitmap`.** Tarayıcı formatı çözemezse (iPhone HEIC, eski Safari)
  fırlatır. `decodeSource()` artık `<img>` yoluna düşüyor ve çözemezse net bir mesaj veriyor.
  **Görüntü çözme çağrılarını asla sessizce yutma** — "hiçbir şey olmuyor" en kötü hata modu.

- **Gray-world beyaz denge işe yaramıyor.** Kadrajın büyük kısmı yeşil avokado olduğunda
  gray-world tam da ölçmek istediğimiz yeşili "ışık hatası" sanıp siler. Bunun yerine
  **beyaz yama**: referans olarak rehber elipsin DIŞINDAKİ en parlak %30. Referans kümesi
  fazla doygunsa (renkli masa örtüsü) düzeltme hiç yapılmıyor.

- **Rehber elips ile analiz kadrajı aynı olmalı.** `GuideOverlay` ölçülerini
  `GUIDE_ELLIPSE_*` sabitlerinden alıyor ve kamera karesi aynı 3:4 oranına kırpılıyor.
  İkisi ayrışırsa segmentasyon sessizce yanlış bölgeyi ölçmeye başlar.

- **Kamera HTTPS istiyor.** `getUserMedia` güvenli bağlam gerektirir. `npm run dev:lan` ile
  telefondan LAN IP'sine bağlanınca kamera **açılmaz** (galeri fallback'i çalışır).
  Canlı kameranın gerçek testi ancak Vercel'de (HTTPS) yapılabilir.

- **`npm install` sonrası VS Code hayalet hataları.** TS server modül önbelleğini kaybediyor,
  "Cannot find module 'next/link'" gibi sahte hatalar çıkıyor. `tsc --noEmit` temizse
  `TypeScript: Restart TS Server`. Kodda bir şey arama.

- **Düz `.css` side-effect import'u için tip tanımı yok.** TS2882 veriyordu; `src/globals.d.ts`
  içindeki `declare module "*.css";` ile çözüldü. Silme.

---

## 7. Nasıl doğrulanır

```bash
npm run test        # 17 birim testi (sentetik sahneler, saf motor)
npm run typecheck
npm run build
```

**Gerçek tarayıcı testi** (bir bug'ın gerçekten çözüldüğünü kanıtlamak için):
`playwright-core` kurulu değil, gerektiğinde geçici olarak kur (`npm i -D playwright-core`,
sonra kaldır) ve sistemdeki Chrome'u `executablePath` ile kullan. Betik proje kökünde
olmalı, yoksa `playwright-core`'u çözemez. Chrome yolunu **ileri eğik çizgiyle** yaz.
Doğrulanan akış: `/test`'e `setInputFiles` → listede kart beliriyor mu → "Detayı göster" →
maske canvas'ı → etiket butonu → özet güncelleniyor mu.

Kalıcı bir e2e testi yok; istenirse eklenebilir.

---

## 8. Açık maddeler

- **Faz 6 kalibrasyon yapılmadı.** Şu anki eşikler yayınlanmış Hass ölçümlerine göre
  seçilmiş makul başlangıç değerleri, gerçek fotoğraflarla doğrulanmadı.
- **Segmentasyon basit.** Merkez elips + renk elemesi + bağlı bileşen. Karmaşık arka planda
  veya avokado elde tutulurken zorlanabilir; `maskQuality` bunu güvene yansıtıyor.
- **Sadece Hass varsayımı.** Fuerte gibi çeşitler olgunlaşınca kararmaz; sonuç ekranında
  bu varsayım yazılı belirtiliyor.
- **`assets/logo.png` commit'li ama hiçbir yerde kullanılmıyor.** Landing ve favicon inline
  SVG kullanıyor (`AvocadoMark.tsx`, `src/app/icon.svg`).
- **i18n altyapısı yok.** Metinler bileşenlerin içinde; EN eklenecekse önce toplanmalı.
