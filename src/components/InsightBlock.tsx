/**
 * InsightBlock: displays a single insight entry.
 * The backend pushes a full block of text at once; the frontend simulates a typewriter effect
 * (one character every 12ms) — more ceremonial than a plain fade-in.
 */
import { useEffect, useState } from "react";
import styles from "./InsightBlock.module.css";

interface InsightBlockProps {
  text: string;
  /** Whether currently being written — true for the latest entry, false for older ones (no typewriter effect) */
  live?: boolean;
}

const TYPE_INTERVAL_MS = 12;

export function InsightBlock({ text, live }: InsightBlockProps) {
  const [shown, setShown] = useState(live ? "" : text);

  useEffect(() => {
    if (!live) {
      setShown(text);
      return;
    }
    let i = 0;
    setShown("");
    const timer = window.setInterval(() => {
      i += 1;
      setShown(text.slice(0, i));
      if (i >= text.length) {
        window.clearInterval(timer);
      }
    }, TYPE_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [text, live]);

  return (
    <div className={styles.block}>
      <div className={styles.tag}>
        <span className={styles.dot} aria-hidden="true" />
        insight
      </div>
      <p
        className={styles.body}
        dangerouslySetInnerHTML={{ __html: highlightNumbers(shown) }}
      />
      {live && shown.length < text.length && (
        <span className={styles.caret} aria-hidden="true">
          ▍
        </span>
      )}
    </div>
  );
}

/**
 * Naively highlights common numbers: percentages, currencies, ratios, multiples, correlation coefficients.
 *
 * Skips ISO dates (2024-01-05), times (14:30:00), and version numbers (1.2.3) —
 * otherwise they'd be broken into scattered <mark>2024</mark>-<mark>01</mark>-<mark>05</mark>, which looks bad.
 *
 * Approach: first protect these "compound numeric structures" with placeholders, apply highlighting, then restore.
 */
function highlightNumbers(s: string): string {
  const escaped = s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

  const placeholders: string[] = [];
  const protect = (re: RegExp, text: string): string =>
    text.replace(re, (m) => {
      const token = `\u0000P${placeholders.length}\u0000`;
      placeholders.push(m);
      return token;
    });

  // Protect in "longest first" order: datetime > date > time > version
  let working = escaped;
  // ISO date + optional time: 2024-01-05T14:30:00 / 2024/1/5 14:30
  working = protect(
    /\b\d{4}[-/.]\d{1,2}[-/.]\d{1,2}(?:[T ]\d{1,2}:\d{2}(?::\d{2})?)?/g,
    working,
  );
  // Chinese date format: e.g. Jan 5, 2024
  working = protect(/\d{4}年\d{1,2}月\d{1,2}日/g, working);
  // Time only: 14:30(:00)
  working = protect(/\b\d{1,2}:\d{2}(?::\d{2})?\b/g, working);
  // Version number: 1.2.3
  working = protect(/\b\d+\.\d+\.\d+\b/g, working);

  const highlighted = working.replace(
    /(\d+(?:\.\d+)?\s?(?:%|倍|次|天|小时|分钟|元|USD|\$)|\b\d+(?:\.\d+)?\b)/g,
    (m) => `<mark>${m}</mark>`,
  );

  // Restore placeholders
  return highlighted.replace(/\u0000P(\d+)\u0000/g, (_, idx) => {
    const raw = placeholders[Number(idx)] ?? "";
    return raw;
  });
}
