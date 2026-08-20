import { ANALYSIS_MAX_EDGE } from "./constants";

/**
 * Görüntü kaynaklarını analiz çözünürlüğünde ImageData'ya çevirir.
 *
 * Bu dosya motorun TEK tarayıcıya bağımlı parçasıdır (canvas gerekir).
 * Geri kalan her şey saf TS olduğu için Node'da test edilebilir.
 *
 * Hiçbir fonksiyon veriyi diske yazmaz, ağa göndermez veya kalıcı tutmaz.
 */

export interface DecodeOptions {
  /** Uzun kenar bu piksele küçültülür */
  maxEdge?: number;
  /**
   * Verilirse kare bu en/boy oranına ortadan kırpılır.
   * Kamera ekranında şart: kullanıcı videonun sadece görünen (object-fit: cover ile
   * kırpılmış) kısmını görüyor. Aynı kırpmayı uygulamazsak rehber elips, analiz
   * edilen karede başka bir yere denk gelir.
   */
  aspect?: number;
}

/** Dosya/Blob → ImageData. EXIF yönü uygulanır, uzun kenar maxEdge'e küçültülür. */
export async function decodeBlob(
  blob: Blob,
  options: DecodeOptions = {},
): Promise<ImageData> {
  const bitmap = await toBitmap(blob);
  try {
    return toImageData(bitmap, bitmap.width, bitmap.height, options);
  } finally {
    // Bellekteki kopyayı hemen bırak — tek kullanımlık uygulama.
    if ("close" in bitmap && typeof bitmap.close === "function") bitmap.close();
  }
}

/** Canlı kamera akışından tek kare. */
export function captureVideoFrame(
  video: HTMLVideoElement,
  options: DecodeOptions = {},
): ImageData {
  return toImageData(video, video.videoWidth, video.videoHeight, options);
}

/**
 * Sonuç ekranındaki küçük önizleme için data URL.
 * Sadece bellekte yaşar; sekme kapanınca gider, hiçbir yere yazılmaz.
 */
export function toPreviewUrl(
  source: CanvasImageSource,
  width: number,
  height: number,
  options: DecodeOptions = {},
): string {
  const { canvas } = paint(source, width, height, { maxEdge: 720, ...options });
  return canvas.toDataURL("image/jpeg", 0.82);
}

async function toBitmap(blob: Blob): Promise<ImageBitmap | HTMLImageElement> {
  // Tercih edilen yol: EXIF yönünü tarayıcı uygular.
  if (typeof createImageBitmap === "function") {
    try {
      return await createImageBitmap(blob, { imageOrientation: "from-image" });
    } catch {
      // Safari'nin eski sürümleri seçenekli çağrıyı desteklemez — alta düş.
    }
  }

  const url = URL.createObjectURL(blob);
  try {
    const img = new Image();
    img.decoding = "async";
    // <img> için tarayıcılar EXIF yönünü zaten varsayılan olarak uygular.
    img.src = url;
    await img.decode();
    return img;
  } finally {
    URL.revokeObjectURL(url);
  }
}

function toImageData(
  source: CanvasImageSource,
  width: number,
  height: number,
  options: DecodeOptions,
): ImageData {
  const { ctx, w, h } = paint(source, width, height, options);
  return ctx.getImageData(0, 0, w, h);
}

function paint(
  source: CanvasImageSource,
  width: number,
  height: number,
  { maxEdge = ANALYSIS_MAX_EDGE, aspect }: DecodeOptions,
): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D; w: number; h: number } {
  if (!width || !height) {
    throw new Error("Görüntü boyutu okunamadı.");
  }

  // Ortadan kırpma — ekranda görünen alanla analiz edilen alanı hizalar.
  let sx = 0;
  let sy = 0;
  let sw = width;
  let sh = height;
  if (aspect && aspect > 0) {
    if (width / height > aspect) {
      sw = Math.round(height * aspect);
      sx = Math.round((width - sw) / 2);
    } else {
      sh = Math.round(width / aspect);
      sy = Math.round((height - sh) / 2);
    }
  }

  const scale = Math.min(1, maxEdge / Math.max(sw, sh));
  const w = Math.max(1, Math.round(sw * scale));
  const h = Math.max(1, Math.round(sh * scale));

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;

  // willReadFrequently: getImageData çağıracağımız için tarayıcıya CPU tarafında
  // tutmasını söylüyoruz; GPU'dan geri okuma çok daha yavaş olurdu.
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("Bu tarayıcıda canvas desteklenmiyor.");

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(source, sx, sy, sw, sh, 0, 0, w, h);

  return { canvas, ctx, w, h };
}
