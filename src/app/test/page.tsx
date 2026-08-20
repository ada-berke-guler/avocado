"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { DebugPanel } from "@/components/DebugPanel";
import { analyze } from "@/lib/engine";
import { decodeBlob, toPreviewUrl } from "@/lib/engine/decode";
import { RIPENESS, RIPENESS_ORDER } from "@/lib/ripeness";
import type { AnalysisResult, RipenessClass } from "@/lib/types";

/**
 * TEST MODU — son kullanıcı için değil.
 *
 * Amaç: sistemi insanlara sunmadan önce gerçek fotoğraflarla ölçmek.
 * İnternetten toplanan, olgunluğu bilinen fotoğrafları buraya yükleyip elle
 * etiketliyoruz; çıkan confusion matrix ve hata örnekleri constants.ts'teki
 * eşikleri kalibre etmek için kullanılıyor (CLAUDE.md Faz 6).
 *
 * Ana akıştan tek farkı burada localStorage kullanılması: etiketler oturumlar
 * arasında korunmalı. Fotoğraflar burada da hiçbir yere yazılmaz, gönderilmez.
 */

const LABELS_KEY = "avokado-test-labels-v1";

interface TestItem {
  id: string;
  name: string;
  previewUrl: string;
  result: AnalysisResult;
}

export default function TestPage() {
  const [items, setItems] = useState<TestItem[]>([]);
  const [labels, setLabels] = useState<Record<string, RipenessClass>>({});
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(LABELS_KEY);
      if (raw) setLabels(JSON.parse(raw));
    } catch {
      // Bozuk/erişilemez depolama testi engellememeli.
    }
  }, []);

  const setLabel = useCallback((id: string, cls: RipenessClass) => {
    setLabels((prev) => {
      // Aynı etikete tekrar basmak işareti kaldırır.
      const next = { ...prev };
      if (next[id] === cls) delete next[id];
      else next[id] = cls;
      try {
        localStorage.setItem(LABELS_KEY, JSON.stringify(next));
      } catch {
        // yoksay
      }
      return next;
    });
  }, []);

  const addFiles = useCallback(async (files: FileList) => {
    setBusy(true);
    try {
      for (const file of Array.from(files)) {
        // Dosya adı + boyut: aynı fotoğrafı tekrar yüklediğinde etiketi hatırlansın.
        const id = `${file.name}:${file.size}`;
        const frame = await decodeBlob(file);
        const bitmap = await createImageBitmap(file);
        const previewUrl = toPreviewUrl(bitmap, bitmap.width, bitmap.height, {
          maxEdge: 320,
        });
        bitmap.close();
        const result = analyze(frame);
        setItems((prev) => [
          ...prev.filter((i) => i.id !== id),
          { id, name: file.name, previewUrl, result },
        ]);
      }
    } finally {
      setBusy(false);
    }
  }, []);

  const stats = useMemo(() => summarize(items, labels), [items, labels]);

  const exportJson = () => {
    const payload = {
      exportedAt: new Date().toISOString(),
      accuracy: stats.labeled > 0 ? stats.correct / stats.labeled : null,
      labeled: stats.labeled,
      total: items.length,
      items: items.map((i) => ({
        name: i.name,
        truth: labels[i.id] ?? null,
        predicted: i.result.topClass,
        ok: i.result.ok,
        confidence: i.result.confidence,
        skinTone: i.result.skinTone,
        colorCategory: i.result.colorCategory,
        probabilities: i.result.probabilities,
        axis: i.result.debug.ripenessAxis,
        axisParts: i.result.debug.axisParts,
        features: i.result.debug.features,
        quality: i.result.debug.quality,
        maskArea: i.result.debug.maskArea,
        whiteBalanceGain: i.result.debug.whiteBalanceGain,
        firedRules: i.result.debug.firedRules,
      })),
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `avokado-test-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <main className="mx-auto w-full max-w-3xl px-4 pt-safe pb-12">
      <header className="flex items-center justify-between py-3">
        <Link href="/" className="text-sm font-medium text-av-skin/60">
          ← Ana sayfa
        </Link>
        <span className="rounded-pill bg-av-skin px-2.5 py-1 text-[11px] font-semibold text-av-ready">
          TEST MODU
        </span>
      </header>

      <p className="text-[13px] leading-relaxed text-av-skin/65">
        Olgunluk durumunu bildiğin fotoğrafları yükle, her birine gerçek aşamayı işaretle.
        Aşağıda doğruluk ve karışıklık matrisi çıkar. Etiketler tarayıcında saklanır,
        fotoğraflar hiçbir yere gitmez.
      </p>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <label className="cursor-pointer rounded-pill bg-av-ready px-4 py-2.5 text-sm font-semibold text-av-skin">
          <input
            type="file"
            accept="image/*"
            multiple
            className="sr-only"
            onChange={(e) => {
              const files = e.target.files;
              e.target.value = "";
              if (files?.length) void addFiles(files);
            }}
          />
          {busy ? "İşleniyor…" : "Fotoğraf ekle"}
        </label>

        {items.length > 0 ? (
          <>
            <button
              type="button"
              onClick={exportJson}
              className="rounded-pill border border-av-line px-4 py-2.5 text-sm font-medium"
            >
              JSON dışa aktar
            </button>
            <button
              type="button"
              onClick={() => {
                setItems([]);
                setOpen({});
              }}
              className="text-sm text-av-skin/45"
            >
              Listeyi temizle
            </button>
          </>
        ) : null}
      </div>

      {items.length > 0 ? (
        <Summary stats={stats} total={items.length} />
      ) : (
        <p className="mt-10 text-center text-sm text-av-skin/40">
          Henüz fotoğraf yok.
        </p>
      )}

      <ul className="mt-6 space-y-3">
        {items.map((item) => {
          const truth = labels[item.id];
          const correct = truth ? truth === item.result.topClass : null;
          return (
            <li
              key={item.id}
              className={`rounded-card border p-3 ${
                correct === null
                  ? "border-av-line bg-av-mist/40"
                  : correct
                    ? "border-av-natural/50 bg-av-fresh/30"
                    : "border-av-unripe bg-av-unripe/15"
              }`}
            >
              <div className="flex gap-3">
                {/* eslint-disable-next-line @next/next/no-img-element -- bellekteki data URL */}
                <img
                  src={item.previewUrl}
                  alt={item.name}
                  className="h-24 w-20 shrink-0 rounded-lg object-cover"
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[11px] text-av-skin/45">{item.name}</p>
                  <p className="mt-0.5 text-[15px] font-semibold">
                    {RIPENESS[item.result.topClass].label}
                    {!item.result.ok ? (
                      <span className="ml-2 text-[11px] font-normal text-av-skin/50">
                        (eşik altı — kullanıcıya gösterilmezdi)
                      </span>
                    ) : null}
                  </p>
                  <p className="text-[12px] text-av-skin/60">
                    güven %{Math.round(item.result.confidence * 100)} · eksen{" "}
                    {item.result.debug.ripenessAxis.toFixed(2)} · ton {item.result.skinTone}
                  </p>

                  <div className="mt-2">
                    <p className="text-[10px] tracking-wide text-av-skin/45 uppercase">
                      Gerçek aşama
                    </p>
                    <div className="mt-1 flex flex-wrap gap-1">
                      {RIPENESS_ORDER.map((r) => (
                        <button
                          key={r.id}
                          type="button"
                          onClick={() => setLabel(item.id, r.id)}
                          aria-pressed={truth === r.id}
                          className={`rounded-full px-2 py-1 text-[11px] font-medium transition ${
                            truth === r.id
                              ? "text-white"
                              : "bg-av-cream text-av-skin/60 hover:bg-av-mist"
                          }`}
                          style={
                            truth === r.id
                              ? { backgroundColor: r.color, color: r.onColor }
                              : undefined
                          }
                        >
                          {r.stage}. {r.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => setOpen((p) => ({ ...p, [item.id]: !p[item.id] }))}
                    className="mt-2 text-[11px] font-medium text-av-skin/50 underline underline-offset-2"
                  >
                    {open[item.id] ? "Detayı gizle" : "Detayı göster"}
                  </button>
                </div>
              </div>

              {open[item.id] ? <DebugPanel result={item.result} /> : null}
            </li>
          );
        })}
      </ul>
    </main>
  );
}

interface Stats {
  labeled: number;
  correct: number;
  /** matrix[gerçek][tahmin] */
  matrix: Record<RipenessClass, Record<RipenessClass, number>>;
  /** Komşu aşamaya kaçan tahminler — tam isabet değil ama ciddi hata da değil */
  offByOne: number;
  belowThreshold: number;
}

function summarize(items: TestItem[], labels: Record<string, RipenessClass>): Stats {
  const empty = () =>
    Object.fromEntries(RIPENESS_ORDER.map((r) => [r.id, 0])) as Record<
      RipenessClass,
      number
    >;
  const matrix = Object.fromEntries(
    RIPENESS_ORDER.map((r) => [r.id, empty()]),
  ) as Stats["matrix"];

  let labeled = 0;
  let correct = 0;
  let offByOne = 0;
  let belowThreshold = 0;

  for (const item of items) {
    if (!item.result.ok) belowThreshold++;
    const truth = labels[item.id];
    if (!truth) continue;
    labeled++;
    const pred = item.result.topClass;
    matrix[truth][pred]++;
    if (truth === pred) correct++;
    else if (Math.abs(RIPENESS[truth].stage - RIPENESS[pred].stage) === 1) offByOne++;
  }

  return { labeled, correct, matrix, offByOne, belowThreshold };
}

function Summary({ stats, total }: { stats: Stats; total: number }) {
  const acc = stats.labeled > 0 ? stats.correct / stats.labeled : null;
  const near = stats.labeled > 0 ? (stats.correct + stats.offByOne) / stats.labeled : null;

  return (
    <section className="mt-5 rounded-card border border-av-line bg-av-mist/50 p-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Fotoğraf" value={String(total)} />
        <Stat label="Etiketli" value={String(stats.labeled)} />
        <Stat
          label="Tam isabet"
          value={acc === null ? "—" : `%${Math.round(acc * 100)}`}
        />
        <Stat
          label="±1 aşama"
          value={near === null ? "—" : `%${Math.round(near * 100)}`}
        />
      </div>
      <p className="mt-2 text-[11px] text-av-skin/45">
        {stats.belowThreshold} fotoğraf güven eşiğinin altında kaldı (kullanıcıya sonuç
        gösterilmezdi).
      </p>

      {stats.labeled > 0 ? (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[420px] border-collapse text-[11px]">
            <caption className="mb-1.5 text-left text-[10px] tracking-wide text-av-skin/45 uppercase">
              Karışıklık matrisi (satır: gerçek, sütun: tahmin)
            </caption>
            <thead>
              <tr>
                <th className="p-1 text-left font-medium text-av-skin/45">gerçek ↓</th>
                {RIPENESS_ORDER.map((r) => (
                  <th key={r.id} className="p-1 font-medium text-av-skin/45">
                    {r.stage}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {RIPENESS_ORDER.map((truth) => (
                <tr key={truth.id}>
                  <th className="p-1 text-left font-medium whitespace-nowrap text-av-skin/60">
                    {truth.stage}. {truth.label}
                  </th>
                  {RIPENESS_ORDER.map((pred) => {
                    const n = stats.matrix[truth.id][pred.id];
                    const diag = truth.id === pred.id;
                    return (
                      <td
                        key={pred.id}
                        className={`p-1 text-center tabular-nums ${
                          n === 0
                            ? "text-av-skin/20"
                            : diag
                              ? "rounded bg-av-natural font-bold text-white"
                              : "rounded bg-av-unripe/50 font-semibold"
                        }`}
                      >
                        {n}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </section>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[10px] tracking-wide text-av-skin/45 uppercase">{label}</p>
      <p className="text-lg font-bold tabular-nums">{value}</p>
    </div>
  );
}
