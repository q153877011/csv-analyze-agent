/**
 * ReportView: full-page view for historical analysis reports.
 * Renders after loading complete artifacts from context.store.
 */
import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import type { AnalysisArtifacts } from "../lib/api";
import { fetchHistoryDetail } from "../lib/api";
import { formatDuration, formatCost } from "../lib/format";
import { ChartCard } from "./ChartCard";
import { InsightBlock } from "./InsightBlock";
import { SummaryIsland } from "./SummaryIsland";
import { MeshGradient } from "./MeshGradient";
import styles from "./ReportView.module.css";

interface ReportViewProps {
  taskId: string;
  conversationId: string;
  onBack: () => void;
}

export function ReportView({ taskId, conversationId, onBack }: ReportViewProps) {
  const [artifacts, setArtifacts] = useState<AnalysisArtifacts | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    fetchHistoryDetail(taskId, conversationId)
      .then((data) => {
        if (cancelled) return;
        if (!data) {
          setError("Report not found. It may have been deleted.");
        } else {
          setArtifacts(data);
        }
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, [taskId, conversationId]);

  if (loading) {
    return (
      <>
        <MeshGradient />
        <main className={styles.loadingWrap}>
          <span className={styles.loadingText}>LOADING REPORT...</span>
        </main>
      </>
    );
  }

  if (error || !artifacts) {
    return (
      <>
        <MeshGradient />
        <main className={styles.errorWrap}>
          <div className={styles.errorBox}>
            <p>{error ?? "Unknown error"}</p>
            <button className={styles.backBtn} onClick={onBack}>
              ← back to home
            </button>
          </div>
        </main>
      </>
    );
  }

  const summary = artifacts.insights.find((i) => i.kind === "summary");
  const perChart = artifacts.insights.filter((i) => i.kind === "per_chart");

  return (
    <>
      <MeshGradient />
      <main className={styles.main}>
        {/* Header */}
        <header className={styles.header}>
          <button className={styles.backBtn} onClick={onBack}>
            ← back
          </button>
          <div className={styles.meta}>
            <h1 className={styles.title}>{artifacts.csvName}</h1>
            <div className={styles.stats}>
              <span>{artifacts.profile.rows.toLocaleString()} rows</span>
              <span className={styles.sep}>·</span>
              <span>{artifacts.profile.columns.length} columns</span>
              <span className={styles.sep}>·</span>
              <span>{artifacts.charts.length} charts</span>
              <span className={styles.sep}>·</span>
              <span>{formatCost(artifacts.cost.total)}</span>
              <span className={styles.sep}>·</span>
              <span>{formatDuration(artifacts.durationMs)}</span>
            </div>
            <div className={styles.date}>
              {new Date(artifacts.createdAt).toLocaleString()}
            </div>
          </div>
        </header>

        {/* Summary */}
        {summary && <SummaryIsland text={summary.text} />}

        {/* Charts + Insights */}
        <motion.div
          className={styles.charts}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.3 }}
        >
          {artifacts.charts.map((chart, i) => {
            const chartInsights = perChart.filter(
              (ins) => ins.chartId === chart.id,
            );
            return (
              <ChartCard
                key={chart.id}
                chart={chart}
                index={i}
                svgContent={artifacts.svgs[chart.id]}
              >
                {chartInsights.map((ins, j) => (
                  <InsightBlock key={`${chart.id}-${j}`} text={ins.text} live={false} />
                ))}
              </ChartCard>
            );
          })}
        </motion.div>
      </main>
    </>
  );
}
