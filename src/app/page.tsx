import Link from "next/link";
import { AvocadoMark } from "@/components/AvocadoMark";
import { RipenessIntro } from "@/components/RipenessIntro";
import { RIPENESS_ORDER } from "@/lib/ripeness";

const STEPS = [
  {
    n: "1",
    title: "Fotoğrafı çek",
    text: "Avokadoyu çerçeveye sığdır. Gündüz ışığı en iyi sonucu verir.",
  },
  {
    n: "2",
    title: "Renk analiz edilir",
    text: "Kabuğun rengi, koyuluğu ve lekeleri telefonunda ölçülür.",
  },
  {
    n: "3",
    title: "Sonucu gör",
    text: "Olgunluk tahmini, kaç gün kaldığı ve bu yorumun gerekçeleri.",
  },
];

export default function HomePage() {
  return (
    <main className="flex min-h-svh flex-col">
      {/* Her yüklemede oynayan açılış animasyonu; tek dokunuşla atlanır. */}
      <RipenessIntro />

      <div className="shell pt-safe flex flex-1 flex-col">
        {/* marka */}
        <header className="flex items-center gap-2 py-2">
          <AvocadoMark className="h-6 w-auto" color="#558B2F" />
          <span className="text-sm font-semibold tracking-tight text-av-skin/70">
            Avokado Testi
          </span>
        </header>

        {/* hero */}
        <section className="flex flex-col items-center pt-6 text-center">
          <div className="relative">
            <div
              aria-hidden
              className="absolute inset-0 -z-10 translate-y-3 scale-110 rounded-full bg-av-fresh/60 blur-2xl"
            />
            {/* assets/logo.png'den kırpıldı (zemin + köşe yaprakları temizlendi).
                Dekoratif: anlamı h1 taşıyor, o yüzden alt boş.
                eslint-disable-next-line @next/next/no-img-element -- statik, ölçüsü sabit */}
            <img
              src="/avokado.png"
              alt=""
              aria-hidden
              width={281}
              height={385}
              fetchPriority="high"
              className="h-40 w-auto"
            />
          </div>

          <h1 className="mt-6 text-[2rem] leading-[1.15] font-bold tracking-tight text-balance">
            Bu avokado
            <br />
            bugün yenir mi?
          </h1>

          <p className="mt-3 text-[15px] leading-relaxed text-av-skin/70 text-pretty">
            Fotoğrafını çek. Kabuğun rengini ölçüp olgunluk tahminini,
            kaç gün kaldığını ve bu yorumun gerekçelerini göstereyim.
          </p>
        </section>

        {/* birincil eylem */}
        <div className="mt-8">
          <Link
            href="/analiz"
            className="flex w-full items-center justify-center gap-2 rounded-pill bg-av-ready px-6 py-4 text-lg font-semibold text-av-skin shadow-[0_6px_0_0_#A4C639] transition active:translate-y-0.75 active:shadow-[0_3px_0_0_#A4C639]"
          >
            <CameraIcon className="h-5 w-5" />
            Kamerayı Aç
          </Link>

          <p className="mt-3 flex items-center justify-center gap-1.5 text-[13px] text-av-skin/60">
            <LockIcon className="h-3.5 w-3.5" />
            Fotoğrafın telefonundan çıkmıyor
          </p>
        </div>

        {/* olgunluk skalası */}
        <section className="mt-9" aria-labelledby="skala-baslik">
          <h2
            id="skala-baslik"
            className="text-xs font-semibold tracking-wide text-av-skin/50 uppercase"
          >
            Olgunluk skalası
          </h2>
          <ol className="mt-3 flex gap-1.5">
            {RIPENESS_ORDER.map((r) => (
              <li key={r.id} className="flex-1">
                <div
                  className="h-2.5 w-full rounded-full"
                  style={{ backgroundColor: r.color }}
                />
                <span className="mt-2 block text-[10px] leading-tight text-av-skin/55">
                  {r.label}
                </span>
              </li>
            ))}
          </ol>
        </section>

        {/* nasıl çalışır */}
        <section className="mt-8" aria-labelledby="nasil-baslik">
          <h2
            id="nasil-baslik"
            className="text-xs font-semibold tracking-wide text-av-skin/50 uppercase"
          >
            Nasıl çalışır
          </h2>
          <ul className="mt-3 space-y-2.5">
            {STEPS.map((s) => (
              <li
                key={s.n}
                className="flex gap-3 rounded-card border border-av-line bg-av-mist/60 p-3.5"
              >
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-av-ripe text-sm font-bold text-white">
                  {s.n}
                </span>
                <div>
                  <p className="text-[15px] font-semibold">{s.title}</p>
                  <p className="mt-0.5 text-[13px] leading-snug text-av-skin/65">
                    {s.text}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </section>

        <footer className="pb-safe mt-auto pt-8 text-center">
          <p className="text-[12px] leading-relaxed text-av-skin/45 text-pretty">
            Bu bir tahmin aracıdır, kesin sonuç vermez. Kabuk rengine bakar;
            sertlik ve iç dokuyu ölçemez. Hass çeşidi için kalibre edilmiştir.
          </p>
          <Link
            href="/test"
            className="mt-3 inline-block text-[12px] font-medium text-av-skin/40 underline underline-offset-4"
          >
            Test modu
          </Link>
        </footer>
      </div>
    </main>
  );
}

function CameraIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" aria-hidden>
      <path
        d="M3 8.5A2.5 2.5 0 0 1 5.5 6h1.7a1 1 0 0 0 .83-.45l.94-1.4A1 1 0 0 1 9.8 3.7h4.4a1 1 0 0 1 .83.45l.94 1.4A1 1 0 0 0 16.8 6h1.7A2.5 2.5 0 0 1 21 8.5v9a2.5 2.5 0 0 1-2.5 2.5h-13A2.5 2.5 0 0 1 3 17.5v-9Z"
        stroke="currentColor"
        strokeWidth="1.8"
      />
      <circle cx="12" cy="13" r="3.6" stroke="currentColor" strokeWidth="1.8" />
    </svg>
  );
}

function LockIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" aria-hidden>
      <rect
        x="4.5"
        y="10"
        width="15"
        height="10.5"
        rx="2.5"
        stroke="currentColor"
        strokeWidth="2"
      />
      <path
        d="M8 10V7.5a4 4 0 1 1 8 0V10"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}
