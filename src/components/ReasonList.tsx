import type { Reason } from "@/lib/types";

/** Gerekçe listesi — sonucun neye dayandığını maddeler halinde gösterir. */
export function ReasonList({
  title,
  reasons,
  variant = "reason",
}: {
  title: string;
  reasons: Reason[];
  variant?: "reason" | "warning";
}) {
  if (reasons.length === 0) return null;

  return (
    <section aria-label={title}>
      <h2 className="text-xs font-semibold tracking-wide text-av-skin/50 uppercase">
        {title}
      </h2>
      <ul
        className={`mt-2.5 space-y-2 rounded-card border p-3.5 ${
          variant === "warning"
            ? "border-av-unripe/70 bg-av-unripe/15"
            : "border-av-line bg-av-mist/50"
        }`}
      >
        {reasons.map((r, i) => (
          <li key={i} className="flex gap-2.5 text-[13px] leading-snug">
            <Bullet reason={r} />
            <span className={r.kind === "limit" ? "text-av-skin/55" : "text-av-skin/80"}>
              {r.text}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function Bullet({ reason }: { reason: Reason }) {
  const color =
    reason.tone === "positive"
      ? "#558B2F"
      : reason.tone === "negative"
        ? "#8A6D1F"
        : "#689F38";

  if (reason.kind === "limit") {
    return (
      <svg viewBox="0 0 16 16" className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden>
        <circle cx="8" cy="8" r="6.5" fill="none" stroke="#8FA6B2" strokeWidth="1.6" />
        <path d="M8 4.6v.1M8 7v4.4" stroke="#8FA6B2" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
    );
  }

  return (
    <span
      className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full"
      style={{ backgroundColor: color }}
      aria-hidden
    />
  );
}
