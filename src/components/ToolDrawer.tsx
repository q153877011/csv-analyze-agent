/**
 * ToolDrawer: slides out from the right when a chip is clicked, displaying the tool's args/result/error as JSON.
 */
import { AnimatePresence, motion } from "framer-motion";
import type { ToolInvocation } from "../hooks/useAgentStream";
import styles from "./ToolDrawer.module.css";

interface ToolDrawerProps {
  tool: ToolInvocation | null;
  onClose: () => void;
}

export function ToolDrawer({ tool, onClose }: ToolDrawerProps) {
  return (
    <AnimatePresence>
      {tool && (
        <motion.aside
          key={tool.id}
          className={styles.drawer}
          initial={{ x: 420, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          exit={{ x: 420, opacity: 0 }}
          transition={{ duration: 0.32, ease: [0.4, 0, 0.2, 1] }}
        >
          <header className={styles.head}>
            <div>
              <div className={styles.agent}>{tool.agent}-agent</div>
              <div className={styles.name}>{tool.name}</div>
            </div>
            <button
              onClick={onClose}
              className={styles.close}
              aria-label="close"
            >
              ×
            </button>
          </header>

          <div className={styles.row}>
            <div className={styles.k}>STATE</div>
            <div className={`${styles.v} ${styles[tool.state]}`}>
              {tool.state}
            </div>
          </div>
          {typeof tool.durationMs === "number" && (
            <div className={styles.row}>
              <div className={styles.k}>DURATION</div>
              <div className={styles.v}>
                {(tool.durationMs / 1000).toFixed(2)}s
              </div>
            </div>
          )}

          {tool.argsSummary && (
            <section className={styles.section}>
              <div className={styles.sectionTitle}>ARGS</div>
              <pre className={styles.json}>{prettify(tool.argsSummary)}</pre>
            </section>
          )}

          {tool.resultSummary && (
            <section className={styles.section}>
              <div className={styles.sectionTitle}>RESULT</div>
              <pre className={styles.json}>{prettify(tool.resultSummary)}</pre>
            </section>
          )}

          {tool.error && (
            <section className={styles.section}>
              <div className={`${styles.sectionTitle} ${styles.errTitle}`}>
                ERROR
              </div>
              <pre className={`${styles.json} ${styles.errBody}`}>
                {tool.error}
              </pre>
            </section>
          )}
        </motion.aside>
      )}
    </AnimatePresence>
  );
}

function prettify(s: string): string {
  try {
    return JSON.stringify(JSON.parse(s), null, 2);
  } catch {
    return s;
  }
}
