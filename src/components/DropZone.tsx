/**
 * DropZone: CSV drag-and-drop upload area on the left side of ACT 1.
 *
 * - marching ants dashed border animation
 * - file type error → 1.8s red error message
 * - uploading → emerald pulse ring
 */
import { useCallback, useEffect, useRef, useState } from "react";
import styles from "./DropZone.module.css";

interface DropZoneProps {
  onFile: (file: File) => Promise<void>;
  disabled?: boolean;
}

export function DropZone({ onFile, disabled }: DropZoneProps) {
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const errTimerRef = useRef<number | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    return () => {
      mountedRef.current = false;
      if (errTimerRef.current !== null) {
        window.clearTimeout(errTimerRef.current);
      }
    };
  }, []);

  const scheduleErrorClear = useCallback((ms: number) => {
    if (errTimerRef.current !== null) {
      window.clearTimeout(errTimerRef.current);
    }
    errTimerRef.current = window.setTimeout(() => {
      if (mountedRef.current) setError(null);
      errTimerRef.current = null;
    }, ms);
  }, []);

  const handle = useCallback(
    async (f: File | null) => {
      if (!f) return;
      if (!f.name.toLowerCase().endsWith(".csv")) {
        setError("Only .csv files are supported");
        scheduleErrorClear(1800);
        return;
      }
      setError(null);
      setUploading(true);
      try {
        await onFile(f);
      } catch (e) {
        if (mountedRef.current) {
          setError(e instanceof Error ? e.message : String(e));
          scheduleErrorClear(2800);
        }
      } finally {
        if (mountedRef.current) setUploading(false);
      }
    },
    [onFile, scheduleErrorClear],
  );

  return (
    <div
      className={[
        styles.zone,
        dragging ? styles.dragging : "",
        uploading ? styles.uploading : "",
        error ? styles.error : "",
        disabled ? styles.disabled : "",
      ]
        .filter(Boolean)
        .join(" ")}
      onDragOver={(e) => {
        e.preventDefault();
        if (!disabled) setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        if (disabled) return;
        const f = e.dataTransfer.files?.[0];
        handle(f ?? null);
      }}
      onClick={() => !disabled && inputRef.current?.click()}
    >
      <input
        ref={inputRef}
        type="file"
        accept=".csv,text/csv"
        className={styles.input}
        onChange={(e) => handle(e.target.files?.[0] ?? null)}
      />
      <div className={styles.inner}>
        <div className={styles.title}>
          {uploading ? "UPLOADING…" : "DROP A .CSV"}
        </div>
        <div className={styles.sub}>or click to browse</div>
        <div className={styles.hint}>max 50 MB · 100k rows</div>
        {error && <div className={styles.errText}>{error}</div>}
      </div>
    </div>
  );
}
