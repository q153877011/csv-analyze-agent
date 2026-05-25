/**
 * ColumnScan: core visualization for ACT 2.
 *
 * One row per column; 60 div blocks represent normalized distribution values.
 * Color mapping:
 *   numeric   → emerald
 *   datetime  → cyan
 *   categorical / boolean → blue
 *   id        → muted grey
 *   text      → dimmed
 *
 * Scanline effect: rows light up in sequence (CSS stagger); an outer sweeping line adds additional visual flair.
 */
import { useMemo } from "react";
import type { ColumnDistribution } from "../types";
import styles from "./ColumnScan.module.css";

interface ColumnScanProps {
  distributions: ColumnDistribution[];
  /** Whether the component is in "scanning" state — controls the sweeping line */
  scanning: boolean;
}

export function ColumnScan({ distributions, scanning }: ColumnScanProps) {
  const rows = useMemo(
    () => distributions.slice(0, 24), // Truncate beyond 24 columns to maintain visual density
    [distributions],
  );
  return (
    <div className={`${styles.wrap} ${scanning ? styles.scanning : ""}`}>
      <div className={styles.legend}>
        <span className={styles.legendLabel}>COLUMN SCAN</span>
        <span className={styles.legendMeta}>
          {distributions.length} columns · 60-bin profile
        </span>
      </div>
      <div className={styles.table}>
        {rows.map((d, i) => (
          <div
            key={d.column}
            className={styles.row}
            style={{ animationDelay: `${i * 40}ms` }}
          >
            <div className={styles.name} title={d.column}>
              {d.column}
            </div>
            <div className={styles.bins}>
              {d.bins.map((v, j) => (
                <span
                  key={j}
                  className={`${styles.bin} ${styles[d.semanticType] ?? ""}`}
                  style={
                    {
                      "--v": v.toFixed(3),
                      "--delay": `${j * 12}ms`,
                    } as React.CSSProperties
                  }
                />
              ))}
            </div>
            <div className={`${styles.chip} ${styles[`chip_${d.semanticType}`] ?? ""}`}>
              {d.semanticType}
            </div>
          </div>
        ))}
      </div>
      {scanning && <div className={styles.sweep} aria-hidden="true" />}
    </div>
  );
}
