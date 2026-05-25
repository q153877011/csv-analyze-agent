/**
 * create_chart: Render Vega-Lite to SVG + register chart metadata in one step.
 */
import { tool } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";
import * as vl from "vega-lite";
import { View, parse } from "vega";
import { writeFile } from "node:fs/promises";
import path from "node:path";
import type { TaskContext, ChartMeta, ChartType } from "../../types.js";
import { textResult, errorResult } from "../shared/helpers.js";
import { ensureDir, writeCharts } from "../shared/cache.js";

const CHART_TYPES: ChartType[] = [
  "bar", "line", "scatter", "histogram", "heatmap", "boxplot", "pie", "area", "other",
];

export const createChart = (ctx: TaskContext) =>
  tool(
    "create_chart",
    "Render a Vega-Lite spec to SVG and register chart metadata in one step. The spec MUST include `data.values` inline. Returns { chart_id, file_path }.",
    {
      title: z.string().describe("Chart title (human-readable)"),
      description: z
        .string()
        .describe("One sentence describing what the chart shows (not a conclusion; conclusions are the Insight Agent's job)"),
      chart_type: z.enum(CHART_TYPES as [ChartType, ...ChartType[]]),
      relevant_columns: z.array(z.string()).describe("Column names relevant to this chart"),
      vega_lite_spec: z
        .record(z.string(), z.any())
        .describe("Valid Vega-Lite v5 spec; must include data.values"),
    },
    async ({ title, description, chart_type, relevant_columns, vega_lite_spec }) => {
      try {
        // ── Render SVG ──────────────────────────────────────
        const spec: Record<string, unknown> = { ...(vega_lite_spec as Record<string, unknown>) };
        if (!spec.$schema) spec.$schema = "https://vega.github.io/schema/vega-lite/v5.json";
        if (!spec.width && !spec.height) {
          spec.width = 480;
          spec.height = 300;
        }
        if (!spec.title) spec.title = title;
        if (!spec.background) spec.background = "white";

        const data = (spec as { data?: { values?: unknown[] } }).data;
        if (!data || !Array.isArray(data.values) || data.values.length === 0) {
          return errorResult(
            "vega_lite_spec.data.values must be a non-empty array — fill it with return values from get_column_values / compute_correlation",
          );
        }

        const compiled = vl.compile(spec as never).spec;
        const view = new View(parse(compiled), { renderer: "none" });
        const svg = await view.toSVG();

        const seq = ctx.cache.nextChartId++;
        const id = `chart-${seq}`;
        const chartsDir = path.join(ctx.outDir, "charts");
        await ensureDir(chartsDir);
        const filePath = path.join(chartsDir, `${id}.svg`);
        await writeFile(filePath, svg, "utf-8");

        // ── Register metadata ────────────────────────────────────
        const meta: ChartMeta = {
          id,
          title,
          description,
          chartType: chart_type,
          relevantColumns: relevant_columns,
          filePath,
          relPath: `charts/${id}.svg`,
        };
        ctx.charts.push(meta);
        await writeCharts(ctx.outDir, ctx.charts);
        ctx.emit?.({ type: "chart", chart: meta });

        return textResult({ chart_id: id, file_path: filePath });
      } catch (e) {
        return errorResult(
          `create_chart failed: ${e instanceof Error ? e.message : String(e)}`,
        );
      }
    },
  );
