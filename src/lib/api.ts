/**
 * Frontend → Backend HTTP / SSE wrapper.
 *
 * EdgeOne Pages Functions routes (all POST):
 *   POST /upload                  → multipart CSV upload
 *   POST /analyze                 → body:{taskId, action:"get"|"start"|"cancel"|"delete"}
 *   POST /analyze/stream          → body:{taskId} → SSE stream (fetch streaming)
 *   POST /analyze/rerun-insights  → body:{taskId}
 *   POST /analyze/download        → body:{taskId, kind}
 *   POST /static                  → body:{taskId, path}
 *   POST /history                 → fetch analysis history
 *   POST /history/detail          → get full analysis artifacts
 *
 * In dev mode, vite proxy forwards these routes to localhost:8088.
 */
import type { AgentEvent } from "./events";
import type { UploadResponse, CsvProfile, ChartMeta, Insight } from "../types";

// ─── History record type ────────────────────────────────────

export type AnalysisHistoryStatus =
  | "uploaded"
  | "running"
  | "done"
  | "error"
  | "cancelled"
  | "deleted";

export interface CsvAnalysisHistoryRecord {
  kind: "csv_analysis";
  version: 1;
  taskId: string;
  csvName: string;
  size: number;
  status: AnalysisHistoryStatus;
  createdAt: number;
  updatedAt: number;
  rows: number;
  columns: number;
  charts?: number;
  insights?: number;
  cost?: { chart?: number; insight?: number; total: number };
  durationMs?: number;
  reports?: { charts: boolean; insight: boolean; merged: boolean; html: boolean };
  error?: string;
}

/** Returned from /history endpoint — includes server-computed session liveness. */
export interface HistoryRecordWithRestore extends CsvAnalysisHistoryRecord {
  restorable: boolean;
}

// ─── Conversation header helper ─────────────────────────────

function conversationHeaders(conversationId?: string): Record<string, string> {
  return conversationId
    ? { "pages-agent-conversation-id": conversationId }
    : {};
}

// ─── API functions ──────────────────────────────────────────

export async function uploadCsv(
  file: File,
  conversationId?: string,
): Promise<UploadResponse> {
  const form = new FormData();
  form.append("file", file);
  // multipart: don't set Content-Type, browser auto-adds boundary; only add conversation header
  const res = await fetch("/upload", {
    method: "POST",
    headers: conversationHeaders(conversationId),
    body: form,
  });
  if (!res.ok) {
    const err = await safeJson(res);
    throw new Error(err?.error ?? `upload failed: ${res.status}`);
  }
  return (await res.json()) as UploadResponse;
}

export async function startAnalyze(
  taskId: string,
  opts: { chartsOnly?: boolean; model?: string; demoMode?: boolean } = {},
  conversationId?: string,
): Promise<void> {
  const res = await fetch("/analyze", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...conversationHeaders(conversationId),
    },
    body: JSON.stringify({ taskId, action: "start", ...opts }),
  });
  if (!res.ok) {
    const err = await safeJson(res);
    throw new Error(err?.error ?? `start failed: ${res.status}`);
  }
}

export async function cancelAnalyze(
  taskId: string,
  conversationId?: string,
): Promise<void> {
  try {
    await fetch("/analyze", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...conversationHeaders(conversationId),
      },
      body: JSON.stringify({ taskId, action: "cancel" }),
    });
  } catch {
    /* best effort */
  }
}

export async function rerunInsights(
  taskId: string,
  opts: { model?: string } = {},
  conversationId?: string,
): Promise<void> {
  const res = await fetch("/analyze/rerun-insights", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...conversationHeaders(conversationId),
    },
    body: JSON.stringify({ taskId, ...opts }),
  });
  if (!res.ok) {
    const err = await safeJson(res);
    throw new Error(err?.error ?? `rerun failed: ${res.status}`);
  }
}

export interface SessionSnapshot {
  taskId: string;
  status: "uploaded" | "running" | "done" | "error";
  csvName: string;
  size: number;
  createdAt: number;
  profile: UploadResponse["profile"];
  distributions: UploadResponse["distributions"];
  events: AgentEvent[];
}

export async function fetchSession(
  taskId: string,
  conversationId?: string,
): Promise<SessionSnapshot | null> {
  try {
    const res = await fetch("/analyze", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...conversationHeaders(conversationId),
      },
      body: JSON.stringify({ taskId, action: "get" }),
    });
    if (res.status === 404) return null;
    if (!res.ok) {
      const err = await safeJson(res);
      throw new Error(err?.error ?? `fetch session failed: ${res.status}`);
    }
    return (await res.json()) as SessionSnapshot;
  } catch {
    return null;
  }
}

// ─── History API ────────────────────────────────────────────

/**
 * Fetch the current conversation's analysis history.
 * Includes 409 retry (React StrictMode double-render may trigger it).
 */
export async function fetchAnalysisHistory(
  conversationId: string,
): Promise<HistoryRecordWithRestore[]> {
  try {
    const res = await fetch("/history", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...conversationHeaders(conversationId),
      },
      body: JSON.stringify({}),
    });

    if (!res.ok) return [];

    const data = (await res.json().catch(() => null)) as {
      records?: HistoryRecordWithRestore[];
    } | null;
    return Array.isArray(data?.records) ? data.records : [];
  } catch {
    return [];
  }
}

// ─── History Detail (full artifacts) ───────────────────────

/**
 * Analysis artifacts type (mirrors backend AnalysisArtifacts from agents/_lib/history.ts).
 * Shared between backend and frontend for type safety.
 */
export interface AnalysisArtifacts {
  kind: "csv_analysis_artifacts";
  version: 1;
  taskId: string;
  csvName: string;
  profile: CsvProfile;
  charts: ChartMeta[];
  insights: Insight[];
  svgs: Record<string, string>;
  reportHtml: string;
  cost: { chart?: number; insight?: number; total: number };
  durationMs: number;
  createdAt: number;
}

/**
 * Fetch full artifacts for a specific analysis (SVG, insights, report).
 */
export async function fetchHistoryDetail(
  taskId: string,
  conversationId: string,
): Promise<AnalysisArtifacts | null> {
  try {
    const res = await fetch("/history/detail", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...conversationHeaders(conversationId),
      },
      body: JSON.stringify({ taskId }),
    });
    if (res.status === 404) return null;
    if (!res.ok) return null;
    return (await res.json()) as AnalysisArtifacts;
  } catch {
    return null;
  }
}

// ─── SSE Stream ─────────────────────────────────────────────

/**
 * Subscribe to SSE stream (uses fetch streaming instead of EventSource because EdgeOne doesn't support GET query params).
 * Returns unsubscribe function.
 *
 * Note: SSE long connection does not carry conversation header to avoid EdgeOne runtime returning 409 on concurrent requests.
 */
export function subscribeStream(
  taskId: string,
  onEvent: (evt: AgentEvent) => void,
  onError?: (err: Event | Error) => void,
): () => void {
  const abortController = new AbortController();

  (async () => {
    try {
      const res = await fetch("/analyze/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ taskId }),
        signal: abortController.signal,
      });

      if (!res.ok || !res.body) {
        onError?.(new Error(`stream failed: ${res.status}`));
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      const seen = new Set<string>();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        // Parse SSE frames from buffer
        const frames = buffer.split("\n\n");
        buffer = frames.pop() ?? ""; // last incomplete frame stays in buffer

        for (const frame of frames) {
          if (!frame.trim() || frame.startsWith(":")) continue; // comment/keepalive

          const dataMatch = frame.match(/^data:\s*(.+)$/m);

          if (!dataMatch) continue;

          try {
            const data = JSON.parse(dataMatch[1]!) as AgentEvent;
            const key = eventKey(data);
            if (seen.has(key)) continue;
            seen.add(key);
            onEvent(data);
          } catch {
            // bad frame, skip
          }
        }
      }
    } catch (e) {
      if ((e as Error).name !== "AbortError") {
        onError?.(e as Error);
      }
    }
  })();

  return () => abortController.abort();
}

function eventKey(evt: AgentEvent): string {
  switch (evt.type) {
    case "session":
      return `session:${evt.taskId}`;
    case "agent":
      return `agent:${evt.role}:${evt.state}`;
    case "tool":
      return `tool:${evt.id}:${evt.state}`;
    case "chart":
      return `chart:${evt.chart.id}`;
    case "insight":
      return `insight:${evt.insight.kind}:${evt.insight.chartId ?? "summary"}:${fnv1a(evt.insight.text)}`;
    case "cost":
      return `cost:${evt.total.toFixed(6)}:${evt.durationMs}`;
    case "done":
      return `done:${evt.taskId}`;
    case "error":
      return `error:${fnv1a(evt.message)}`;
  }
}

function fnv1a(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = (h * 0x01000193) >>> 0;
  }
  return h.toString(16);
}

/**
 * Manually trigger file download (POST to get file content then create blob URL)
 */
export async function downloadReport(
  taskId: string,
  kind: "charts" | "insight" | "merged" | "html",
): Promise<void> {
  const res = await fetch("/analyze/download", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ taskId, kind }),
  });
  if (!res.ok) throw new Error(`download failed: ${res.status}`);

  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = res.headers.get("Content-Disposition")?.match(/filename="([^"]+)"/)?.[1] ?? `report.${kind === "html" ? "html" : "md"}`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Fetch an SVG's text content.
 * svgUrl format: "{taskId}/{relPath}" (injected by backend dispatch)
 */
export async function fetchSvg(svgUrl: string): Promise<string> {
  const slashIdx = svgUrl.indexOf("/");
  if (slashIdx === -1) throw new Error(`invalid svgUrl: ${svgUrl}`);
  const taskId = svgUrl.slice(0, slashIdx);
  const filePath = svgUrl.slice(slashIdx + 1);

  const res = await fetch("/static", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ taskId, path: filePath }),
  });
  if (!res.ok) throw new Error(`svg fetch ${res.status}`);
  return await res.text();
}

async function safeJson(
  res: Response,
): Promise<{ error?: string } | undefined> {
  try {
    return (await res.json()) as { error?: string };
  } catch {
    return undefined;
  }
}
