/**
 * Insight Agent read-only tool set: reads data from the Chart Agent phase cache.
 */
import { tool } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";
import type { TaskContext } from "../../types.js";
import { textResult, errorResult } from "../shared/helpers.js";
import {
  readProfileFile,
  readChartsFile,
  readColumnStatsFile,
  readCorrelationFile,
  orderedPair,
} from "../shared/cache.js";

// ─────────── read_context (profile + charts) ───────────

export const readContext = (ctx: TaskContext) =>
  tool(
    "read_context",
    "Read the CSV profile (column types, statistics) AND the chart list produced by the Chart Agent. Call this FIRST — it's your only view into the data structure and what charts exist.",
    {},
    async () => {
      try {
        // Profile
        if (!ctx.cache.profile) {
          const p = await readProfileFile(ctx.outDir);
          if (!p) return errorResult("profile not found; run Chart Agent first");
          ctx.cache.profile = p;
        }

        // Charts
        if (ctx.charts.length === 0) {
          const charts = await readChartsFile(ctx.outDir);
          if (charts.length === 0) {
            return errorResult("No charts found — the Chart Agent produced nothing");
          }
          ctx.charts = charts;
        }

        return textResult({
          profile: ctx.cache.profile,
          charts: ctx.charts,
        });
      } catch (e) {
        return errorResult(
          `read_context failed: ${e instanceof Error ? e.message : String(e)}`,
        );
      }
    },
  );

// ─────────── read_column_stats ───────────

export const readColumnStats = (ctx: TaskContext) =>
  tool(
    "read_column_stats",
    "Return cached column statistics (top values + histogram + numeric summary). Only columns the Chart Agent actually looked at are available — otherwise returns an error.",
    {
      column: z.string(),
    },
    async ({ column }) => {
      try {
        const mem = ctx.cache.columnStats.get(column);
        if (mem) return textResult(mem);
        const disk = await readColumnStatsFile(ctx.outDir, column);
        if (!disk) {
          return errorResult(
            `No cached stats for "${column}". Pick another column that the Chart Agent already analyzed (see relevant_columns in read_context).`,
          );
        }
        ctx.cache.columnStats.set(column, disk);
        return textResult(disk);
      } catch (e) {
        return errorResult(
          `read_column_stats failed: ${e instanceof Error ? e.message : String(e)}`,
        );
      }
    },
  );

// ─────────── read_correlation ───────────

export const readCorrelation = (ctx: TaskContext) =>
  tool(
    "read_correlation",
    "Return cached Pearson correlation for a pair of columns. Only pairs the Chart Agent computed are available.",
    {
      col_a: z.string(),
      col_b: z.string(),
    },
    async ({ col_a, col_b }) => {
      try {
        const [a, b] = orderedPair(col_a, col_b);
        const key = `${a}__${b}`;
        const mem = ctx.cache.correlations.get(key);
        if (mem) return textResult(mem);
        const disk = await readCorrelationFile(ctx.outDir, col_a, col_b);
        if (!disk) {
          return errorResult(
            `No cached correlation for ("${col_a}", "${col_b}"). Pick another pair the Chart Agent examined.`,
          );
        }
        ctx.cache.correlations.set(key, disk);
        return textResult(disk);
      } catch (e) {
        return errorResult(
          `read_correlation failed: ${e instanceof Error ? e.message : String(e)}`,
        );
      }
    },
  );
