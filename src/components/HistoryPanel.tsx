/**
 * HistoryPanel — Card-grid layout matching SamplePicker's visual language.
 *
 * Renders as a "RECENT ANALYSES" section with 2-column mini-cards.
 * Shown inline on the homepage when idle — no toggle needed.
 */
import type { HistoryRecordWithRestore } from "../lib/api";
import { formatDuration, formatCost } from "../lib/format";
import css from "./HistoryPanel.module.css";

interface HistoryPanelProps {
  records: HistoryRecordWithRestore[];
  loading?: boolean;
  onSelect: (record: HistoryRecordWithRestore) => void;
  onClear: () => void;
}

function relativeTime(ts: number): string {
  const diff = Date.now() - ts;
  if (diff < 60_000) return "just now";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  const d = new Date(ts);
  if (d.getFullYear() === new Date().getFullYear()) {
    return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  }
  return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

export function HistoryPanel({ records, loading, onSelect, onClear }: HistoryPanelProps) {
  if (!loading && records.length === 0) return null;

  return (
    <div className={css.wrap}>
      <div className={css.header}>
        <span className={css.label}>Recent Analyses</span>
        <span className={css.rule} aria-hidden />
        {!loading && records.length > 0 && (
          <button className={css.clearLink} onClick={onClear}>
            clear
          </button>
        )}
      </div>

      {loading && (
        <div className={css.loading}>loading history...</div>
      )}

      {!loading && (
        <div className={css.grid}>
          {records.map((r) => (
          <button
            key={`${r.taskId}-${r.updatedAt}`}
            type="button"
            className={`${css.card} ${!r.restorable ? css.expired : ""}`}
            data-status={r.status}
            onClick={() => onSelect(r)}
            title={r.restorable ? "Restore this session" : "Session expired"}
          >
            <div className={css.cardTop}>
              <span className={css.statusDot} data-status={r.status} />
              <span className={css.timeMeta}>{relativeTime(r.updatedAt)}</span>
            </div>

            <div className={css.csvName}>{r.csvName}</div>

            <div className={css.stats}>
              <span>{r.rows.toLocaleString()} rows</span>
              <span className={css.sep}>&middot;</span>
              <span>{r.columns} cols</span>
              {r.charts != null && (
                <>
                  <span className={css.sep}>&middot;</span>
                  <span>{r.charts} charts</span>
                </>
              )}
              {r.cost?.total != null && (
                <>
                  <span className={css.sep}>&middot;</span>
                  <span>{formatCost(r.cost.total)}</span>
                </>
              )}
              {r.durationMs != null && (
                <>
                  <span className={css.sep}>&middot;</span>
                  <span>{formatDuration(r.durationMs)}</span>
                </>
              )}
            </div>

            {r.error && (
              <div className={css.errorHint}>
                {r.error.length > 60 ? r.error.slice(0, 60) + "..." : r.error}
              </div>
            )}
          </button>
        ))}
        </div>
      )}
    </div>
  );
}
