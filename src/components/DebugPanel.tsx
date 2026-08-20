"use client";

import { useEffect, useRef } from "react";
import { RIPENESS_ORDER } from "@/lib/ripeness";
import { chroma } from "@/lib/engine/color";
import type { AnalysisResult } from "@/lib/types";

/**
 * Test modunun içini gösteren panel. Son kullanıcıya ASLA gösterilmez.
 *
 * Amacı kalibrasyon: bir tahmin yanlış çıktığında hangi ölçümün veya hangi eşiğin
 * yanıldığını buradan okuyup constants.ts'i düzeltiyoruz (CLAUDE.md Faz 6).
 */
export function DebugPanel({ result }: { result: AnalysisResult }) {
  const d = result.debug;
  const f = d.features;

  return (
    <div className="mt-3 space-y-4 rounded-xl border border-av-line bg-av-cream p-3 text-[11px]">
      <div className="flex flex-wrap items-start gap-4">
        <MaskCanvas preview={d.maskPreview} />
        <dl className="grid flex-1 grid-cols-2 gap-x-4 gap-y-1 tabular-nums">
          <Metric k="L*" v={f.L.toFixed(1)} />
          <Metric k="a*" v={f.a.toFixed(1)} />
          <Metric k="b*" v={f.b.toFixed(1)} />
          <Metric k="C*" v={chroma(f.a, f.b).toFixed(1)} />
          <Metric k="hue" v={`${f.hue.toFixed(0)}°`} />
          <Metric k="hue yayılım" v={f.hueSpread.toFixed(2)} />
          <Metric k="doygunluk" v={f.sat.toFixed(2)} />
          <Metric k="leke oranı" v={`%${(f.darkSpotRatio * 100).toFixed(1)}`} />
          <Metric k="doku var." v={f.textureVariance.toFixed(0)} />
          <Metric k="maske alanı" v={`%${(d.maskArea * 100).toFixed(1)}`} />
          <Metric k="piksel" v={String(f.pixelCount)} />
          <Metric k="süre" v={`${d.elapsedMs.toFixed(0)} ms`} />
          <Metric
            k="WB kazancı"
            v={`${d.whiteBalanceGain[0].toFixed(2)} / ${d.whiteBalanceGain[2].toFixed(2)}`}
          />
          <Metric k="eksen r" v={d.ripenessAxis.toFixed(3)} />
        </dl>
      </div>

      <Section title="Eksen bileşenleri">
        {(Object.entries(d.axisParts) as [string, number][]).map(([k, v]) => (
          <Bar key={k} label={k} value={v} color="#689F38" />
        ))}
      </Section>

      <Section title="Sınıf olasılıkları">
        {RIPENESS_ORDER.map((r) => (
          <Bar
            key={r.id}
            label={r.label}
            value={result.probabilities[r.id]}
            color={r.color}
            highlight={r.id === result.topClass}
          />
        ))}
      </Section>

      <Section title="Güven bileşenleri">
        {(Object.entries(d.quality) as [string, number][]).map(([k, v]) => (
          <Bar key={k} label={k} value={v} color="#558B2F" />
        ))}
      </Section>

      <div>
        <p className="font-semibold text-av-skin/60">Tetiklenen kurallar</p>
        <div className="mt-1.5 flex flex-wrap gap-1">
          {d.firedRules.map((r) => (
            <span
              key={r}
              className="rounded-full bg-av-mist px-2 py-0.5 font-mono text-[10px] text-av-skin/70"
            >
              {r}
            </span>
          ))}
          <span className="rounded-full bg-av-mist px-2 py-0.5 font-mono text-[10px] text-av-skin/70">
            ton={result.skinTone} → prior={result.colorCategory}
          </span>
        </div>
      </div>

      {result.reasons.length > 0 ? (
        <div>
          <p className="font-semibold text-av-skin/60">Üretilen gerekçeler</p>
          <ul className="mt-1 list-disc space-y-0.5 pl-4 text-av-skin/65">
            {result.reasons.map((r, i) => (
              <li key={i}>{r.text}</li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

/** Segmentasyon maskesini görselleştirir — yanlış tahminlerin en sık sebebi burada görünür. */
function MaskCanvas({ preview }: { preview?: { width: number; height: number; data: Uint8Array } }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas || !preview) return;
    canvas.width = preview.width;
    canvas.height = preview.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const img = ctx.createImageData(preview.width, preview.height);
    for (let i = 0; i < preview.data.length; i++) {
      const p = i * 4;
      const on = preview.data[i] === 1;
      img.data[p] = on ? 0x55 : 0xf1;
      img.data[p + 1] = on ? 0x8b : 0xf5;
      img.data[p + 2] = on ? 0x2f : 0xea;
      img.data[p + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
  }, [preview]);

  if (!preview) return null;

  return (
    <figure className="shrink-0">
      <canvas
        ref={ref}
        className="h-24 w-auto rounded-lg border border-av-line"
        style={{ imageRendering: "pixelated" }}
      />
      <figcaption className="mt-1 text-center text-[10px] text-av-skin/45">maske</figcaption>
    </figure>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="font-semibold text-av-skin/60">{title}</p>
      <div className="mt-1.5 space-y-1">{children}</div>
    </div>
  );
}

function Bar({
  label,
  value,
  color,
  highlight,
}: {
  label: string;
  value: number;
  color: string;
  highlight?: boolean;
}) {
  return (
    <div className="flex items-center gap-2">
      <span
        className={`w-28 shrink-0 truncate ${highlight ? "font-bold" : "text-av-skin/60"}`}
      >
        {label}
      </span>
      <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-av-mist">
        <span
          className="block h-full rounded-full"
          style={{ width: `${Math.round(value * 100)}%`, backgroundColor: color }}
        />
      </span>
      <span className="w-10 text-right tabular-nums text-av-skin/50">
        {value.toFixed(3)}
      </span>
    </div>
  );
}

function Metric({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between gap-2">
      <dt className="text-av-skin/50">{k}</dt>
      <dd className="font-medium">{v}</dd>
    </div>
  );
}
