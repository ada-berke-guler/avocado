import type { RipenessClass, RipenessInfo } from "./types";

/**
 * 5 sınıfın kullanıcıya sunum bilgisi.
 * Renkler assets/Screenshot 2026-08-20 204114.png paletinden, olgunlaştıkça koyulaşacak
 * şekilde sıralandı. onColor değerleri AA (4.5:1) kontrast sağlar.
 */
export const RIPENESS: Record<RipenessClass, RipenessInfo> = {
  hard: {
    id: "hard",
    stage: 1,
    label: "Sert / Ham",
    headline: "Henüz çok erken",
    advice:
      "Oda sıcaklığında beklet. Kağıt torbaya muz veya elmayla koyarsan 1-2 gün hızlanır.",
    daysMin: 4,
    daysMax: 6,
    color: "#D4E157",
    onColor: "#2C3E50",
  },
  "pre-conditioned": {
    id: "pre-conditioned",
    stage: 2,
    label: "Ön Olgunlaşma",
    headline: "Yolda, ama daha var",
    advice: "Oda sıcaklığında, doğrudan güneş görmeyen bir yerde beklet.",
    daysMin: 3,
    daysMax: 4,
    color: "#A4C639",
    onColor: "#2C3E50",
  },
  breaking: {
    id: "breaking",
    stage: 3,
    label: "Olgunlaşmaya Başlamış",
    headline: "Dönmeye başlamış",
    advice: "Birkaç gün daha bekleyebilir. Acelen varsa dolapta yavaşlatabilirsin.",
    daysMin: 2,
    daysMax: 3,
    color: "#689F38",
    onColor: "#FFFFFF",
  },
  "firm-ripe": {
    id: "firm-ripe",
    stage: 4,
    label: "Sıkı-Olgun",
    headline: "Dilimlemek için ideal",
    advice:
      "Salata ve tost için tam kıvamında — dilimlerken dağılmaz. Ezmek istersen 1 gün daha bekle.",
    daysMin: 0,
    daysMax: 2,
    color: "#558B2F",
    onColor: "#FFFFFF",
  },
  ripe: {
    id: "ripe",
    stage: 5,
    label: "Olgun / Hazır",
    headline: "Bugün ye",
    advice:
      "Tam kıvamında, guacamole zamanı. Bekletmen gerekiyorsa buzdolabına al, 1-2 gün kazanırsın.",
    daysMin: 0,
    daysMax: 0,
    color: "#2C3E50",
    onColor: "#DCE775",
  },
};

/** Ham → olgun sırasıyla dizilmiş liste (skala göstergeleri için). */
export const RIPENESS_ORDER: RipenessInfo[] = [
  RIPENESS.hard,
  RIPENESS["pre-conditioned"],
  RIPENESS.breaking,
  RIPENESS["firm-ripe"],
  RIPENESS.ripe,
];

/** "1-2 gün", "bugün", "4-6 gün" gibi okunabilir zaman metni. */
export function daysText(info: RipenessInfo): string {
  if (info.daysMax === 0) return "bugün";
  if (info.daysMin === 0) return `${info.daysMax} güne kadar`;
  return `${info.daysMin}-${info.daysMax} gün`;
}
