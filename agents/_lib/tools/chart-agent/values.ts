/**
 * get_column_values: Top-K values + frequency + histogram + numeric summary for a column.
 */
import { tool } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";
import type { TaskContext } from "../../types.js";
import { textResult, errorResult } from "../shared/helpers.js";
import { loadCsv, computeColumnStats } from "../shared/csv-stats.js";
import { writeColumnStats } from "../shared/cache.js";

export const getColumnValues = (ctx: TaskContext) => {
  const maxLimit = ctx.demoMode ? 12 : 50;
  const defaultLimit = ctx.demoMode ? 8 : 20;

  return tool(
    "get_column_values",
    "Get top-K values + histogram + numeric summary for a single column. Use this before rendering a bar/pie/histogram chart so you have a small, model-friendly payload to put into data.values.",
    {
      column: z.string().describe("Column name (must exist in the CSV)"),
      limit: z
        .number()
        .int()
        .min(1)
        .max(maxLimit)
        .optional()
        .describe(`K for top-K, default ${defaultLimit}`),
    },
    async ({ column, limit }) => {
      try {
        if (!ctx.cache.rows) {
          const { rows } = await loadCsv(ctx.csvPath);
          ctx.cache.rows = rows;
        }
        const rows = ctx.cache.rows!;
        if (rows.length === 0) return errorResult("CSV is empty");

        const firstRow = rows[0]!;
        if (!(column in firstRow)) {
          return errorResult(
            `Column "${column}" not found. Available: ${Object.keys(firstRow).join(", ")}`,
          );
        }

        const cached = ctx.cache.columnStats.get(column);
        if (cached) return textResult(cached);

        const effectiveLimit = Math.min(limit ?? defaultLimit, maxLimit);
        const values = rows.map((r) => r[column]);
        const stats = computeColumnStats(column, values, effectiveLimit);
        ctx.cache.columnStats.set(column, stats);
        await writeColumnStats(ctx.outDir, column, stats);
        return textResult(stats);
      } catch (e) {
        return errorResult(
          `get_column_values failed: ${e instanceof Error ? e.message : String(e)}`,
        );
      }
    },
  );
};
