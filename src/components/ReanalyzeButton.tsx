/**
 * ReanalyzeButton —— "analyze again" CTA shown after analysis completes.
 *
 * Same visual tier as ReportActions, but with emerald as the primary color (not accent),
 * placed at the very bottom of the Canvas where the user naturally scrolls after reading the report.
 */
import styles from "./ReanalyzeButton.module.css";

interface ReanalyzeButtonProps {
  onClick: () => void;
}

export function ReanalyzeButton({ onClick }: ReanalyzeButtonProps) {
  return (
    <section className={styles.wrap}>
      <div className={styles.divider} aria-hidden />

      <button type="button" className={styles.btn} onClick={onClick}>
        <span className={styles.inner}>
          <span className={styles.arrow} aria-hidden>
            ↻
          </span>
          <span className={styles.labels}>
            <span className={styles.title}>Analyze another CSV</span>
            <span className={styles.hint}>
              back to upload · or pick a sample dataset
            </span>
          </span>
          <span className={styles.chev} aria-hidden>
            →
          </span>
        </span>
      </button>
    </section>
  );
}
