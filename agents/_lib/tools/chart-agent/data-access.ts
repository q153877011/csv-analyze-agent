/**
 * inspect_csv: Return CSV profile + sampled rows in one call.
 */
import { tool } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";
import type { TaskContext } from "../../types.js";
import { textResult, errorResult } from "../shared/helpers.js";
import { loadCsv, computeProfile } from "../shared/csv-stats.js";
import { writeProfile } from "../shared/cache.js";

export const inspectCsv = (ctx: TaskContext) =>
  tool(
    "inspect_csv",
    "Load the CSV, infer each column's semantic type, return per-column statistics AND a few sample rows. Call this FIRST to understand the dataset structure.",
    {
      sample_n: z
        .number()
        .int()
        .min(1)
        .max(10)
        .optional()
        .describe("Number of sample rows (1–10), default 5"),
    },
    async ({ sample_n }) => {
      try {
        const n = sample_n ?? 5;

        // ── Profile ──────────────────────────────────────
        if (!ctx.cache.rows) {
          const { rows, totalRows, sampledRows } = await loadCsv(ctx.csvPath);
          ctx.cache.rows = rows;
          if (!ctx.cache.profile) {
            const profile = computeProfile(rows, ctx.csvPath, totalRows, sampledRows);
            ctx.cache.profile = profile;
            await writeProfile(ctx.outDir, profile);
          }
        } else if (!ctx.cache.profile) {
          const rows = ctx.cache.rows;
          const profile = computeProfile(rows, ctx.csvPath, rows.length, rows.length);
          ctx.cache.profile = profile;
          await writeProfile(ctx.outDir, profile);
        }

        // ── Sample rows ──────────────────────────────────
        const rows = ctx.cache.rows!;
        let sampleRows: Record<string, unknown>[] = [];
        if (rows.length > 0) {
          const step = Math.max(1, Math.floor(rows.length / n));
          for (let i = 0; i < rows.length && sampleRows.length < n; i += step) {
            sampleRows.push(rows[i]!);
          }
        }

        return textResult({
          profile: ctx.cache.profile,
          sampleRows,
        });
      } catch (e) {
        return errorResult(
          `inspect_csv failed: ${e instanceof Error ? e.message : String(e)}`,
        );
      }
    },
  );
