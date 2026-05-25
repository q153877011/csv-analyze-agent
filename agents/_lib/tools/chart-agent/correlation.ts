/**
 * compute_correlation: Pearson correlation coefficient + approximate p-value for two numeric columns.
 */
import { tool } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";
import type { TaskContext } from "../../types.js";
import { textResult, errorResult } from "../shared/helpers.js";
import { loadCsv, computePearson } from "../shared/csv-stats.js";
import { writeCorrelation, orderedPair } from "../shared/cache.js";

export const computeCorrelation = (ctx: TaskContext) =>
  tool(
    "compute_correlation",
    "Compute Pearson correlation (r, n, p-value) between two numeric columns. Use before deciding whether to render a scatter plot.",
    {
      col_a: z.string(),
      col_b: z.string(),
    },
    async ({ col_a, col_b }) => {
      try {
        if (!ctx.cache.rows) {
          const { rows } = await loadCsv(ctx.csvPath);
          ctx.cache.rows = rows;
        }
        const rows = ctx.cache.rows!;
        if (rows.length === 0) return errorResult("CSV is empty");
        const first = rows[0]!;
        if (!(col_a in first)) return errorResult(`Column "${col_a}" not found`);
        if (!(col_b in first)) return errorResult(`Column "${col_b}" not found`);

        const [a, b] = orderedPair(col_a, col_b);
        const key = `${a}__${b}`;
        const cached = ctx.cache.correlations.get(key);
        if (cached) return textResult(cached);

        const xs = rows.map((r) => Number(r[col_a]));
        const ys = rows.map((r) => Number(r[col_b]));
        const result = computePearson(xs, ys);
        if (!result) {
          return errorResult(
            `Not enough finite numeric pairs between "${col_a}" and "${col_b}"`,
          );
        }
        result.colA = col_a;
        result.colB = col_b;
        ctx.cache.correlations.set(key, result);
        await writeCorrelation(ctx.outDir, result);
        return textResult(result);
      } catch (e) {
        return errorResult(
          `compute_correlation failed: ${e instanceof Error ? e.message : String(e)}`,
        );
      }
    },
  );
