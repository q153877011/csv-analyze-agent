/**
 * Shared type definitions across all agents.
 */
import type { EventEmitter } from "./events.js";

// ──────────────────────────────────────────────────────
// CSV column types and profile
// ──────────────────────────────────────────────────────

export type SemanticType =
  | "numeric"
  | "categorical"
  | "datetime"
  | "id"
  | "boolean"
  | "text";

export interface ColumnProfile {
  name: string;
  semanticType: SemanticType;
  rawType: "number" | "string" | "boolean" | "date";
  count: number;
  missing: number;
  unique: number;
  min?: number;
  max?: number;
  mean?: number;
  median?: number;
  std?: number;
  quantiles?: Record<string, number>;
  topValues?: Array<{ value: string; count: number }>;
  minDate?: string;
  maxDate?: string;
}

export interface CsvProfile {
  csvPath: string;
  rows: number;
  columns: ColumnProfile[];
  sampledRows: number;
  generatedAt: string;
}

// ──────────────────────────────────────────────────────
// Chart metadata
// ──────────────────────────────────────────────────────

export type ChartType =
  | "bar"
  | "line"
  | "scatter"
  | "histogram"
  | "heatmap"
  | "boxplot"
  | "pie"
  | "area"
  | "other";

export interface ChartMeta {
  id: string;
  title: string;
  description: string;
  chartType: ChartType;
  relevantColumns: string[];
  filePath: string;
  relPath: string;
  svgUrl?: string;
}

// ──────────────────────────────────────────────────────
// Insights
// ──────────────────────────────────────────────────────

export type InsightKind = "per_chart" | "summary";

export interface Insight {
  kind: InsightKind;
  chartId?: string;
  text: string;
  createdAt: string;
}

// ──────────────────────────────────────────────────────
// TaskContext
// ──────────────────────────────────────────────────────

export interface TaskContext {
  csvPath: string;
  outDir: string;
  charts: ChartMeta[];
  insights: Insight[];
  demoMode?: boolean;
  cache: {
    profile: CsvProfile | null;
    columnStats: Map<string, ColumnStats>;
    correlations: Map<string, CorrelationResult>;
    rows: Record<string, unknown>[] | null;
    nextChartId: number;
  };
  emit?: EventEmitter;
}

export interface ColumnStats {
  column: string;
  topValues?: Array<{ value: string; count: number }>;
  histogram?: Array<{ binStart: number; binEnd: number; count: number }>;
  numericSummary?: {
    min: number;
    max: number;
    mean: number;
    median: number;
    std: number;
  };
}

export interface CorrelationResult {
  colA: string;
  colB: string;
  r: number;
  n: number;
  pValue: number;
}

// ──────────────────────────────────────────────────────
// Agent options
// ──────────────────────────────────────────────────────

export interface AnalyzeOptions {
  csvPath: string;
  outDir: string;
  model?: string;
  maxTurns?: number;
  maxBudgetUsd?: number;
  chartsOnly?: boolean;
  demoMode?: boolean;
  taskId?: string;
  onEvent?: EventEmitter;
  prewarmedProfile?: CsvProfile;
  prewarmedRows?: Record<string, unknown>[];
  insightsOnly?: boolean;
  signal?: AbortSignal;
}

export interface AnalyzeResult {
  chartsReportPath: string;
  insightReportPath?: string;
  combinedReportPath: string;
  htmlReportPath?: string;
  charts: ChartMeta[];
  insights: Insight[];
  costUsd: { chart?: number; insight?: number; total: number };
}
