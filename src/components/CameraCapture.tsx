"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { GuideOverlay } from "./GuideOverlay";
import { captureVideoFrame, decodeBlob, decodeSource, toPreviewUrl } from "@/lib/engine/decode";
import { exposureStats, computeSharpness } from "@/lib/engine/features";
import { segment } from "@/lib/engine/segment";
import {
  EXPOSURE_V_MIN,
  MASK_AREA_IDEAL_MAX,
  MASK_AREA_IDEAL_MIN,
  SHARPNESS_BLURRY,
} from "@/lib/engine/constants";

/** Kamera kadrajının en/boy oranı. Analiz de tam olarak bu kırpma üzerinde yapılır. */
const ASPECT = 3 / 4;

/** Canlı ipucu örnekleme aralığı (ms). Daha sık örneklemek pili gereksiz yer. */
const HINT_INTERVAL = 700;
/** İpucu örneklemesi düşük çözünürlükte yapılır — amaç ölçüm değil, kaba yönlendirme. */
const HINT_EDGE = 160;

type Status = "starting" | "ready" | "denied" | "unsupported";

export function CameraCapture({
  onCapture,
  onCancel,
}: {
  onCapture: (frame: ImageData, previewUrl: string) => void;
  onCancel?: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [status, setStatus] = useState<Status>("starting");
  const [hint, setHint] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [fileError, setFileError] = useState<string | null>(null);

  const stop = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  const start = useCallback(async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      setStatus("unsupported");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          // Arka kamera; cihazda yoksa tarayıcı öndekine düşer.
          facingMode: { ideal: "environment" },
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => {});
      }
      setStatus("ready");
    } catch {
      // İzin reddi ile cihaz yokluğunu ayırmıyoruz: her iki durumda da
      // kullanıcıya aynı çıkış yolunu (galeriden seç) sunuyoruz.
      setStatus("denied");
    }
  }, []);

  useEffect(() => {
    void start();
    return stop;
  }, [start, stop]);

  // Canlı kadraj ipuçları — kullanıcı çekmeden önce düzeltsin diye.
  useEffect(() => {
    if (status !== "ready") return;
    let cancelled = false;

    const tick = () => {
      if (cancelled || !videoRef.current || videoRef.current.readyState < 2) return;
      try {
        const frame = captureVideoFrame(videoRef.current, {
          aspect: ASPECT,
          maxEdge: HINT_EDGE,
        });
        setHint(hintFor(frame));
      } catch {
        // Kare henüz hazır değilse sessizce geç; bir sonraki turda tekrar denenir.
      }
    };

    const id = window.setInterval(tick, HINT_INTERVAL);
    tick();
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [status]);

  const shoot = () => {
    const video = videoRef.current;
    if (!video || busy) return;
    setBusy(true);
    try {
      const frame = captureVideoFrame(video, { aspect: ASPECT });
      const preview = toPreviewUrl(video, video.videoWidth, video.videoHeight, {
        aspect: ASPECT,
      });
      stop();
      onCapture(frame, preview);
    } finally {
      setBusy(false);
    }
  };

  const pickFile = async (file: File) => {
    setBusy(true);
    setFileError(null);
    try {
      const frame = await decodeBlob(file);
      const decoded = await decodeSource(file);
      try {
        const preview = toPreviewUrl(decoded.source, decoded.width, decoded.height);
        stop();
        onCapture(frame, preview);
      } finally {
        decoded.release();
      }
    } catch (err) {
      // Sessiz başarısızlık en kötü davranış: kullanıcı ne olduğunu anlamaz.
      setFileError(err instanceof Error ? err.message : "Fotoğraf açılamadı.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-1 flex-col">
      <div
        className="relative w-full overflow-hidden rounded-card bg-av-skin"
        style={{ aspectRatio: String(ASPECT) }}
      >
        <video
          ref={videoRef}
          playsInline
          muted
          autoPlay
          className="h-full w-full object-cover"
        />
        {status === "ready" ? <GuideOverlay hint={hint} /> : null}

        {status === "starting" ? (
          <p className="absolute inset-0 flex items-center justify-center text-sm text-white/70">
            Kamera açılıyor…
          </p>
        ) : null}

        {status !== "ready" && status !== "starting" ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 px-8 text-center">
            <p className="text-sm leading-relaxed text-white/80">
              {status === "denied"
                ? "Kameraya erişemedim. İzin verebilir ya da galerinden bir fotoğraf seçebilirsin."
                : "Bu tarayıcı kamerayı desteklemiyor. Galerinden bir fotoğraf seçebilirsin."}
            </p>
            {status === "denied" ? (
              <button
                type="button"
                onClick={() => void start()}
                className="rounded-pill bg-av-ready px-4 py-2 text-sm font-semibold text-av-skin"
              >
                Tekrar dene
              </button>
            ) : null}
          </div>
        ) : null}
      </div>

      <div className="mt-5 flex flex-col items-center gap-4">
        {status === "ready" ? (
          <button
            type="button"
            onClick={shoot}
            disabled={busy}
            aria-label="Fotoğrafı çek"
            className="h-18 w-18 rounded-full border-4 border-av-ripe bg-av-ready p-1 transition active:scale-95 disabled:opacity-50"
          >
            <span className="block h-full w-full rounded-full bg-av-ripe" />
          </button>
        ) : null}

        <label className="cursor-pointer text-sm font-medium text-av-skin/60 underline underline-offset-4">
          <input
            type="file"
            accept="image/*"
            className="sr-only"
            onChange={(e) => {
              const file = e.target.files?.[0];
              // Aynı dosya tekrar seçilebilsin diye input sıfırlanır.
              e.target.value = "";
              if (file) void pickFile(file);
            }}
          />
          Galeriden fotoğraf seç
        </label>

        {fileError ? (
          <p className="rounded-card border border-av-unripe bg-av-unripe/15 px-3 py-2 text-center text-[12px] leading-snug">
            {fileError}
          </p>
        ) : null}

        {onCancel ? (
          <button
            type="button"
            onClick={() => {
              stop();
              onCancel();
            }}
            className="text-sm text-av-skin/40"
          >
            Vazgeç
          </button>
        ) : null}
      </div>
    </div>
  );
}

/**
 * Kaba kadraj kontrolü. Tek bir ipucu gösterilir — aynı anda üç uyarı vermek
 * kullanıcıyı yönlendirmez, yorar. Sıra en engelleyici sorundan başlar.
 */
function hintFor(frame: ImageData): string | null {
  const { meanV } = exposureStats(frame);
  if (meanV < EXPOSURE_V_MIN) return "Ortam karanlık — daha aydınlık bir yere geç";

  const seg = segment(frame);
  if (seg.maskArea < 0.03) return "Avokadoyu çerçevenin içine al";
  if (seg.maskArea < MASK_AREA_IDEAL_MIN) return "Biraz yaklaş";
  if (seg.maskArea > MASK_AREA_IDEAL_MAX) return "Biraz uzaklaş";

  // Netlik düşük çözünürlükte ölçüldüğü için eşik de düşük tutulur.
  if (computeSharpness(frame, seg.mask) < SHARPNESS_BLURRY * 0.5) {
    return "Telefonu sabit tut";
  }

  return "Hazır — çekebilirsin";
}
