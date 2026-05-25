/**
 * StatusBar: floating bottom status bar. Displays agent identity + scrollable tool chips + elapsed time / cost.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import type { ToolInvocation } from "../hooks/useAgentStream";
import type { AgentRole, AgentState } from "../lib/events";
import { ToolChip } from "./ToolChip";
import styles from "./StatusBar.module.css";

interface StatusBarProps {
  tools: ToolInvocation[];
  agentStatus: Record<AgentRole, AgentState | "idle">;
  durationMs: number;
  costUsd: number;
  onToolClick: (t: ToolInvocation) => void;
}

export function StatusBar({
  tools,
  agentStatus,
  durationMs,
  costUsd,
  onToolClick,
}: StatusBarProps) {
  const [now, setNow] = useState(() => Date.now());
  const startRef = useRef<number | null>(null);

  // Start the timer when the agent becomes active
  useEffect(() => {
    const active =
      agentStatus.chart === "running" || agentStatus.insight === "running";
    if (active && startRef.current == null) {
      startRef.current = Date.now();
    }
    if (!active) {
      // Stop the timer — but keep the durationMs prop as the final value
    }
  }, [agentStatus]);

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 120);
    return () => window.clearInterval(id);
  }, []);

  const live =
    agentStatus.chart === "running" || agentStatus.insight === "running";
  const elapsedSec = useMemo(() => {
    if (durationMs > 0) return durationMs / 1000;
    if (!live || startRef.current == null) return 0;
    return (now - startRef.current) / 1000;
  }, [now, durationMs, live]);

  return (
    <div className={styles.bar}>
      <div className={styles.agents}>
        <AgentBadge role="chart" state={agentStatus.chart} />
        <span className={styles.divider}>·</span>
        <AgentBadge role="insight" state={agentStatus.insight} />
      </div>
      <div className={styles.chips}>
        {tools.length === 0 && (
          <span className={styles.empty}>awaiting tool calls…</span>
        )}
        {tools.map((t) => (
          <ToolChip key={t.id} tool={t} onClick={() => onToolClick(t)} />
        ))}
      </div>
      <div className={styles.meta}>
        <span className={styles.time}>
          ⏱ {elapsedSec.toFixed(1)}s
        </span>
        <span className={styles.cost}>
          ${costUsd.toFixed(4)}
        </span>
      </div>
    </div>
  );
}

function AgentBadge({
  role,
  state,
}: {
  role: AgentRole;
  state: AgentState | "idle";
}) {
  return (
    <span
      className={`${styles.badge} ${styles[state]} ${
        role === "insight" ? styles.insight : styles.chart
      }`}
    >
      <span className={styles.badgeDot} aria-hidden="true" />
      {role}-agent
    </span>
  );
}
