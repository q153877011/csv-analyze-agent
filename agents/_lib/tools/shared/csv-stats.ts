/**
 * CSV parsing + semantic type inference + basic statistics.
 */
import Papa from "papaparse";
import { readFile } from "node:fs/promises";
import iconv from "iconv-lite";
import * as ss from "simple-statistics";
import type {
  ColumnProfile,
  CsvProfile,
  SemanticType,
  ColumnStats,
  CorrelationResult,
} from "../../types.js";

const MAX_ROWS_FULL_LOAD = 100_000;
const SAMPLE_FRACTION = 0.1;
const MAX_TOP_VALUES = 20;

function detectAndDecode(buf: Buffer): string {
  if (buf.length >= 3 && buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf) {
    return buf.slice(3).toString("utf-8");
  }
  if (buf.length >= 2 && buf[0] === 0xff && buf[1] === 0xfe) {
    return iconv.decode(buf.slice(2), "utf-16le");
  }
  if (buf.length >= 2 && buf[0] === 0xfe && buf[1] === 0xff) {
    return iconv.decode(buf.slice(2), "utf-16be");
  }
  const asUtf8 = buf.toString("utf-8");
  let bad = 0;
  for (let i = 0; i < asUtf8.length; i++) {
    if (asUtf8.charCodeAt(i) === 0xfffd) bad++;
  }
  if (asUtf8.length > 0 && bad / asUtf8.length > 0.01) {
    try {
      return iconv.decode(buf, "gbk");
    } catch {
      return asUtf8;
    }
  }
  return asUtf8;
}

export async function loadCsv(csvPath: string): Promise<{
  rows: Record<string, unknown>[];
  totalRows: number;
  sampledRows: number;
}> {
  const buf = await readFile(csvPath);
  const text = detectAndDecode(buf);
  const parsed = Papa.parse<Record<string, unknown>>(text, {
    header: true,
    dynamicTyping: true,
    skipEmptyLines: true,
    transformHeader: (h) => h.trim(),
  });
  if (parsed.errors.length && parsed.data.length === 0) {
    throw new Error(`CSV parse failed: ${parsed.errors[0]?.message}`);
  }
  const all = parsed.data as Record<string, unknown>[];
  const totalRows = all.length;

  if (totalRows <= MAX_ROWS_FULL_LOAD) {
    return { rows: all, totalRows, sampledRows: totalRows };
  }

  const step = Math.max(1, Math.floor(1 / SAMPLE_FRACTION));
  const sampled: Record<string, unknown>[] = [];
  for (let i = 0; i < totalRows; i += step) sampled.push(all[i]!);
  return { rows: sampled, totalRows, sampledRows: sampled.length };
}

function looksLikeDate(v: string): boolean {
  const s = v.trim();
  if (!s) return false;
  if (/^\d{4}[-/.]\d{1,2}[-/.]\d{1,2}(?:[T ]\d{1,2}:\d{2}(?::\d{2})?)?/.test(s)) {
    return !Number.isNaN(Date.parse(s));
  }
  if (/\d{4}\s*年\s*\d{1,2}\s*月\s*\d{1,2}/.test(s)) return true;
  if (/\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\b/i.test(s)) {
    return !Number.isNaN(Date.parse(s));
  }
  if (/^\d{1,2}[-/.]\d{1,2}[-/.]\d{2}(?:\d{2})?$/.test(s)) {
    return !Number.isNaN(Date.parse(s));
  }
  if (/^\d{10}$/.test(s)) {
    const n = Number(s);
    return n > 10 ** 9 && n < 3 * 10 ** 9;
  }
  if (/^\d{13}$/.test(s)) {
    const n = Number(s);
    return n > 10 ** 12 && n < 3 * 10 ** 12;
  }
  return false;
}

function inferSemanticType(
  name: string,
  values: unknown[],
): { semantic: SemanticType; raw: "number" | "string" | "boolean" | "date" } {
  const nonNull = values.filter((v) => v !== null && v !== undefined && v !== "");
  if (nonNull.length === 0) return { semantic: "text", raw: "string" };

  const sample = nonNull.slice(0, 100);
  const typeCounts = { number: 0, string: 0, boolean: 0, date: 0 };

  for (const v of sample) {
    if (typeof v === "number" && !Number.isNaN(v)) typeCounts.number++;
    else if (typeof v === "boolean") typeCounts.boolean++;
    else if (typeof v === "string") {
      if (looksLikeDate(v)) typeCounts.date++;
      else typeCounts.string++;
    }
  }

  const dominant = Object.entries(typeCounts).sort(
    (a, b) => b[1] - a[1],
  )[0]![0] as "number" | "string" | "boolean" | "date";

  const unique = new Set(nonNull.map((v) => String(v))).size;
  const ratio = unique / nonNull.length;

  if (dominant === "boolean") return { semantic: "boolean", raw: "boolean" };
  if (dominant === "date") return { semantic: "datetime", raw: "date" };
  if (dominant === "number") {
    if (unique <= 10 && nonNull.length > 20) {
      return { semantic: "categorical", raw: "number" };
    }
    return { semantic: "numeric", raw: "number" };
  }
  if (/(^|_)id(_|$)/i.test(name) || ratio > 0.9) {
    return { semantic: "id", raw: "string" };
  }
  if (unique <= 50) return { semantic: "categorical", raw: "string" };
  return { semantic: "text", raw: "string" };
}

function profileColumn(
  name: string,
  values: unknown[],
): ColumnProfile {
  const total = values.length;
  const nonNull = values.filter((v) => v !== null && v !== undefined && v !== "");
  const missing = total - nonNull.length;
  const unique = new Set(nonNull.map((v) => String(v))).size;

  const { semantic, raw } = inferSemanticType(name, values);

  const base: ColumnProfile = {
    name,
    semanticType: semantic,
    rawType: raw,
    count: nonNull.length,
    missing,
    unique,
  };

  if (semantic === "numeric") {
    const nums = nonNull.map((v) => Number(v)).filter((v) => !Number.isNaN(v));
    if (nums.length > 0) {
      base.min = ss.min(nums);
      base.max = ss.max(nums);
      base.mean = round(ss.mean(nums));
      base.median = round(ss.median(nums));
      base.std = nums.length > 1 ? round(ss.standardDeviation(nums)) : 0;
      base.quantiles = {
        p25: round(ss.quantile(nums, 0.25)),
        p50: round(ss.quantile(nums, 0.5)),
        p75: round(ss.quantile(nums, 0.75)),
        p95: round(ss.quantile(nums, 0.95)),
      };
    }
  } else if (semantic === "categorical" || semantic === "boolean") {
    base.topValues = topK(nonNull, MAX_TOP_VALUES);
  } else if (semantic === "datetime") {
    let minT = Number.POSITIVE_INFINITY;
    let maxT = Number.NEGATIVE_INFINITY;
    let any = false;
    for (const v of nonNull) {
      const t = new Date(String(v)).getTime();
      if (!Number.isFinite(t)) continue;
      any = true;
      if (t < minT) minT = t;
      if (t > maxT) maxT = t;
    }
    if (any) {
      base.minDate = new Date(minT).toISOString();
      base.maxDate = new Date(maxT).toISOString();
    }
  }

  return base;
}

export function computeProfile(
  rows: Record<string, unknown>[],
  csvPath: string,
  totalRows: number,
  sampledRows: number,
): CsvProfile {
  const cols = rows.length > 0 ? Object.keys(rows[0]!) : [];
  const columns = cols.map((name) =>
    profileColumn(name, rows.map((r) => r[name])),
  );
  return {
    csvPath,
    rows: totalRows,
    sampledRows,
    columns,
    generatedAt: new Date().toISOString(),
  };
}

function topK(
  values: unknown[],
  k: number,
): Array<{ value: string; count: number }> {
  const counts = new Map<string, number>();
  for (const v of values) {
    const key = String(v);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, k)
    .map(([value, count]) => ({ value, count }));
}

export function computeColumnStats(
  column: string,
  values: unknown[],
  topLimit: number = 20,
): ColumnStats {
  const nonNull = values.filter((v) => v !== null && v !== undefined && v !== "");
  const stats: ColumnStats = { column };

  const nums = nonNull
    .map((v) => Number(v))
    .filter((v) => !Number.isNaN(v));
  const isMostlyNumeric = nums.length > nonNull.length * 0.8;

  if (isMostlyNumeric && nums.length > 0) {
    stats.numericSummary = {
      min: round(ss.min(nums)),
      max: round(ss.max(nums)),
      mean: round(ss.mean(nums)),
      median: round(ss.median(nums)),
      std: nums.length > 1 ? round(ss.standardDeviation(nums)) : 0,
    };
    stats.histogram = histogram(nums, 20);
  }

  stats.topValues = topK(nonNull, topLimit);

  return stats;
}

export function computePearson(
  xs: number[],
  ys: number[],
): CorrelationResult | null {
  const xsClean: number[] = [];
  const ysClean: number[] = [];
  for (let i = 0; i < Math.min(xs.length, ys.length); i++) {
    const x = xs[i]!;
    const y = ys[i]!;
    if (Number.isFinite(x) && Number.isFinite(y)) {
      xsClean.push(x);
      ysClean.push(y);
    }
  }
  const n = xsClean.length;
  if (n < 3) return null;
  const r = ss.sampleCorrelation(xsClean, ysClean);
  const t = (r * Math.sqrt(n - 2)) / Math.sqrt(Math.max(1 - r * r, 1e-10));
  const p = 2 * (1 - normalCdf(Math.abs(t)));
  return {
    colA: "",
    colB: "",
    r: round(r),
    n,
    pValue: round(clamp(p, 0, 1), 4),
  };
}

function histogram(
  nums: number[],
  bins: number,
): Array<{ binStart: number; binEnd: number; count: number }> {
  if (nums.length === 0) return [];
  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;
  for (const v of nums) {
    if (v < min) min = v;
    if (v > max) max = v;
  }
  if (min === max) {
    return [{ binStart: min, binEnd: max, count: nums.length }];
  }
  const width = (max - min) / bins;
  const buckets = new Array(bins).fill(0) as number[];
  for (const v of nums) {
    let idx = Math.floor((v - min) / width);
    if (idx >= bins) idx = bins - 1;
    buckets[idx]!++;
  }
  return buckets.map((count, i) => ({
    binStart: round(min + i * width),
    binEnd: round(min + (i + 1) * width),
    count,
  }));
}

function round(n: number, digits = 4): number {
  if (!Number.isFinite(n)) return n;
  const f = 10 ** digits;
  return Math.round(n * f) / f;
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

function normalCdf(x: number): number {
  const t = 1 / (1 + 0.2316419 * Math.abs(x));
  const d = 0.3989422804014327 * Math.exp(-0.5 * x * x);
  const p =
    d *
    t *
    (0.31938153 +
      t *
        (-0.356563782 +
          t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))));
  return x > 0 ? 1 - p : p;
}
