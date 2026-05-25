/**
 * save_insight: Append an insight to ctx.insights.
 */
import { tool } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";
import { writeFile } from "node:fs/promises";
import path from "node:path";
import type { TaskContext, Insight } from "../../types.js";
import { textResult, errorResult } from "../shared/helpers.js";

export const saveInsight = (ctx: TaskContext) =>
  tool(
    "save_insight",
    "Save an insight. kind='per_chart' requires chart_id and writes an insight tied to that chart; kind='summary' writes the overall conclusion (only one allowed; a new summary overwrites the previous).",
    {
      chart_id: z
        .string()
        .optional()
        .describe("Required when kind=per_chart; should come from read_chart_meta"),
      text: z
        .string()
        .min(1)
        .describe("2–4 sentence insight (per_chart) or 3–5 sentence conclusion (summary); must cite specific numbers"),
      kind: z.enum(["per_chart", "summary"]),
    },
    async ({ chart_id, text, kind }) => {
      try {
        let emitted: Insight | null = null;
        if (kind === "per_chart") {
          if (!chart_id) return errorResult("kind='per_chart' requires chart_id");
          if (!ctx.charts.some((c) => c.id === chart_id)) {
            return errorResult(
              `chart_id "${chart_id}" not found in chart list`,
            );
          }
          const existsSame = ctx.insights.some(
            (i) => i.kind === "per_chart" && i.chartId === chart_id && i.text === text,
          );
          if (!existsSame) {
            const insight: Insight = {
              kind,
              chartId: chart_id,
              text,
              createdAt: new Date().toISOString(),
            };
            ctx.insights.push(insight);
            emitted = insight;
          }
        } else {
          ctx.insights = ctx.insights.filter((i) => i.kind !== "summary");
          const insight: Insight = { kind, text, createdAt: new Date().toISOString() };
          ctx.insights.push(insight);
          emitted = insight;
        }

        await writeFile(
          path.join(ctx.outDir, "insights.json"),
          JSON.stringify(ctx.insights, null, 2),
          "utf-8",
        );
        if (emitted) ctx.emit?.({ type: "insight", insight: emitted });
        return textResult({ ok: true, total: ctx.insights.length });
      } catch (e) {
        return errorResult(
          `save_insight failed: ${e instanceof Error ? e.message : String(e)}`,
        );
      }
    },
  );
