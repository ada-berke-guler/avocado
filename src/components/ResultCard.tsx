import { AvocadoMark } from "./AvocadoMark";
import { RIPENESS, RIPENESS_ORDER, daysText } from "@/lib/ripeness";
import type { AnalysisResult } from "@/lib/types";

/** Sonuç kartı: tahmin edilen aşama, ne zaman yenir, skala üzerindeki yeri. */
export function ResultCard({
  result,
  previewUrl,
}: {
  result: AnalysisResult;
  previewUrl?: string | null;
}) {
  const info = RIPENESS[result.topClass];

  return (
    <section
      className="rounded-card p-5"
      style={{ backgroundColor: info.color, color: info.onColor }}
      aria-live="polite"
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold tracking-widest uppercase opacity-70">
            {info.stage}/5 · {info.label}
          </p>
          <h1 className="mt-1 text-[1.75rem] leading-tight font-bold text-balance">
            {info.headline}
          </h1>
          <p className="mt-1.5 text-sm opacity-85">
            Tahmini yenme zamanı: <strong className="font-semibold">{daysText(info)}</strong>
          </p>
        </div>

        {previewUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- bellekteki data URL, optimize edilecek bir kaynak değil
          <img
            src={previewUrl}
            alt="Çektiğin avokado"
            className="h-20 w-16 shrink-0 rounded-xl object-cover ring-2 ring-white/25"
          />
        ) : (
          <AvocadoMark className="h-20 w-auto shrink-0 opacity-25" color={info.onColor} />
        )}
      </div>

      <p className="mt-4 text-[13px] leading-relaxed opacity-90">{info.advice}</p>

      {/* Skala üzerindeki yer — 5 aşamanın hangisindeyiz */}
      <ol className="mt-5 flex items-end gap-1" aria-label="Olgunluk skalası">
        {RIPENESS_ORDER.map((r) => {
          const active = r.id === result.topClass;
          return (
            <li
              key={r.id}
              className="flex-1"
              aria-current={active ? "step" : undefined}
              title={r.label}
            >
              <span
                className={`block rounded-full transition-all ${active ? "h-3" : "h-1.5"}`}
                style={{
                  backgroundColor: info.onColor,
                  opacity: active ? 1 : 0.35,
                }}
              />
            </li>
          );
        })}
      </ol>
      <div className="mt-1.5 flex justify-between text-[10px] opacity-65">
        <span>ham</span>
        <span>olgun</span>
      </div>
    </section>
  );
}
