/**
 * Disk cache helpers: statistics computed by the Chart Agent are written under outDir,
 * and the Insight Agent's read_* tools read from the same location.
 */
import { mkdir, writeFile, readFile, access } from "node:fs/promises";
import path from "node:path";
import type {
  CsvProfile,
  ChartMeta,
  ColumnStats,
  CorrelationResult,
} from "../../types.js";

export function safeName(s: string): string {
  return s.replace(/[^a-zA-Z0-9_-]+/g, "_").slice(0, 64);
}

export function orderedPair(a: string, b: string): [string, string] {
  return a < b ? [a, b] : [b, a];
}

export async function ensureDir(dir: string): Promise<void> {
  await mkdir(dir, { recursive: true });
}

async function fileExists(p: string): Promise<boolean> {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
}

// ─────────── profile ───────────
export async function writeProfile(outDir: string, p: CsvProfile): Promise<void> {
  await ensureDir(outDir);
  await writeFile(path.join(outDir, "profile.json"), JSON.stringify(p, null, 2), "utf-8");
}

export async function readProfileFile(outDir: string): Promise<CsvProfile | null> {
  const p = path.join(outDir, "profile.json");
  if (!(await fileExists(p))) return null;
  const txt = await readFile(p, "utf-8");
  return JSON.parse(txt) as CsvProfile;
}

// ─────────── charts ───────────
export async function writeCharts(outDir: string, charts: ChartMeta[]): Promise<void> {
  await ensureDir(outDir);
  await writeFile(
    path.join(outDir, "charts.json"),
    JSON.stringify(charts, null, 2),
    "utf-8",
  );
}

export async function readChartsFile(outDir: string): Promise<ChartMeta[]> {
  const p = path.join(outDir, "charts.json");
  if (!(await fileExists(p))) return [];
  const txt = await readFile(p, "utf-8");
  return JSON.parse(txt) as ChartMeta[];
}

// ─────────── column stats ───────────
export async function writeColumnStats(
  outDir: string,
  column: string,
  stats: ColumnStats,
): Promise<void> {
  const dir = path.join(outDir, "column-stats");
  await ensureDir(dir);
  await writeFile(
    path.join(dir, `${safeName(column)}.json`),
    JSON.stringify(stats, null, 2),
    "utf-8",
  );
}

export async function readColumnStatsFile(
  outDir: string,
  column: string,
): Promise<ColumnStats | null> {
  const p = path.join(outDir, "column-stats", `${safeName(column)}.json`);
  if (!(await fileExists(p))) return null;
  const txt = await readFile(p, "utf-8");
  return JSON.parse(txt) as ColumnStats;
}

// ─────────── correlations ───────────
export async function writeCorrelation(
  outDir: string,
  c: CorrelationResult,
): Promise<void> {
  const dir = path.join(outDir, "correlations");
  await ensureDir(dir);
  const [a, b] = orderedPair(c.colA, c.colB);
  await writeFile(
    path.join(dir, `${safeName(a)}__${safeName(b)}.json`),
    JSON.stringify(c, null, 2),
    "utf-8",
  );
}

export async function readCorrelationFile(
  outDir: string,
  colA: string,
  colB: string,
): Promise<CorrelationResult | null> {
  const [a, b] = orderedPair(colA, colB);
  const p = path.join(outDir, "correlations", `${safeName(a)}__${safeName(b)}.json`);
  if (!(await fileExists(p))) return null;
  const txt = await readFile(p, "utf-8");
  return JSON.parse(txt) as CorrelationResult;
}
