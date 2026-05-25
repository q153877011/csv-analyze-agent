/**
 * ReportActions: download action bar shown after analysis is done.
 */
import { useCallback } from "react";
import { motion } from "framer-motion";
import styles from "./ReportActions.module.css";
import { downloadReport } from "../lib/api";

interface ReportActionsProps {
  taskId: string;
  charts: number;
  insights: number;
  costUsd: number;
  durationMs: number;
  kinds: {
    charts: boolean;
    insight: boolean;
    merged: boolean;
    html: boolean;
  };
  compact?: boolean;
}

export function ReportActions({
  taskId,
  charts,
  insights,
  costUsd,
  durationMs,
  kinds,
  compact = false,
}: ReportActionsProps) {
  const cards: Array<{
    key: "charts" | "insight" | "merged" | "html";
    icon: string;
    title: string;
    file: string;
  }> = [];
  if (kinds.charts)
    cards.push({ key: "charts", icon: "📈", title: "CHARTS", file: "charts.md" });
  if (kinds.insight)
    cards.push({ key: "insight", icon: "💡", title: "INSIGHT", file: "insight.md" });
  if (kinds.merged)
    cards.push({ key: "merged", icon: "📄", title: "MERGED", file: "report.md" });
  if (kinds.html)
    cards.push({ key: "html", icon: "📎", title: "HTML", file: "report.html" });

  const handleDownload = useCallback(
    (kind: "charts" | "insight" | "merged" | "html") => {
      downloadReport(taskId, kind).catch((e) =>
        console.error("download failed", e),
      );
    },
    [taskId],
  );

  return (
    <motion.section
      className={`${styles.wrap} ${compact ? styles.compact : ""}`}
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: [0.76, 0, 0.24, 1] }}
    >
      {compact && (
        <header className={styles.cHeader}>
          <span className={styles.cHeaderTitle}>REPORTS</span>
          <span className={styles.cHeaderCount}>{cards.length}</span>
        </header>
      )}

      <div className={compact ? styles.cStats : styles.stats}>
        {charts} CHARTS · {insights} INSIGHTS · ${costUsd.toFixed(4)} ·{" "}
        {(durationMs / 1000).toFixed(1)}s
      </div>

      {compact ? (
        <ul className={styles.cList}>
          {cards.map((c) => (
            <li key={c.key}>
              <button
                className={styles.cCard}
                onClick={() => handleDownload(c.key)}
              >
                <span className={styles.cIcon}>{c.icon}</span>
                <span className={styles.cLabels}>
                  <span className={styles.cTitle}>{c.title}</span>
                  <span className={styles.cFile}>{c.file}</span>
                </span>
                <span className={styles.cAction}>↓</span>
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <>
          <div className={styles.row}>
            {cards
              .filter((c) => c.key !== "html")
              .map((c) => (
                <button
                  key={c.key}
                  className={styles.card}
                  onClick={() => handleDownload(c.key)}
                >
                  <span className={styles.icon}>{c.icon}</span>
                  <span className={styles.title}>{c.title}</span>
                  <span className={styles.file}>{c.file}</span>
                  <span className={styles.action}>[download]</span>
                </button>
              ))}
          </div>
          {kinds.html && (
            <div className={styles.htmlRow}>
              <button
                className={`${styles.card} ${styles.htmlCard}`}
                onClick={() => handleDownload("html")}
              >
                <span className={styles.icon}>📎</span>
                <span className={styles.title}>HTML</span>
                <span className={styles.file}>report.html (bundled)</span>
                <span className={styles.action}>[download]</span>
              </button>
            </div>
          )}
        </>
      )}
    </motion.section>
  );
}
