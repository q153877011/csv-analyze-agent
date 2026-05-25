/**
 * ToolChip: a single tool status badge in the bottom status bar.
 */
import styles from "./ToolChip.module.css";
import type { ToolInvocation } from "../hooks/useAgentStream";

interface ToolChipProps {
  tool: ToolInvocation;
  onClick?: () => void;
}

const GLYPH: Record<ToolInvocation["state"], string> = {
  running: "●",
  done: "✓",
  failed: "✗",
};

export function ToolChip({ tool, onClick }: ToolChipProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`${styles.chip} ${styles[tool.state]} ${
        tool.agent === "insight" ? styles.insight : ""
      }`}
      title={tool.argsSummary ?? tool.resultSummary ?? tool.name}
    >
      <span className={styles.glyph}>{GLYPH[tool.state]}</span>
      <span className={styles.name}>{tool.name}</span>
      {typeof tool.durationMs === "number" && (
        <span className={styles.dur}>{(tool.durationMs / 1000).toFixed(1)}s</span>
      )}
    </button>
  );
}
