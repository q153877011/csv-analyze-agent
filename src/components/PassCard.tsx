/**
 * PassCard: after upload completes, the drop zone collapses into a "movie ticket stub" card.
 * Left side has a vertical perforated edge (drawn with radial-gradient), with a 2px emerald left border.
 */
import styles from "./PassCard.module.css";
import type { UploadResponse } from "../types";
import { formatSize } from "../lib/format";

interface PassCardProps {
  upload: UploadResponse;
  status?: string;
  active?: boolean;
}

export function PassCard({ upload, status, active }: PassCardProps) {
  const { profile, csvName, size } = upload;
  return (
    <div className={`${styles.card} ${active ? styles.active : ""}`}>
      <div className={styles.perf} aria-hidden="true" />
      <div className={styles.body}>
        <div className={styles.name}>{csvName}</div>
        <div className={styles.rule} />
        <div className={styles.stats}>
          <span>{profile.rows.toLocaleString()} rows</span>
          <span className={styles.sep}>·</span>
          <span>{profile.columns.length} columns</span>
        </div>
        <div className={styles.meta}>
          {formatSize(size)} · utf-8 · comma-delimited
        </div>
        {status && (
          <div className={styles.status}>
            <span className={styles.dot} />
            <span>{status}</span>
          </div>
        )}
      </div>
    </div>
  );
}
