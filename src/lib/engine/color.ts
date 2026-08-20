/**
 * Renk uzayı dönüşümleri ve istatistik yardımcıları.
 * Saf fonksiyonlar — DOM yok, bağımlılık yok, Vitest'te doğrudan çalışır.
 */

/** sRGB (0-1) → doğrusal ışık (0-1). Ortalama alma işlemleri doğrusal uzayda doğru sonuç verir. */
export function srgbToLinear(c: number): number {
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

export function linearToSrgb(c: number): number {
  return c <= 0.0031308 ? c * 12.92 : 1.055 * c ** (1 / 2.4) - 0.055;
}

/** D65 beyaz noktası (CIE 1931 2°) */
const XN = 0.95047;
const YN = 1.0;
const ZN = 1.08883;

/**
 * sRGB (0-255) → CIE L*a*b*.
 * L*: 0-100 koyuluk, a*: negatif=yeşil / pozitif=kırmızı-kahve, b*: pozitif=sarı.
 * Olgunlaşma ekseni büyük ölçüde L* ve a* üzerinde okunur.
 */
export function rgbToLab(r8: number, g8: number, b8: number): [number, number, number] {
  const r = srgbToLinear(r8 / 255);
  const g = srgbToLinear(g8 / 255);
  const b = srgbToLinear(b8 / 255);

  const x = (0.4124564 * r + 0.3575761 * g + 0.1804375 * b) / XN;
  const y = (0.2126729 * r + 0.7151522 * g + 0.072175 * b) / YN;
  const z = (0.0193339 * r + 0.119192 * g + 0.9503041 * b) / ZN;

  const f = (t: number) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  const fx = f(x);
  const fy = f(y);
  const fz = f(z);

  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}

/** sRGB (0-255) → HSV. h: 0-360, s: 0-1, v: 0-1 */
export function rgbToHsv(r8: number, g8: number, b8: number): [number, number, number] {
  const r = r8 / 255;
  const g = g8 / 255;
  const b = b8 / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;

  let h = 0;
  if (d !== 0) {
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  return [h, max === 0 ? 0 : d / max, max];
}

/** Algısal parlaklık (0-1). Doğrusal uzayda Rec.709 luma. */
export function luminance(r8: number, g8: number, b8: number): number {
  return (
    0.2126 * srgbToLinear(r8 / 255) +
    0.7152 * srgbToLinear(g8 / 255) +
    0.0722 * srgbToLinear(b8 / 255)
  );
}

/** Lab kroması — renkliliğin miktarı. Olgunlaştıkça düşer (kabuk matlaşır). */
export function chroma(a: number, b: number): number {
  return Math.hypot(a, b);
}

/** Lab hue açısı, 0-360. Yeşil ≈ 130-160, kahve/turuncu ≈ 40-70. */
export function labHue(a: number, b: number): number {
  const deg = (Math.atan2(b, a) * 180) / Math.PI;
  return deg < 0 ? deg + 360 : deg;
}

export function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

/** 0..1 aralığına doğrusal normalize; lo>hi verilirse ters çevirir. */
export function normalize(value: number, lo: number, hi: number): number {
  if (lo === hi) return 0.5;
  return clamp((value - lo) / (hi - lo), 0, 1);
}

/** Yerinde sıralamayı bozmadan medyan. */
export function median(values: number[]): number {
  if (values.length === 0) return 0;
  const s = [...values].sort((x, y) => x - y);
  const mid = s.length >> 1;
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

/** p: 0-1. Dizi SIRALI verilmelidir. */
export function percentileSorted(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const i = clamp(Math.round(p * (sorted.length - 1)), 0, sorted.length - 1);
  return sorted[i];
}

export function mean(values: number[]): number {
  if (values.length === 0) return 0;
  let sum = 0;
  for (const v of values) sum += v;
  return sum / values.length;
}

export function variance(values: number[]): number {
  if (values.length < 2) return 0;
  const m = mean(values);
  let sum = 0;
  for (const v of values) sum += (v - m) ** 2;
  return sum / values.length;
}

/**
 * Dairesel ortalama hue (0-360) ve dağılım genişliği.
 * Hue dairesel bir büyüklük: 350° ve 10°'nin aritmetik ortalaması 180° çıkar ki yanlıştır.
 * spread: 0 = tüm pikseller aynı hue, 1 = tamamen dağınık.
 */
export function circularHueStats(hues: number[]): { hue: number; spread: number } {
  if (hues.length === 0) return { hue: 0, spread: 1 };
  let sx = 0;
  let sy = 0;
  for (const h of hues) {
    const rad = (h * Math.PI) / 180;
    sx += Math.cos(rad);
    sy += Math.sin(rad);
  }
  sx /= hues.length;
  sy /= hues.length;
  const r = Math.hypot(sx, sy);
  let deg = (Math.atan2(sy, sx) * 180) / Math.PI;
  if (deg < 0) deg += 360;
  return { hue: deg, spread: 1 - r };
}

/** İki hue arasındaki en kısa açısal mesafe (0-180). */
export function hueDistance(a: number, b: number): number {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
}
