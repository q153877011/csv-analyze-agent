/**
 * SamplePicker —— pre-built CSV dataset selector.
 *
 * Placed below the DropZone; clicking any card lets users quickly try a template,
 * going through the exact same onFile flow as a manual upload.
 *
 * Data files are served from /public/mock/ and bundled as static assets with the frontend at deploy time.
 */
import { useState } from "react";
import styles from "./SamplePicker.module.css";

export interface SampleDataset {
  file: string;            // public path, e.g. /mock/employees.csv
  name: string;            // filename, e.g. employees.csv (passed to onFile)
  title: string;           // display title
  meta: string;            // "50 × 11"
  hint: string;            // one-line description
  icon: string;            // emoji or 2-character marker
}

const SAMPLES: SampleDataset[] = [
  {
    file: "/mock/employees.csv",
    name: "employees.csv",
    title: "Employees",
    meta: "40 × 7",
    hint: "Department · Seniority · Salary distribution",
    icon: "👥",
  },
  {
    file: "/mock/sales_2025.csv",
    name: "sales_2025.csv",
    title: "E-commerce Sales",
    meta: "48 × 8",
    hint: "Region · Category · Time series",
    icon: "🛒",
  },
  {
    file: "/mock/restaurant_reviews.csv",
    name: "restaurant_reviews.csv",
    title: "Restaurant Reviews",
    meta: "40 × 7",
    hint: "Price vs rating correlation",
    icon: "🍽️",
  },
  {
    file: "/mock/users_behavior.csv",
    name: "users_behavior.csv",
    title: "SaaS User Behavior",
    meta: "40 × 7",
    hint: "Retention · MRR · Paid tiers",
    icon: "📈",
  },
];

interface SamplePickerProps {
  onPick: (file: File) => Promise<void>;
  disabled?: boolean;
}

export function SamplePicker({ onPick, disabled }: SamplePickerProps) {
  const [loadingKey, setLoadingKey] = useState<string | null>(null);

  async function handlePick(s: SampleDataset) {
    if (disabled || loadingKey) return;
    setLoadingKey(s.name);
    try {
      const res = await fetch(s.file);
      if (!res.ok) throw new Error(`sample load failed: ${res.status}`);
      const blob = await res.blob();
      const file = new File([blob], s.name, { type: "text/csv" });
      await onPick(file);
    } catch (e) {
      // On error, briefly show feedback then clear
      console.error(e);
    } finally {
      setLoadingKey(null);
    }
  }

  return (
    <div className={styles.wrap} aria-label="Sample datasets">
      <div className={styles.header}>
        <span className={styles.label}>OR TRY A SAMPLE</span>
        <span className={styles.rule} aria-hidden />
      </div>

      <div className={styles.grid}>
        {SAMPLES.map((s) => {
          const loading = loadingKey === s.name;
          return (
            <button
              key={s.name}
              type="button"
              className={[
                styles.card,
                loading ? styles.loading : "",
                disabled ? styles.disabled : "",
              ]
                .filter(Boolean)
                .join(" ")}
              onClick={() => handlePick(s)}
              disabled={disabled || !!loadingKey}
              aria-busy={loading}
            >
              <div className={styles.cardTop}>
                <span className={styles.icon} aria-hidden>
                  {s.icon}
                </span>
                <span className={styles.meta}>{s.meta}</span>
              </div>
              <div className={styles.cardTitle}>{s.title}</div>
              <div className={styles.cardHint}>{s.hint}</div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
