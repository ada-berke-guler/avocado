/**
 * dataset/avocado_ripeness_dataset.csv → src/lib/engine/model.json
 *
 * NE ÜRETİR: Sınıflandırıcının *önsel olasılıklarını* (prior). Model ağırlığı değil.
 *
 * NEDEN BÖYLE: Dataset sentetik ve tablo tabanlı (bkz. CLAUDE.md Bölüm 0). 9 kolondan
 * sadece renk kolonları fotoğraftan elde edilebiliyor, `hue` kolonu ise gerçek kamera
 * HSV'si değil. Bu yüzden datasetten yalnızca fotoğraftan gerçekten gözlemlenebilen tek
 * köprüyü çıkarıyoruz: `color_category` → `ripeness` dağılımı ve kategori içi
 * parlaklık/doygunluk sıralaması.
 *
 * Fotoğraf uzayındaki asıl eşikler burada DEĞİL, engine/constants.ts içinde ve
 * gerçek fotoğraflarla kalibre edilir (Faz 6).
 *
 * Çalıştır: npm run build:model
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..");
const CSV_PATH = resolve(ROOT, "dataset/avocado_ripeness_dataset.csv");
const OUT_PATH = resolve(ROOT, "src/lib/engine/model.json");

const RIPENESS_CLASSES = [
  "hard",
  "pre-conditioned",
  "breaking",
  "firm-ripe",
  "ripe",
] as const;
type RipenessClass = (typeof RIPENESS_CLASSES)[number];

const COLOR_CATEGORIES = ["dark green", "green", "purple", "black"] as const;
type ColorCategory = (typeof COLOR_CATEGORIES)[number];

interface Row {
  hue: number;
  saturation: number;
  brightness: number;
  colorCategory: ColorCategory;
  ripeness: RipenessClass;
}

interface Stat {
  mean: number;
  sd: number;
  min: number;
  max: number;
}

function parseCsv(text: string): Row[] {
  const lines = text.trim().split(/\r?\n/);
  const header = lines[0].split(",").map((h) => h.trim());
  const idx = (name: string) => {
    const i = header.indexOf(name);
    if (i < 0) throw new Error(`CSV'de '${name}' kolonu yok. Bulunan: ${header.join(", ")}`);
    return i;
  };
  const iHue = idx("hue");
  const iSat = idx("saturation");
  const iBri = idx("brightness");
  const iCat = idx("color_category");
  const iRip = idx("ripeness");

  return lines.slice(1).map((line, n) => {
    const c = line.split(",").map((v) => v.trim());
    const cat = c[iCat] as ColorCategory;
    const rip = c[iRip] as RipenessClass;
    if (!COLOR_CATEGORIES.includes(cat)) {
      throw new Error(`Satır ${n + 2}: bilinmeyen color_category '${cat}'`);
    }
    if (!RIPENESS_CLASSES.includes(rip)) {
      throw new Error(`Satır ${n + 2}: bilinmeyen ripeness '${rip}'`);
    }
    return {
      hue: Number(c[iHue]),
      saturation: Number(c[iSat]),
      brightness: Number(c[iBri]),
      colorCategory: cat,
      ripeness: rip,
    };
  });
}

function stat(values: number[]): Stat {
  const n = values.length;
  const mean = values.reduce((a, b) => a + b, 0) / n;
  const variance = values.reduce((a, b) => a + (b - mean) ** 2, 0) / n;
  return {
    mean: round(mean),
    sd: round(Math.sqrt(variance)),
    min: Math.min(...values),
    max: Math.max(...values),
  };
}

const round = (v: number) => Math.round(v * 1000) / 1000;

function main() {
  const rows = parseCsv(readFileSync(CSV_PATH, "utf8"));

  // 1) Kategori → sınıf önsel olasılıkları. Motorun dataset'ten aldığı asıl bilgi bu.
  const categoryPriors = {} as Record<ColorCategory, Record<RipenessClass, number>>;
  // Ham sayımlar da yazılır: motor bunları Laplace düzeltmesiyle yumuşatır.
  // %100'lük ham bir prior, ölçüm ne derse desin diğer sınıfları tamamen öldürürdü.
  const categoryCounts = {} as Record<ColorCategory, Record<RipenessClass, number>>;
  for (const cat of COLOR_CATEGORIES) {
    const inCat = rows.filter((r) => r.colorCategory === cat);
    const counts = Object.fromEntries(
      RIPENESS_CLASSES.map((c) => [c, 0]),
    ) as Record<RipenessClass, number>;
    for (const r of inCat) counts[r.ripeness] += 1;
    categoryCounts[cat] = counts;
    categoryPriors[cat] = Object.fromEntries(
      RIPENESS_CLASSES.map((c) => [c, round(counts[c] / inCat.length)]),
    ) as Record<RipenessClass, number>;
  }

  // 2) Kategori içi alt-ayrıştırma: bir kategori birden fazla sınıfa gidiyorsa
  //    (purple → breaking/firm-ripe, black → firm-ripe/ripe), o sınıfları
  //    parlaklık ekseninde sıralamak için istatistik.
  const classStats = {} as Record<
    RipenessClass,
    { n: number; saturation: Stat; brightness: Stat }
  >;
  for (const cls of RIPENESS_CLASSES) {
    const inCls = rows.filter((r) => r.ripeness === cls);
    classStats[cls] = {
      n: inCls.length,
      saturation: stat(inCls.map((r) => r.saturation)),
      brightness: stat(inCls.map((r) => r.brightness)),
    };
  }

  // 3) Her kategori için, o kategoriye ait sınıfların parlaklık sırası (koyudan açığa).
  //    Motor bu sırayı kullanarak ölçülen koyuluğu kategori içindeki sınıflara dağıtır.
  const categoryOrder = {} as Record<ColorCategory, RipenessClass[]>;
  for (const cat of COLOR_CATEGORIES) {
    const members = RIPENESS_CLASSES.filter((c) => categoryPriors[cat][c] > 0);
    members.sort(
      (a, b) => classStats[a].brightness.mean - classStats[b].brightness.mean,
    );
    categoryOrder[cat] = members;
  }

  const model = {
    _comment:
      "OTOMATİK ÜRETİLDİ — elle düzenlemeyin. Kaynak: dataset/avocado_ripeness_dataset.csv. " +
      "Yeniden üretmek için: npm run build:model. Fotoğraf uzayı eşikleri için engine/constants.ts'e bakın.",
    source: "dataset/avocado_ripeness_dataset.csv",
    rowCount: rows.length,
    classes: RIPENESS_CLASSES,
    categories: COLOR_CATEGORIES,
    categoryCounts,
    categoryPriors,
    categoryOrder,
    classStats,
  };

  mkdirSync(dirname(OUT_PATH), { recursive: true });
  writeFileSync(OUT_PATH, JSON.stringify(model, null, 2) + "\n", "utf8");

  console.log(`✓ ${rows.length} satır okundu → src/lib/engine/model.json`);
  for (const cat of COLOR_CATEGORIES) {
    const parts = RIPENESS_CLASSES.filter((c) => categoryPriors[cat][c] > 0).map(
      (c) => `${c} ${(categoryPriors[cat][c] * 100).toFixed(0)}%`,
    );
    console.log(`  ${cat.padEnd(11)} → ${parts.join(", ")}`);
  }
}

main();
