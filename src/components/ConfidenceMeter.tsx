import type { QualitySignals } from "@/lib/types";

const SIGNAL_LABEL: Record<keyof QualitySignals, string> = {
  lightingQuality: "Işık",
  maskQuality: "Kadraj",
  sharpness: "Netlik",
  colorSeparation: "Renk ayrımı",
  colorPurity: "Yüzey tekdüzeliği",
};

/**
 * Güven göstergesi.
 *
 * Tek bir yüzde göstermek yerine bileşenleri de açıyoruz: kullanıcı "%64" sayısına
 * inanmak zorunda kalmasın, neyin iyi neyin kötü olduğunu görüp kendi kararını versin.
 */
export function ConfidenceMeter({
  confidence,
  signals,
}: {
  confidence: number;
  signals: QualitySignals;
}) {
  const pct = Math.round(confidence * 100);
  const color = confidence >= 0.75 ? "#558B2F" : confidence >= 0.6 ? "#A4C639" : "#D4E157";

  return (
    <section aria-labelledby="guven-baslik">
      <div className="flex items-baseline justify-between">
        <h2 id="guven-baslik" className="text-sm font-semibold">
          Güven
        </h2>
        <span className="text-sm font-bold tabular-nums">%{pct}</span>
      </div>

      <div
        className="mt-2 h-2.5 w-full overflow-hidden rounded-full bg-av-mist"
        role="meter"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-labelledby="guven-baslik"
      >
        <div
          className="h-full rounded-full transition-[width] duration-500"
          style={{ width: `${pct}%`, backgroundColor: color }}
        />
      </div>

      <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1.5">
        {(Object.keys(SIGNAL_LABEL) as (keyof QualitySignals)[]).map((key) => (
          <div key={key} className="flex items-center gap-2">
            <dt className="min-w-0 flex-1 truncate text-[11px] text-av-skin/55">
              {SIGNAL_LABEL[key]}
            </dt>
            <dd className="flex items-center gap-1.5">
              <span className="h-1.5 w-10 overflow-hidden rounded-full bg-av-mist">
                <span
                  className="block h-full rounded-full bg-av-natural"
                  style={{ width: `${Math.round(signals[key] * 100)}%` }}
                />
              </span>
              <span className="w-8 text-right text-[11px] tabular-nums text-av-skin/45">
                %{Math.round(signals[key] * 100)}
              </span>
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
