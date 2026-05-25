/**
 * EventLog —— left-side real-time log panel.
 *
 * Translates state changes from useAgentStream into timestamped log entries,
 * giving users a clear view of what the agent is doing (prevents the "appears frozen" feeling).
 *
 * Design notes:
 * - The log is "derived state": accumulated purely from state diffs; once state.upload becomes
 *   null (reset), the entire log resets.
 * - The previous implementation pushed to a ref inside useMemo, relying on React executing the
 *   memo only once. Under React 18 StrictMode in development, useMemo is invoked twice per
 *   render (to catch side effects), which caused each log entry to be pushed twice. This version
 *   uses useEffect + useState — the effect runs after commit, ensuring each state change pushes
 *   exactly once.
 *
 * Log types:
 *   - upload      blue           upload complete, column scan ready
 *   - agent       emerald/amber  agent start/stop
 *   - tool        grey/emerald/coral  tool call start/end/failure
 *   - chart       emerald        new chart generated
 *   - insight     amber          insight written (summary / per_chart)
 *   - cost        muted          cost/duration update
 *   - done        emerald        all complete
 *   - error       coral          error
 */
import { useEffect, useRef, useState } from "react";
import type { AgentStreamState, ToolInvocation } from "../hooks/useAgentStream";
import { formatDuration } from "../lib/format";
import styles from "./EventLog.module.css";

type LogKind =
  | "upload"
  | "agent"
  | "tool"
  | "chart"
  | "insight"
  | "cost"
  | "done"
  | "error";

interface LogEntry {
  id: string;
  kind: LogKind;
  time: number;
  text: string;
  detail?: string;
}

interface EventLogProps {
  state: AgentStreamState;
}

interface SeenRecord {
  upload: boolean;
  chartStart: boolean;
  chartDone: boolean;
  insightStart: boolean;
  insightDone: boolean;
  done: boolean;
  error: string | null;
  toolState: Map<string, string>;
  chartIds: Set<string>;
  insightKeys: Set<string>;
  costKey: string | null;
}

function emptySeen(): SeenRecord {
  return {
    upload: false,
    chartStart: false,
    chartDone: false,
    insightStart: false,
    insightDone: false,
    done: false,
    error: null,
    toolState: new Map(),
    chartIds: new Set(),
    insightKeys: new Set(),
    costKey: null,
  };
}

export function EventLog({ state }: EventLogProps) {
  const [entries, setEntries] = useState<LogEntry[]>([]);
  const seenRef = useRef<SeenRecord>(emptySeen());
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const seen = seenRef.current;
    // Reset: upload becoming null means the user clicked reset
    if (!state.upload) {
      seenRef.current = emptySeen();
      setEntries([]);
      return;
    }

    const additions: LogEntry[] = [];
    const now = Date.now();
    let seq = 0;
    const push = (kind: LogKind, text: string, detail?: string) => {
      additions.push({
        id: `${kind}-${now}-${seq++}`,
        kind,
        time: now,
        text,
        detail,
      });
    };

    // Upload complete
    if (!seen.upload) {
      const u = state.upload;
      push(
        "upload",
        `uploaded ${u.csvName ?? "csv"}`,
        `${u.profile?.rows ?? "?"} rows · ${u.profile?.columns?.length ?? "?"} cols`,
      );
      seen.upload = true;
    }

    // Chart agent lifecycle
    const chartStatus = state.agentStatus.chart;
    if (chartStatus === "running" && !seen.chartStart) {
      push("agent", "chart agent started", "planning visualizations");
      seen.chartStart = true;
    }
    if (
      (chartStatus === "done" || chartStatus === "skipped") &&
      !seen.chartDone
    ) {
      push(
        "agent",
        chartStatus === "skipped" ? "chart agent skipped" : "chart agent done",
        `${state.charts.length} charts generated`,
      );
      seen.chartDone = true;
    }

    // Insight agent lifecycle
    const insightStatus = state.agentStatus.insight;
    if (insightStatus === "running" && !seen.insightStart) {
      push("agent", "insight agent started", "writing insights");
      seen.insightStart = true;
    }
    if (
      (insightStatus === "done" || insightStatus === "skipped") &&
      !seen.insightDone
    ) {
      push(
        "agent",
        insightStatus === "skipped"
          ? "insight agent skipped"
          : "insight agent done",
        `${state.insights.length} insights written`,
      );
      seen.insightDone = true;
    }

    // Tool calls
    for (const tool of state.tools) {
      const prev = seen.toolState.get(tool.id);
      if (prev === tool.state) continue;
      seen.toolState.set(tool.id, tool.state);

      if (tool.state === "running") {
        push("tool", `${tool.name}`, toolArgs(tool));
      } else if (tool.state === "done") {
        push(
          "tool",
          `${tool.name} ✓`,
          tool.durationMs != null ? `${tool.durationMs} ms` : undefined,
        );
      } else if (tool.state === "failed") {
        push(
          "tool",
          `${tool.name} ✗ failed`,
          tool.error ?? "unknown error",
        );
      }
    }

    // Chart generation
    for (const chart of state.charts) {
      if (seen.chartIds.has(chart.id)) continue;
      seen.chartIds.add(chart.id);
      push("chart", `new chart: ${chart.title}`, chart.chartType);
    }

    // Insight generation
    for (const ins of state.insights) {
      const key = `${ins.kind}-${ins.chartId ?? "summary"}-${ins.text.slice(0, 24)}`;
      if (seen.insightKeys.has(key)) continue;
      seen.insightKeys.add(key);
      if (ins.kind === "summary") {
        push("insight", "summary written", `${ins.text.length} chars`);
      } else {
        push(
          "insight",
          `insight for ${ins.chartId}`,
          `${ins.text.length} chars`,
        );
      }
    }

    // Cost update (only recorded when total changes meaningfully)
    const costKey = `${state.cost.total.toFixed(6)}`;
    if (costKey !== seen.costKey && state.cost.total > 0) {
      seen.costKey = costKey;
      push(
        "cost",
        `cost update`,
        `$${state.cost.total.toFixed(4)}  ·  ${formatDuration(state.durationMs)}`,
      );
    }

    // Complete
    if (state.done && !seen.done) {
      push(
        "done",
        `analysis complete`,
        `${state.charts.length} charts · ${state.insights.length} insights · $${state.cost.total.toFixed(4)}`,
      );
      seen.done = true;
    }

    // Error
    if (state.error && state.error !== seen.error) {
      push("error", "error", state.error);
      seen.error = state.error;
    }

    if (additions.length > 0) {
      setEntries((prev) => [...prev, ...additions]);
    }
  }, [state]);

  // Auto-scroll to bottom when new entries arrive
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [entries.length]);

  return (
    <section className={styles.panel} aria-label="Agent activity log">
      <header className={styles.header}>
        <span className={styles.dot} data-active={!state.done} />
        <span className={styles.title}>ACTIVITY LOG</span>
        <span className={styles.count}>{entries.length}</span>
      </header>

      <div className={styles.scroll} ref={scrollRef}>
        {entries.length === 0 ? (
          <div className={styles.empty}>waiting for events…</div>
        ) : (
          <ul className={styles.list}>
            {entries.map((e) => (
              <li key={e.id} className={styles.item} data-kind={e.kind}>
                <span className={styles.time}>{formatTime(e.time)}</span>
                <span className={styles.kind}>{e.kind}</span>
                <span className={styles.text}>
                  {e.text}
                  {e.detail && (
                    <span className={styles.detail}>{e.detail}</span>
                  )}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

function formatTime(ts: number): string {
  const d = new Date(ts);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}:${String(d.getSeconds()).padStart(2, "0")}`;
}

function toolArgs(t: ToolInvocation): string | undefined {
  if (!t.argsSummary) return undefined;
  // Truncate if too long
  return t.argsSummary.length > 80
    ? t.argsSummary.slice(0, 77) + "…"
    : t.argsSummary;
}
