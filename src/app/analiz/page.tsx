"use client";

import Link from "next/link";
import { useCallback, useState } from "react";
import { CameraCapture } from "@/components/CameraCapture";
import { ConfidenceMeter } from "@/components/ConfidenceMeter";
import { ReasonList } from "@/components/ReasonList";
import { ResultCard } from "@/components/ResultCard";
import { analyze } from "@/lib/engine";
import type { AnalysisResult } from "@/lib/types";

type Phase =
  | { kind: "camera" }
  | { kind: "analyzing" }
  | { kind: "result"; result: AnalysisResult; previewUrl: string }
  | { kind: "error"; message: string };

export default function AnalizPage() {
  const [phase, setPhase] = useState<Phase>({ kind: "camera" });

  const handleCapture = useCallback((frame: ImageData, previewUrl: string) => {
    setPhase({ kind: "analyzing" });
    // Bir sonraki kareye ertele: "Analiz ediliyor" ekranı boyanmadan
    // analiz ana thread'i kilitlemesin.
    requestAnimationFrame(() => {
      try {
        const result = analyze(frame);
        setPhase({ kind: "result", result, previewUrl });
      } catch (err) {
        setPhase({
          kind: "error",
          message: err instanceof Error ? err.message : "Fotoğraf işlenemedi.",
        });
      }
    });
  }, []);

  const reset = useCallback(() => setPhase({ kind: "camera" }), []);

  return (
    <main className="shell pt-safe pb-safe flex min-h-svh flex-col">
      <header className="flex items-center justify-between py-2">
        <Link href="/" className="text-sm font-medium text-av-skin/60">
          ← Ana sayfa
        </Link>
        <span className="text-[11px] text-av-skin/40">Fotoğraf cihazından çıkmıyor</span>
      </header>

      {phase.kind === "camera" ? (
        <>
          <p className="mt-2 mb-4 text-center text-[13px] leading-snug text-av-skin/60">
            Avokadoyu çerçeveye sığdır, sade bir zemin üzerinde tut.
          </p>
          <CameraCapture onCapture={handleCapture} />
        </>
      ) : null}

      {phase.kind === "analyzing" ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-4">
          <div className="h-10 w-10 animate-spin rounded-full border-4 border-av-mist border-t-av-ripe" />
          <p className="text-sm text-av-skin/60">Renk analiz ediliyor…</p>
        </div>
      ) : null}

      {phase.kind === "error" ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-4 text-center">
          <p className="text-sm text-av-skin/70">{phase.message}</p>
          <button
            type="button"
            onClick={reset}
            className="rounded-pill bg-av-ready px-5 py-2.5 text-sm font-semibold text-av-skin"
          >
            Tekrar dene
          </button>
        </div>
      ) : null}

      {phase.kind === "result" ? (
        <Result result={phase.result} previewUrl={phase.previewUrl} onRetry={reset} />
      ) : null}
    </main>
  );
}

function Result({
  result,
  previewUrl,
  onRetry,
}: {
  result: AnalysisResult;
  previewUrl: string;
  onRetry: () => void;
}) {
  return (
    <div className="flex flex-1 flex-col gap-6 pb-6">
      {result.ok ? (
        <ResultCard result={result} previewUrl={previewUrl} />
      ) : (
        <LowConfidence result={result} previewUrl={previewUrl} />
      )}

      {result.ok ? (
        <>
          <ConfidenceMeter confidence={result.confidence} signals={result.debug.quality} />
          <ReasonList title="Bu yorum neye dayanıyor" reasons={result.reasons} />
        </>
      ) : null}

      <ReasonList title="Dikkat" reasons={result.warnings} variant="warning" />

      <div className="mt-auto pt-2">
        <button
          type="button"
          onClick={onRetry}
          className="w-full rounded-pill bg-av-ready px-6 py-3.5 text-base font-semibold text-av-skin shadow-[0_5px_0_0_#A4C639] transition active:translate-y-0.5 active:shadow-[0_3px_0_0_#A4C639]"
        >
          Tekrar Çek
        </button>
        <p className="mt-3 text-center text-[11px] leading-relaxed text-av-skin/40">
          Tahmin kabuk rengine dayanır ve Hass çeşidi için kalibre edilmiştir.
          Kesin sonuç için avokadoyu avuç içinde hafifçe sıkarak da kontrol et.
        </p>
      </div>
    </div>
  );
}

/**
 * Güven eşiğin altında. Bilerek sınıf göstermiyoruz: düşük güvenli bir tahmini
 * yine de göstermek, kullanıcının ona güvenmesine yol açar — uygulamanın
 * güvenilirliği tam olarak burada kazanılır ya da kaybedilir.
 */
function LowConfidence({
  result,
  previewUrl,
}: {
  result: AnalysisResult;
  previewUrl: string;
}) {
  return (
    <section className="rounded-card border border-av-line bg-av-mist/60 p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-[1.4rem] leading-tight font-bold text-balance">
            Net bir yorum yapamadım
          </h1>
          <p className="mt-2 text-[13px] leading-relaxed text-av-skin/70">
            Bu karede ölçüm güvenilir çıkmadı, bu yüzden tahmin göstermiyorum.
            Aşağıdaki noktaları düzeltip tekrar denersen sonuç netleşir.
          </p>
        </div>
        {/* eslint-disable-next-line @next/next/no-img-element -- bellekteki data URL */}
        <img
          src={previewUrl}
          alt="Çektiğin fotoğraf"
          className="h-20 w-16 shrink-0 rounded-xl object-cover ring-1 ring-av-line"
        />
      </div>
      {result.confidence > 0 ? (
        <p className="mt-3 text-[11px] text-av-skin/45">
          Ölçüm güveni: %{Math.round(result.confidence * 100)}
        </p>
      ) : null}
    </section>
  );
}
