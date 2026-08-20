/**
 * Marka işareti: tek parça avokado silueti.
 * Rengi dışarıdan verilir — sonuç ekranında tahmin edilen sınıfın rengiyle boyanır,
 * böylece aynı şekil hem logo hem de sonuç göstergesi olarak çalışır.
 */
export function AvocadoMark({
  className,
  color = "currentColor",
  stemColor,
  title,
}: {
  className?: string;
  color?: string;
  stemColor?: string;
  /** Verilirse erişilebilir bir görsel, verilmezse dekoratif sayılır */
  title?: string;
}) {
  return (
    <svg
      viewBox="0 0 100 124"
      className={className}
      role={title ? "img" : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
      fill="none"
    >
      {/* sap */}
      <path
        d="M50 12c0-5 2-8 5-10"
        stroke={stemColor ?? color}
        strokeWidth="6"
        strokeLinecap="round"
        opacity={stemColor ? 1 : 0.55}
      />
      {/* gövde */}
      <path
        d="M50 10c11 0 17 11 15 24 12 12 20 28 20 44 0 24-16 40-35 40S15 102 15 78c0-16 8-32 20-44C33 21 39 10 50 10Z"
        fill={color}
      />
      {/* ışık vurgusu — hacim hissi, düz tasarımı bozmadan */}
      <ellipse cx="36" cy="84" rx="10" ry="15" fill="#FFFFFF" opacity="0.14" />
    </svg>
  );
}
