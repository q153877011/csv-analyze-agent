/**
 * Shared business types for the frontend, aligned with backend agents/src/types.ts.
 * Only mirrors fields the *frontend actually uses*, not an exact copy.
 */

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
  sampledRows: number;
  columns: ColumnProfile[];
  generatedAt: string;
}

export interface ColumnDistribution {
  column: string;
  semanticType: SemanticType;
  bins: number[]; // length 60
}

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
  /** Backend-appended: URL that can be directly used for fetch/inline SVG */
  svgUrl?: string;
}

export type InsightKind = "per_chart" | "summary";

export interface Insight {
  kind: InsightKind;
  chartId?: string;
  text: string;
  createdAt: string;
}

export interface UploadResponse {
  taskId: string;
  csvName: string;
  size: number;
  profile: CsvProfile;
  distributions: ColumnDistribution[];
}
