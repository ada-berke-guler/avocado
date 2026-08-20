/**
 * Stil dosyalarının yan etki olarak import edilmesi (`import "./globals.css"`).
 *
 * Next.js bu import'u derleme sırasında kendisi işler ama düz `.css` dosyaları için
 * tip tanımı göndermez. Tanım olmayınca TypeScript "Cannot find module or type
 * declarations for side-effect import" (TS2882) hatası veriyor — `next build`
 * etkilenmiyor, ama editörde kırmızı olarak görünüyor.
 *
 * `*.module.css` daha spesifik bir kalıp olduğu için Next'in CSS Modules tipleri
 * bundan etkilenmez.
 */
declare module "*.css";
