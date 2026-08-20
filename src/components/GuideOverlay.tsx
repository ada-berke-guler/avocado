import { GUIDE_ELLIPSE_RX, GUIDE_ELLIPSE_RY } from "@/lib/engine/constants";

/**
 * Kamera üstündeki rehber çerçeve.
 *
 * Elipsin ölçüleri motorun GUIDE_ELLIPSE_* sabitlerinden gelir — kullanıcının
 * gördüğü çerçeve ile motorun "avokado burada" varsayımı birebir aynı olmalı.
 * İkisi ayrışırsa segmentasyon sessizce yanlış bölgeyi ölçmeye başlar.
 */
export function GuideOverlay({ hint }: { hint?: string | null }) {
  const rx = GUIDE_ELLIPSE_RX * 100;
  const ry = GUIDE_ELLIPSE_RY * 100;

  return (
    <div className="pointer-events-none absolute inset-0">
      <svg
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        className="h-full w-full"
        aria-hidden
      >
        <defs>
          <mask id="guide-hole">
            <rect width="100" height="100" fill="white" />
            <ellipse cx="50" cy="50" rx={rx} ry={ry} fill="black" />
          </mask>
        </defs>
        {/* Dışarısı karartılır: gözü çerçeveye çeker ve kadrajın dışını görsel olarak eler */}
        <rect width="100" height="100" fill="#2C3E50" opacity="0.45" mask="url(#guide-hole)" />
        <ellipse
          cx="50"
          cy="50"
          rx={rx}
          ry={ry}
          fill="none"
          stroke="#DCE775"
          strokeWidth="0.6"
          strokeDasharray="4 3"
          vectorEffect="non-scaling-stroke"
        />
      </svg>

      {hint ? (
        <p className="absolute inset-x-0 bottom-4 mx-auto w-fit max-w-[85%] rounded-pill bg-av-skin/80 px-3.5 py-1.5 text-center text-[13px] font-medium text-white backdrop-blur-sm">
          {hint}
        </p>
      ) : null}
    </div>
  );
}
