/**
 * App.tsx — Overall state machine.
 *
 * Layout:
 *   Left 44vw: DropZone (idle) → PassCard (running)
 *   Right 56vw: AgentCanvas
 *   Bottom floating status bar
 *   Right drawer (on demand)
 *
 * Key behaviors:
 *   - upload success → setUpload → connect SSE → POST /start
 *   - insight agent running → body gets insight-active class (switches accent to amber)
 */
import { useCallback, useEffect, useRef, useState } from "react";
import type { UploadResponse } from "./types";
import {
  uploadCsv,
  startAnalyze,
  fetchSession,
  rerunInsights,
  cancelAnalyze,
  fetchAnalysisHistory,
} from "./lib/api";
import type { HistoryRecordWithRestore } from "./lib/api";
import { useAgentStream } from "./hooks/useAgentStream";
import { MeshGradient } from "./components/MeshGradient";
import { DropZone } from "./components/DropZone";
import { SamplePicker } from "./components/SamplePicker";
import { PassCard } from "./components/PassCard";
import { EventLog } from "./components/EventLog";
import { ReportActions } from "./components/ReportActions";
import { AgentCanvas } from "./components/AgentCanvas";
import { StatusBar } from "./components/StatusBar";
import { ToolDrawer } from "./components/ToolDrawer";
import { HistoryPanel } from "./components/HistoryPanel";
import { ReportView } from "./components/ReportView";
import type { ToolInvocation } from "./hooks/useAgentStream";

// ─── Conversation ID ────────────────────────────────────────

const CSV_CONVERSATION_ID_STORAGE_KEY = "csv_analyze_conversation_id";

function getOrCreateConversationId(): string {
  const cached = localStorage.getItem(CSV_CONVERSATION_ID_STORAGE_KEY);
  if (cached) return cached;

  const conversationId = crypto.randomUUID();
  localStorage.setItem(CSV_CONVERSATION_ID_STORAGE_KEY, conversationId);
  return conversationId;
}

// ─── URL helpers ────────────────────────────────────────────

/** Put taskId in URL (?task=xxx) so it can be read after refresh */
function setTaskIdInUrl(taskId: string | null) {
  const url = new URL(window.location.href);
  if (taskId) url.searchParams.set("task", taskId);
  else url.searchParams.delete("task");
  window.history.replaceState({}, "", url.toString());
}

function getTaskIdFromUrl(): string | null {
  return new URL(window.location.href).searchParams.get("task");
}

function getReportIdFromUrl(): string | null {
  return new URL(window.location.href).searchParams.get("report");
}

function setReportIdInUrl(taskId: string | null) {
  const url = new URL(window.location.href);
  if (taskId) {
    url.searchParams.set("report", taskId);
    url.searchParams.delete("task");
  } else {
    url.searchParams.delete("report");
  }
  window.history.replaceState({}, "", url.toString());
}

// ✅ Module-level dedup flag — outside React lifecycle, StrictMode cannot interfere
let _historyFetchInFlight = false;

// ─── App ────────────────────────────────────────────────────

export default function App() {
  const { state, setUpload, restore, connect, reset } = useAgentStream();
  const [drawer, setDrawer] = useState<ToolInvocation | null>(null);
  const [bootstrapping, setBootstrapping] = useState<boolean>(
    () => !!getTaskIdFromUrl(),
  );
  const bootstrappedRef = useRef(false);
  /** Analyze options checked by user below DropZone (persisted for current session) */
  const [chartsOnly, setChartsOnly] = useState<boolean>(false);
  /** Options used in last analysis — reused on retry */
  const lastOptsRef = useRef<{ chartsOnly: boolean; demoMode?: boolean } | null>(null);
  const [rerunning, setRerunning] = useState<boolean>(false);

  // ─── Report view state ─────────────────────────────────
  const [reportTaskId, setReportTaskId] = useState<string | null>(
    () => getReportIdFromUrl(),
  );

  // ─── Conversation ID ────────────────────────────────────
  const conversationIdRef = useRef<string>(getOrCreateConversationId());

  // ─── History state ──────────────────────────────────────
  const [historyRecords, setHistoryRecords] = useState<HistoryRecordWithRestore[]>([]);
  const [historyLoading, setHistoryLoading] = useState<boolean>(true);

  const active =
    state.agentStatus.chart === "running" ||
    state.agentStatus.insight === "running";

  // insight-active body class
  useEffect(() => {
    const body = document.body;
    if (state.agentStatus.insight === "running") {
      body.classList.add("insight-active");
    } else {
      body.classList.remove("insight-active");
    }
    return () => body.classList.remove("insight-active");
  }, [state.agentStatus.insight]);

  useEffect(() => {
    if (_historyFetchInFlight) return;
    _historyFetchInFlight = true;

    setHistoryLoading(true);
    fetchAnalysisHistory(conversationIdRef.current)
      .then(setHistoryRecords)
      .finally(() => {
        _historyFetchInFlight = false;
        setHistoryLoading(false);
      });
  }, []);

  // On startup: if URL has task=xxx, try fetching snapshot from backend to restore
  useEffect(() => {
    if (bootstrappedRef.current) return;
    bootstrappedRef.current = true;

    const tid = getTaskIdFromUrl();
    if (!tid) {
      setBootstrapping(false);
      return;
    }

    (async () => {
      try {
        const snap = await fetchSession(tid, conversationIdRef.current);
        if (!snap) {
          // Session expired or server restarted, clean up URL
          setTaskIdInUrl(null);
          return;
        }
        restore(snap);
        // If session is still running / pending, continue subscribing to SSE
        if (snap.status === "running" || snap.status === "uploaded") {
          connect(snap.taskId);
        }
      } catch (e) {
        // eslint-disable-next-line no-console
        console.warn("restore session failed", e);
      } finally {
        setBootstrapping(false);
      }
    })();
  }, [restore, connect]);

  // After upload success, write taskId into URL
  useEffect(() => {
    if (state.upload?.taskId) {
      setTaskIdInUrl(state.upload.taskId);
    }
  }, [state.upload?.taskId]);

  useEffect(() => {
    if (state.done) {
      fetchAnalysisHistory(conversationIdRef.current).then(setHistoryRecords);
    }
  }, [state.done]);

  const onFile = useCallback(
    async (f: File) => {
      const result: UploadResponse = await uploadCsv(f, conversationIdRef.current);
      setUpload(result);
      connect(result.taskId);
      const opts = { chartsOnly, demoMode: true };
      lastOptsRef.current = opts;
      await startAnalyze(result.taskId, opts, conversationIdRef.current);
    },
    [setUpload, connect, chartsOnly],
  );

  const handleReset = useCallback(() => {
    setTaskIdInUrl(null);
    reset();
    // Don't delete session — it auto-expires (24h TTL).
    // This way history can correctly load reports via live session fallback.
    fetchAnalysisHistory(conversationIdRef.current).then(setHistoryRecords);
  }, [reset]);

  const handleRetry = useCallback(async () => {
    if (!state.taskId) return;
    const opts = lastOptsRef.current ?? { chartsOnly, demoMode: true };
    try {
      await startAnalyze(state.taskId, opts, conversationIdRef.current);
      connect(state.taskId);
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error("retry failed", e);
    }
  }, [state.taskId, connect, chartsOnly]);

  const handleRerunInsights = useCallback(async () => {
    if (!state.taskId || rerunning) return;
    setRerunning(true);
    try {
      await rerunInsights(state.taskId, {}, conversationIdRef.current);
      connect(state.taskId);
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error("rerun failed", e);
    } finally {
      setRerunning(false);
    }
  }, [state.taskId, connect, rerunning]);

  const handleCancel = useCallback(async () => {
    if (!state.taskId) return;
    await cancelAnalyze(state.taskId, conversationIdRef.current);
  }, [state.taskId]);

  // ─── History handlers ───────────────────────────────────

  const handleOpenHistory = useCallback(
    async (record: HistoryRecordWithRestore) => {
      if (!record.restorable) return;

      // done/deleted status → open report view (loaded from store or live session)
      if (record.status === "done" || record.status === "deleted") {
        setReportTaskId(record.taskId);
        setReportIdInUrl(record.taskId);
        return;
      }

      // running/uploaded → try getting snapshot from live session first
      const snap = await fetchSession(record.taskId, conversationIdRef.current);
      if (!snap) return;

      // If live session is actually done, open report view directly
      if (snap.status === "done") {
        setReportTaskId(record.taskId);
        setReportIdInUrl(record.taskId);
        return;
      }

      // Still running, restore live session
      restore(snap);
      setTaskIdInUrl(record.taskId);

      if (snap.status === "running" || snap.status === "uploaded") {
        connect(snap.taskId);
      }
    },
    [restore, connect],
  );

  const handleClearHistory = useCallback(() => {
    // Generates a new conversation_id so the current browser no longer sees
    // old history records. The old data remains in context.store — this is
    // intentional to avoid accidentally deleting non-csv-analyze messages.
    // To truly purge old records, a dedicated endpoint would be needed.
    const id = crypto.randomUUID();
    localStorage.setItem(CSV_CONVERSATION_ID_STORAGE_KEY, id);
    conversationIdRef.current = id;
    setHistoryRecords([]);
  }, []);

  const pending =
    state.phase !== "idle" || !!state.upload || !!state.error;

  const passStatus = currentPassStatus(state);

  // Show minimal loader during restore (keep OLED black bg, no flash)
  if (bootstrapping) {
    return (
      <>
        <MeshGradient />
        <main
          style={{
            position: "relative",
            zIndex: 1,
            minHeight: "100vh",
            display: "grid",
            placeItems: "center",
            fontFamily: "var(--font-mono)",
            fontSize: 11,
            color: "var(--text-muted)",
            letterSpacing: "0.2em",
          }}
        >
          <span>RESTORING SESSION...</span>
        </main>
      </>
    );
  }

  // Report view (opened from history)
  if (reportTaskId) {
    return (
      <ReportView
        taskId={reportTaskId}
        conversationId={conversationIdRef.current}
        onBack={() => {
          setReportTaskId(null);
          setReportIdInUrl(null);
        }}
      />
    );
  }

  return (
    <>
      <MeshGradient />

      <main
        style={{
          position: "relative",
          zIndex: 1,
          minHeight: "100vh",
          display: "flex",
          gap: 0,
        }}
      >
        {/* Left column 44vw */}
        <aside
          style={{
            width: "44vw",
            maxWidth: 640,
            minWidth: 360,
            padding: "72px 40px 120px",
            display: "flex",
            flexDirection: "column",
            gap: 24,
          }}
        >
          {!state.upload && (
            <>
              <DropZone onFile={onFile} disabled={pending} />
              <label
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  fontFamily: "var(--font-mono)",
                  fontSize: 11,
                  color: "var(--text-muted)",
                  letterSpacing: "0.12em",
                  cursor: "pointer",
                  userSelect: "none",
                }}
              >
                <input
                  type="checkbox"
                  checked={chartsOnly}
                  onChange={(e) => setChartsOnly(e.target.checked)}
                  style={{ accentColor: "var(--accent-emerald)" }}
                />
                CHARTS ONLY (skip insight agent · ~1/2 cost)
              </label>
              <SamplePicker onPick={onFile} disabled={pending} />

              <HistoryPanel
                records={historyRecords}
                loading={historyLoading}
                onSelect={handleOpenHistory}
                onClear={handleClearHistory}
              />
            </>
          )}
          {state.upload && (
            <PassCard
              upload={state.upload}
              status={passStatus}
              active={active}
            />
          )}
          {state.upload && active && !state.done && (
            <button
              onClick={handleCancel}
              style={{
                alignSelf: "flex-start",
                padding: "3px 10px",
                background: "transparent",
                border: "1px solid rgba(255,107,107,0.2)",
                borderRadius: 4,
                fontFamily: "var(--font-mono)",
                fontSize: 9,
                letterSpacing: "0.12em",
                color: "var(--text-muted)",
                textTransform: "uppercase",
                cursor: "pointer",
                transition: "color 160ms, border-color 160ms",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.color = "var(--accent-coral, #ff6b6b)";
                e.currentTarget.style.borderColor = "rgba(255,107,107,0.45)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.color = "var(--text-muted)";
                e.currentTarget.style.borderColor = "rgba(255,107,107,0.2)";
              }}
            >
              cancel
            </button>
          )}
          {state.upload && <EventLog state={state} />}
          {state.upload && state.done && state.reports && state.taskId && (
            <ReportActions
              compact
              taskId={state.taskId}
              charts={state.charts.length}
              insights={state.insights.length}
              costUsd={state.cost.total}
              durationMs={state.durationMs}
              kinds={{
                charts: true,
                insight: Boolean(state.reports.insight),
                merged: true,
                html: Boolean(state.reports.html),
              }}
            />
          )}

          {/* Done + has charts → provide "re-run insight" entry */}
          {state.upload &&
            state.done &&
            state.charts.length > 0 && (
              <button
                onClick={handleRerunInsights}
                disabled={rerunning}
                style={{
                  padding: "10px 14px",
                  background: "transparent",
                  border: "1px solid rgba(255,191,94,0.28)",
                  borderRadius: 6,
                  fontFamily: "var(--font-mono)",
                  fontSize: 11,
                  letterSpacing: "0.18em",
                  color: "var(--accent-amber, #ffbf5e)",
                  textTransform: "uppercase",
                  textAlign: "left",
                  cursor: rerunning ? "wait" : "pointer",
                  opacity: rerunning ? 0.55 : 1,
                }}
              >
                rerun insights (keep charts)
              </button>
            )}

          {state.upload && state.done && (
            <button
              onClick={handleReset}
              className="resetLink"
              style={{
                marginTop: 4,
                padding: "10px 14px",
                background: "transparent",
                border: "1px solid rgba(0,255,163,0.22)",
                borderRadius: 6,
                fontFamily: "var(--font-mono)",
                fontSize: 11,
                letterSpacing: "0.18em",
                color: "var(--accent-emerald)",
                textTransform: "uppercase",
                textAlign: "left",
                cursor: "pointer",
                transition: "all 180ms cubic-bezier(0.4, 0, 0.2, 1)",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = "rgba(0,255,163,0.06)";
                e.currentTarget.style.borderColor = "rgba(0,255,163,0.55)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = "transparent";
                e.currentTarget.style.borderColor = "rgba(0,255,163,0.22)";
              }}
            >
              analyze another csv
            </button>
          )}
          {state.error && (
            <div
              style={{
                marginTop: 12,
                padding: "10px 14px",
                background: "rgba(255,107,107,0.08)",
                border: "1px solid rgba(255,107,107,0.25)",
                borderRadius: 6,
                color: "var(--accent-coral)",
                fontFamily: "var(--font-mono)",
                fontSize: 12,
                lineHeight: 1.5,
                display: "flex",
                flexDirection: "column",
                gap: 8,
              }}
            >
              <span>{state.error}</span>
              {state.taskId && (
                <div style={{ display: "flex", gap: 8 }}>
                  <button
                    onClick={handleRetry}
                    style={{
                      padding: "6px 10px",
                      background: "transparent",
                      border: "1px solid rgba(255,107,107,0.4)",
                      borderRadius: 4,
                      color: "var(--accent-coral)",
                      fontFamily: "var(--font-mono)",
                      fontSize: 11,
                      letterSpacing: "0.15em",
                      textTransform: "uppercase",
                      cursor: "pointer",
                    }}
                  >
                    retry
                  </button>
                  <button
                    onClick={handleReset}
                    style={{
                      padding: "6px 10px",
                      background: "transparent",
                      border: "1px solid rgba(255,255,255,0.14)",
                      borderRadius: 4,
                      color: "var(--text-muted)",
                      fontFamily: "var(--font-mono)",
                      fontSize: 11,
                      letterSpacing: "0.15em",
                      textTransform: "uppercase",
                      cursor: "pointer",
                    }}
                  >
                    reset
                  </button>
                </div>
              )}
            </div>
          )}
        </aside>

        {/* Right column 56vw */}
        <AgentCanvas phase={state.phase} state={state} onReset={handleReset} />
      </main>

      {state.upload && (
        <StatusBar
          tools={state.tools}
          agentStatus={state.agentStatus}
          durationMs={state.durationMs}
          costUsd={state.cost.total}
          onToolClick={(t) => setDrawer(t)}
        />
      )}

      <ToolDrawer tool={drawer} onClose={() => setDrawer(null)} />
    </>
  );
}

function currentPassStatus(state: ReturnType<typeof useAgentStream>["state"]): string | undefined {
  if (state.done) return "report ready";
  if (state.agentStatus.insight === "running") return "writing insights...";
  if (state.agentStatus.chart === "running") {
    const running = state.tools.find((t) => t.state === "running");
    if (running) return `${running.name.replaceAll("_", " ")}...`;
    return "chart agent thinking...";
  }
  if (state.agentStatus.chart === "done" && state.agentStatus.insight === "idle") {
    return "preparing insights...";
  }
  return "uploaded · ready";
}
