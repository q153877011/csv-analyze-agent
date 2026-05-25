/**
 * Compute 60 normalized values (0..1) per column for the frontend ColumnScan visualization.
 */
import type { CsvProfile, ColumnProfile, SemanticType } from "./types.js";

export interface ColumnDistribution {
  column: string;
  semanticType: SemanticType;
  bins: number[];
}

const BIN_COUNT = 60;

export function computeColumnDistributions(
  rows: Record<string, unknown>[],
  profile: CsvProfile,
): ColumnDistribution[] {
  return profile.columns.map((col) =>
    computeOne(
      col,
      rows.map((r) => r[col.name]),
    ),
  );
}

function computeOne(col: ColumnProfile, values: unknown[]): ColumnDistribution {
  const sem = col.semanticType;
  if (sem === "text") {
    return { column: col.name, semanticType: sem, bins: zeros(BIN_COUNT) };
  }
  if (sem === "categorical" || sem === "boolean") {
    return { column: col.name, semanticType: sem, bins: topFrequencyBins(values) };
  }
  if (sem === "datetime") {
    return { column: col.name, semanticType: sem, bins: timeBins(values) };
  }
  if (sem === "id") {
    return {
      column: col.name,
      semanticType: sem,
      bins: Array(BIN_COUNT).fill(0.2),
    };
  }
  // numeric
  return { column: col.name, semanticType: sem, bins: numericBins(values) };
}

function topFrequencyBins(values: unknown[]): number[] {
  const counts = new Map<string, number>();
  for (const v of values) {
    if (v === null || v === undefined || v === "") continue;
    const k = String(v);
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  const sorted = [...counts.values()].sort((a, b) => b - a).slice(0, BIN_COUNT);
  const max = sorted[0] ?? 1;
  const bins = zeros(BIN_COUNT);
  for (let i = 0; i < sorted.length; i++) {
    bins[i] = (sorted[i] as number) / max;
  }
  return bins;
}

function numericBins(values: unknown[]): number[] {
  const nums: number[] = [];
  for (const v of values) {
    const n = Number(v);
    if (Number.isFinite(n)) nums.push(n);
  }
  if (nums.length === 0) return zeros(BIN_COUNT);
  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;
  for (const n of nums) {
    if (n < min) min = n;
    if (n > max) max = n;
  }
  if (min === max) {
    const bins = zeros(BIN_COUNT);
    bins[Math.floor(BIN_COUNT / 2)] = 1;
    return bins;
  }
  const width = (max - min) / BIN_COUNT;
  const counts = zeros(BIN_COUNT);
  for (const n of nums) {
    let idx = Math.floor((n - min) / width);
    if (idx >= BIN_COUNT) idx = BIN_COUNT - 1;
    if (idx < 0) idx = 0;
    counts[idx] = (counts[idx] as number) + 1;
  }
  let peak = 0;
  for (const c of counts) if (c > peak) peak = c;
  return counts.map((c) => (peak === 0 ? 0 : c / peak));
}

function timeBins(values: unknown[]): number[] {
  const ts: number[] = [];
  for (const v of values) {
    if (v === null || v === undefined || v === "") continue;
    const d = new Date(String(v));
    const t = d.getTime();
    if (Number.isFinite(t)) ts.push(t);
  }
  if (ts.length === 0) return zeros(BIN_COUNT);
  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;
  for (const t of ts) {
    if (t < min) min = t;
    if (t > max) max = t;
  }
  if (min === max) {
    const bins = zeros(BIN_COUNT);
    bins[Math.floor(BIN_COUNT / 2)] = 1;
    return bins;
  }
  const width = (max - min) / BIN_COUNT;
  const counts = zeros(BIN_COUNT);
  for (const t of ts) {
    let idx = Math.floor((t - min) / width);
    if (idx >= BIN_COUNT) idx = BIN_COUNT - 1;
    if (idx < 0) idx = 0;
    counts[idx] = (counts[idx] as number) + 1;
  }
  let peak = 0;
  for (const c of counts) if (c > peak) peak = c;
  return counts.map((c) => (peak === 0 ? 0 : c / peak));
}

function zeros(n: number): number[] {
  return new Array(n).fill(0) as number[];
}
