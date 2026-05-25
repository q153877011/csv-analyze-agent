/**
 * analyze(): Two-agent sequential orchestration.
 */
import { mkdir, readdir, unlink } from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { query, createSdkMcpServer } from "@anthropic-ai/claude-agent-sdk";

import type {
  AnalyzeOptions,
  AnalyzeResult,
  TaskContext,
} from "./types.js";
import type { AgentEvent, AgentRole, ToolState } from "./events.js";
import { CHART_AGENT_PROMPT, CHART_AGENT_PROMPT_DEMO, INSIGHT_AGENT_PROMPT, INSIGHT_AGENT_PROMPT_DEMO } from "./system-prompt.js";
import { resolveModelName, collectGatewayEnv } from "./model.js";
import {
  inspectCsv,
  getColumnValues,
  computeCorrelation,
  createChart,
} from "./tools/chart-agent/index.js";
import {
  readContext,
  readColumnStats,
  readCorrelation,
  saveInsight,
} from "./tools/insight-agent/index.js";
import { assembleReports } from "./report.js";
import { writeProfile } from "./tools/shared/cache.js";

export async function analyze(opts: AnalyzeOptions): Promise<AnalyzeResult> {
  await mkdir(path.join(opts.outDir, "charts"), { recursive: true });

  const ctx: TaskContext = {
    csvPath: path.resolve(opts.csvPath),
    outDir: path.resolve(opts.outDir),
    charts: [],
    insights: [],
    demoMode: opts.demoMode,
    cache: {
      profile: opts.prewarmedProfile ?? null,
      columnStats: new Map(),
      correlations: new Map(),
      rows: opts.prewarmedRows ?? null,
      nextChartId: 1,
    },
    emit: opts.onEvent,
  };

  if (ctx.cache.profile) {
    try {
      await writeProfile(ctx.outDir, ctx.cache.profile);
    } catch {
      /* pre-warm profile write failed — non-fatal */
    }
  }

  const model = resolveModelName(opts.model);
  const chartsOnly = Boolean(opts.chartsOnly && !opts.insightsOnly);
  const insightsOnly = Boolean(opts.insightsOnly);
  const taskId = opts.taskId ?? path.basename(ctx.outDir);
  const t0 = Date.now();

  console.log(`\n🚀 CSV analysis started`);
  console.log(`   CSV   : ${ctx.csvPath}`);
  console.log(`   Out   : ${ctx.outDir}`);
  console.log(`   Model : ${model}`);
  console.log(`   Demo  : ${opts.demoMode ? "yes" : "no"}`);
  console.log(
    `   Mode  : ${
      insightsOnly
        ? "insight-only (rerun)"
        : chartsOnly
          ? "chart-only"
          : "chart + insight"
    }\n`,
  );

  ctx.emit?.({
    type: "session",
    taskId,
    model,
    startedAt: new Date(t0).toISOString(),
    csvName: path.basename(ctx.csvPath),
    profileAvailable: !!ctx.cache.profile,
  });

  try {
    // ── Agent 1: Chart ─────────────────────────────────────
    let chartCost: number | undefined;
    if (insightsOnly) {
      ctx.emit?.({ type: "agent", role: "chart", state: "done" });
    } else {
      ctx.emit?.({ type: "agent", role: "chart", state: "running" });
      console.log("▶ Stage 1/2: Chart Agent generating charts...");
      chartCost = await runChartAgent(ctx, model, opts);
      await reconcileOrphanCharts(ctx);
      console.log(`✅ Chart Agent done, generated ${ctx.charts.length} charts\n`);
      ctx.emit?.({ type: "agent", role: "chart", state: "done" });

      // Release raw row data — Insight Agent only reads cached stats, no raw rows needed
      ctx.cache.rows = null;
    }

    // ── Agent 2: Insight (optional) ────────────────────────────
    let insightCost: number | undefined;
    if (!chartsOnly) {
      if (ctx.charts.length === 0) {
        console.warn("⚠️  Chart Agent produced no charts, skipping Insight Agent");
        ctx.emit?.({ type: "agent", role: "insight", state: "skipped" });
      } else {
        ctx.emit?.({ type: "agent", role: "insight", state: "running" });
        console.log("▶ Stage 2/2: Insight Agent writing insights...");
        insightCost = await runInsightAgent(ctx, model, opts);
        console.log(`✅ Insight Agent done, wrote ${ctx.insights.length} insights\n`);
        ctx.emit?.({ type: "agent", role: "insight", state: "done" });
      }
    } else {
      ctx.emit?.({ type: "agent", role: "insight", state: "skipped" });
    }

    // ── Assembly ───────────────────────────────────────────────
    const out = await assembleReports(ctx, { chartsOnly });
    const durationMs = Date.now() - t0;
    const total = (chartCost ?? 0) + (insightCost ?? 0);

    ctx.emit?.({
      type: "cost",
      chart: chartCost,
      insight: insightCost,
      total,
      durationMs,
    });
    ctx.emit?.({
      type: "done",
      taskId,
      reports: {
        charts: "charts",
        insight: out.insightReportPath ? "insight" : undefined,
        merged: "merged",
        html: out.htmlReportPath ? "html" : undefined,
      },
      charts: ctx.charts.length,
      insights: ctx.insights.length,
      cost: { chart: chartCost, insight: insightCost, total },
      durationMs,
    });

    return {
      chartsReportPath: out.chartsReportPath,
      insightReportPath: out.insightReportPath,
      combinedReportPath: out.combinedReportPath,
      htmlReportPath: out.htmlReportPath,
      charts: ctx.charts,
      insights: ctx.insights,
      costUsd: {
        chart: chartCost,
        insight: insightCost,
        total,
      },
    };
  } catch (err) {
    ctx.emit?.({
      type: "error",
      message: err instanceof Error ? err.message : String(err),
    });
    throw err;
  }
}

// ─────────────────────────────────────────────────────────
// Chart Agent
// ─────────────────────────────────────────────────────────

/**
 * Build Chart Agent's prompt — inject the pre-warmed profile summary
 * to save a profile_csv tool call and prevent the Agent from hallucinating column names.
 */
function buildChartAgentPrompt(ctx: TaskContext): string {
  const p = ctx.cache.profile;
  if (!p) {
    // No pre-warmed profile (very rare), fall back to raw approach
    return `Please generate 3–6 charts for this CSV: ${ctx.csvPath}. Start by calling inspect_csv.`;
  }

  const colSummary = p.columns
    .map((c) => {
      let desc = `${c.name} (${c.semanticType})`;
      if (c.semanticType === "numeric" && c.min !== undefined) {
        desc += ` [${c.min}..${c.max}, mean=${c.mean}]`;
      }
      if (c.semanticType === "categorical" && c.topValues?.length) {
        const top3 = c.topValues.slice(0, 3).map((v) => v.value).join("/");
        desc += ` [${c.unique} values: ${top3}…]`;
      }
      if (c.semanticType === "datetime") {
        desc += ` [${c.minDate} → ${c.maxDate}]`;
      }
      return desc;
    })
    .join("\n  ");

  const chartTarget = ctx.demoMode ? "exactly 3" : "3–6 informative";
  const demoSuffix = ctx.demoMode
    ? "\n\n**Do not call inspect_csv** — the profile above is sufficient. Generate strictly 3 charts, no more."
    : "\nYou may still call inspect_csv to get full statistics (including quantiles/topValues) and actual data samples.";

  return `CSV file: ${path.basename(ctx.csvPath)}
Rows: ${p.rows}${p.sampledRows < p.rows ? ` (sampled ${p.sampledRows} rows)` : ""}
Columns (${p.columns.length}):
  ${colSummary}

Based on the profile above, generate ${chartTarget} charts.${demoSuffix}`;
}

async function runChartAgent(
  ctx: TaskContext,
  model: string,
  opts: AnalyzeOptions,
): Promise<number | undefined> {
  const mcp = createSdkMcpServer({
    name: "chart-agent",
    version: "1.0.0",
    tools: [
      inspectCsv(ctx),
      getColumnValues(ctx),
      computeCorrelation(ctx),
      createChart(ctx),
    ],
  });

  const demo = opts.demoMode;

  return await runAgent({
    ctx,
    role: "chart",
    mcp,
    mcpName: "chart-agent",
    toolNames: [
      "inspect_csv",
      "get_column_values",
      "compute_correlation",
      "create_chart",
    ],
    systemPrompt: demo ? CHART_AGENT_PROMPT_DEMO : CHART_AGENT_PROMPT,
    prompt: buildChartAgentPrompt(ctx),
    model,
    maxTurns: opts.maxTurns ?? (demo ? 14 : 30),
    maxBudgetUsd: opts.maxBudgetUsd ?? (demo ? 0.08 : 0.3),
    signal: opts.signal,
  });
}

// ─────────────────────────────────────────────────────────
// Insight Agent
// ─────────────────────────────────────────────────────────
async function runInsightAgent(
  ctx: TaskContext,
  model: string,
  opts: AnalyzeOptions,
): Promise<number | undefined> {
  const mcp = createSdkMcpServer({
    name: "insight-agent",
    version: "1.0.0",
    tools: [
      readContext(ctx),
      readColumnStats(ctx),
      readCorrelation(ctx),
      saveInsight(ctx),
    ],
  });

  const demo = opts.demoMode;

  return await runAgent({
    ctx,
    role: "insight",
    mcp,
    mcpName: "insight-agent",
    toolNames: [
      "read_context",
      "read_column_stats",
      "read_correlation",
      "save_insight",
    ],
    systemPrompt: demo ? INSIGHT_AGENT_PROMPT_DEMO : INSIGHT_AGENT_PROMPT,
    prompt: demo
      ? "Write 1–2 sentences of insight per chart, then a 2–3 sentence summary. Start by calling read_context."
      : "Based on the charts and data summary from the previous step, write insights for each chart and provide an overall conclusion. Start by calling read_context.",
    model,
    maxTurns: opts.maxTurns ?? (demo ? 8 : 15),
    maxBudgetUsd: opts.maxBudgetUsd ?? (demo ? 0.04 : 0.2),
    signal: opts.signal,
  });
}

// ─────────────────────────────────────────────────────────
// Common executor
// ─────────────────────────────────────────────────────────
interface RunAgentParams {
  ctx: TaskContext;
  role: AgentRole;
  mcp: ReturnType<typeof createSdkMcpServer>;
  mcpName: string;
  toolNames: string[];
  systemPrompt: string;
  prompt: string;
  model: string;
  maxTurns: number;
  maxBudgetUsd: number;
  signal?: AbortSignal;
}

async function runAgent(params: RunAgentParams): Promise<number | undefined> {
  const allowed = params.toolNames.map(
    (n) => `mcp__${params.mcpName}__${n}`,
  );
  const toolPrefix = `mcp__${params.mcpName}__`;
  const inflight = new Map<string, { name: string; startedAt: number }>();

  if (params.signal?.aborted) {
    throw new Error("analysis cancelled");
  }

  const q = query({
    prompt: params.prompt,
    options: {
      model: params.model,
      systemPrompt: params.systemPrompt,
      mcpServers: { [params.mcpName]: params.mcp },
      allowedTools: allowed,
      disallowedTools: [
        "Bash",
        "Read",
        "Write",
        "Edit",
        "Glob",
        "Grep",
        "WebFetch",
        "WebSearch",
        "NotebookEdit",
        "TodoWrite",
        "Agent",
        "Task",
        "AskUserQuestion",
        "BashOutput",
        "KillBash",
      ],
      settingSources: [],
      permissionMode: "default",
      maxTurns: params.maxTurns,
      env: collectGatewayEnv(),
    },
  });

  let costUsd: number | undefined;

  const onAbort = () => {
    try {
      (q as { interrupt?: () => void }).interrupt?.();
    } catch {
      /* noop */
    }
  };
  params.signal?.addEventListener("abort", onAbort, { once: true });

  try {
    for await (const msg of q) {
      if (params.signal?.aborted) {
        throw new Error("analysis cancelled");
      }
      if (msg.type === "assistant") {
        for (const block of msg.message.content) {
          if (block.type === "tool_use") {
            const fullName = typeof block.name === "string" ? block.name : "";
            const shortName = fullName.startsWith(toolPrefix)
              ? fullName.slice(toolPrefix.length)
              : fullName;
            const id =
              (block as { id?: string }).id ??
              crypto.randomBytes(4).toString("hex");
            inflight.set(id, { name: shortName, startedAt: Date.now() });
            console.log(`  [tool] ${shortName}`);
            params.ctx.emit?.({
              type: "tool",
              id,
              name: shortName,
              agent: params.role,
              state: "running",
              argsSummary: truncate(safeJson(block.input), 240),
            });
          }
        }
      } else if (msg.type === "user") {
        const content = (msg.message as { content?: unknown }).content;
        if (Array.isArray(content)) {
          for (const item of content) {
            if (
              item &&
              typeof item === "object" &&
              (item as { type?: string }).type === "tool_result"
            ) {
              const toolUseId = (item as { tool_use_id?: string }).tool_use_id;
              if (!toolUseId) continue;
              const meta = inflight.get(toolUseId);
              if (!meta) continue;
              inflight.delete(toolUseId);
              const rawContent = (item as { content?: unknown }).content;
              const resultText = extractToolResultText(rawContent);
              const isError =
                (item as { is_error?: boolean }).is_error === true;
              const state: ToolState = isError ? "failed" : "done";
              params.ctx.emit?.({
                type: "tool",
                id: toolUseId,
                name: meta.name,
                agent: params.role,
                state,
                durationMs: Date.now() - meta.startedAt,
                resultSummary: truncate(resultText, 240),
                error: isError ? truncate(resultText, 240) : undefined,
              });
            }
          }
        }
      } else if (msg.type === "result") {
        costUsd = msg.total_cost_usd;
        if (msg.subtype !== "success") {
          throw new Error(
            `${params.mcpName} ended abnormally: ${msg.subtype}${
              "error" in msg ? " — " + (msg as { error?: string }).error : ""
            }`,
          );
        }
      }
    }
  } finally {
    params.signal?.removeEventListener("abort", onAbort);
  }
  return costUsd;
}

// ─────────────────────────────────────────────────────────
async function reconcileOrphanCharts(ctx: TaskContext): Promise<void> {
  const chartsDir = path.join(ctx.outDir, "charts");
  let files: string[];
  try {
    files = await readdir(chartsDir);
  } catch {
    return;
  }
  const registered = new Set(
    ctx.charts.map((c) => path.basename(c.filePath)),
  );
  for (const f of files) {
    if (!f.endsWith(".svg")) continue;
    if (registered.has(f)) continue;
    try {
      await unlink(path.join(chartsDir, f));
      console.log(`  🧹 removed orphan chart file: ${f}`);
    } catch {
      /* ignore */
    }
  }
}

function safeJson(v: unknown): string {
  try {
    return typeof v === "string" ? v : JSON.stringify(v);
  } catch {
    return String(v);
  }
}

function truncate(s: string, n: number): string {
  if (!s) return "";
  return s.length <= n ? s : s.slice(0, n - 1) + "…";
}

function extractToolResultText(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    const parts: string[] = [];
    for (const c of content) {
      if (!c || typeof c !== "object") continue;
      const kind = (c as { type?: string }).type;
      if (kind === "text") {
        const t = (c as { text?: unknown }).text;
        if (typeof t === "string") parts.push(t);
      } else if (kind === "image") {
        parts.push("[image omitted]");
      } else if (kind) {
        parts.push(`[${kind} block]`);
      }
    }
    return parts.join("\n");
  }
  return "";
}

export type { AgentEvent } from "./events.js";
