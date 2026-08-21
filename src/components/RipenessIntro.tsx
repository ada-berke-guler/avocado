"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { RIPENESS_ORDER } from "@/lib/ripeness";

/**
 * Açılış animasyonu (onboarding).
 *
 * Landing her açıldığında 5 olgunluk evresini sırayla gösterir ve sonuncuda
 * (olgun/hazır) durup sahneyi kullanıcıya bırakır. Amaç: uygulamanın neyi
 * ölçtüğünü tek bakışta anlatmak.
 *
 * Görseller assets/animasyon.png'den kırpıldı → public/onboarding/stage-N.webp.
 * Kaynak evre başına ~141px; sahne 176px CSS (2x ekranda 352px) olduğu için
 * tarayıcıya gerdirmek yerine lanczos ile 2.5x büyütülüp WebP olarak kaydedildi
 * (palete indirgenmiş PNG'de dither beneği görünüyordu).
 * Beşi de aynı taban çizgisinde kırpıldığı için üst üste bindirildiğinde
 * avokado yerinde duruyor, sadece rengi değişiyor — geçiş "aynı avokado
 * olgunlaşıyor" hissi veriyor.
 *
 * Depolama yok: CLAUDE.md §9 ana akışta localStorage/cookie yasaklıyor. Bu
 * yüzden "daha önce gördü mü" bilgisi tutulmuyor, animasyon her yüklemede oynar
 * (istenen davranış) ve tek dokunuşla atlanabiliyor.
 */

/** Her ara evrenin ekranda kalma süresi. 420ms: okunacak kadar uzun, beklemeyi
 *  hissettirmeyecek kadar kısa (4 geçiş = 1.7sn). */
const STAGE_MS = 420;
/** Son evre (olgun) bu kadar bekler — animasyon burada "duruyor". */
const FINAL_HOLD_MS = 950;
/** Perdenin açılma süresi; globals.css'teki geçiş süreleriyle aynı ailede. */
const FADE_MS = 420;

/** Kırpılan karelerin genişliği evreye göre değişiyor; yükseklik hepsinde aynı. */
const FRAME_W: Record<number, number> = { 1: 393, 2: 390, 3: 360, 4: 370, 5: 358 };
const FRAME_H = 353;

const STAGES = RIPENESS_ORDER.map((info) => ({
  ...info,
  src: `/onboarding/stage-${info.stage}.webp`,
  width: FRAME_W[info.stage],
}));

type Phase = "run" | "settle" | "leave" | "done";

export function RipenessIntro() {
  const [index, setIndex] = useState(0);
  const [phase, setPhase] = useState<Phase>("run");
  const timers = useRef<number[]>([]);

  const clearTimers = useCallback(() => {
    for (const id of timers.current) window.clearTimeout(id);
    timers.current = [];
  }, []);

  /** Atla: son kareye sabitle ve perdeyi aç. */
  const skip = useCallback(() => {
    clearTimers();
    setIndex(STAGES.length - 1);
    setPhase((p) => (p === "leave" || p === "done" ? p : "leave"));
    timers.current.push(window.setTimeout(() => setPhase("done"), FADE_MS));
  }, [clearTimers]);

  useEffect(() => {
    // Hareket azaltma tercihi: animasyonu hiç oynatma. globals.css zaten tüm
    // süreleri sıfırlıyor; perdeyi açık bırakmak donmuş bir ekran demek olurdu.
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced) {
      setPhase("done");
      return;
    }

    const at = (ms: number, fn: () => void) => {
      timers.current.push(window.setTimeout(fn, ms));
    };

    for (let i = 1; i < STAGES.length; i++) {
      at(i * STAGE_MS, () => setIndex(i));
    }
    const lastAt = (STAGES.length - 1) * STAGE_MS;
    at(lastAt, () => setPhase("settle"));
    at(lastAt + FINAL_HOLD_MS, () => setPhase("leave"));
    at(lastAt + FINAL_HOLD_MS + FADE_MS, () => setPhase("done"));

    return clearTimers;
  }, [clearTimers]);

  // Perde açıkken arkadaki sayfa kaymasın.
  useEffect(() => {
    if (phase === "done") return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [phase]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") skip();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [skip]);

  if (phase === "done") return null;

  const current = STAGES[index];
  const leaving = phase === "leave";

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Avokado olgunluk evreleri"
      onClick={skip}
      style={{ transitionDuration: `${FADE_MS}ms` }}
      className={`intro-overlay fixed inset-0 z-50 flex flex-col items-center justify-center gap-7 bg-av-cream px-6 transition-opacity ease-out ${
        leaving ? "pointer-events-none opacity-0" : "opacity-100"
      }`}
    >
      {/* Perde sunucuda da basılıyor (hydration'a kadar splash gibi durur, içerik
          zıplamaz). JS hiç çalışmazsa perdeyi kaldıracak kimse olmaz — o durumda
          landing'i kilitlememek için CSS ile gizliyoruz. */}
      <noscript>
        <style>{`.intro-overlay{display:none}`}</style>
      </noscript>

      {/* sahne */}
      <div className="relative flex h-44 w-60 items-center justify-center">
        <div
          aria-hidden
          className="absolute inset-0 -z-10 scale-110 rounded-full bg-av-fresh/50 blur-2xl transition-opacity duration-500"
        />
        {STAGES.map((s, i) => {
          const active = i === index;
          return (
            /* eslint-disable-next-line @next/next/no-img-element -- statik, ölçüsü sabit */
            <img
              key={s.id}
              src={s.src}
              alt=""
              aria-hidden
              width={s.width}
              height={FRAME_H}
              /* Hepsi baştan DOM'da: geçiş anında yükleme beklemesin, kare atlamasın. */
              className={`absolute h-full w-auto object-contain transition-[opacity,transform] duration-300 ease-out ${
                active
                  ? `opacity-100 ${phase === "settle" ? "animate-intro-pop" : "scale-100"}`
                  : "scale-90 opacity-0"
              }`}
            />
          );
        })}
      </div>

      {/* evre adı — her değişimde yeniden monte olsun diye key={index} */}
      <div key={index} className="animate-intro-rise text-center">
        {/* Etiket rengi hep av-skin: evre renkleri (av-unripe gibi) krem zeminde
            AA kontrastı tutturamıyor — renk bilgisini alttaki şerit taşıyor. */}
        <p className="text-[1.35rem] leading-tight font-bold tracking-tight">
          {current.label}
        </p>
        <p className="mt-1 text-[13px] text-av-skin/60">{current.headline}</p>
      </div>

      {/* ilerleme: dolan evreler kendi renklerini alır */}
      <ol className="flex w-52 gap-1.5" aria-hidden>
        {STAGES.map((s, i) => (
          <li
            key={s.id}
            className="h-1.5 flex-1 rounded-full transition-colors duration-300"
            style={{ backgroundColor: i <= index ? s.color : "var(--color-av-line)" }}
          />
        ))}
      </ol>

      <button
        type="button"
        onClick={skip}
        className="absolute right-5 bottom-8 left-5 mx-auto w-fit rounded-pill px-4 py-2 text-[13px] font-medium text-av-skin/45"
      >
        Atla
      </button>
    </div>
  );
}
