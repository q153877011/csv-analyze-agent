/**
 * POST /history/detail — Retrieve the full artifacts for an analysis (SVG, insights, report)
 *
 * Reads from context.store first; falls back to building live from session if not found in store.
 */
import { jsonResponse, errorResponse, getRequestBody } from "../_lib/handlers.js";
import { getSession, type Session } from "../_lib/session.js";
import {
  APP_NAME,
  ARTIFACTS_KIND,
  type AnalysisArtifacts,
} from "../_lib/history.js";
import {
  extractChartsFromEvents,
  extractInsightsFromEvents,
  loadChartSvgs,
  loadReportHtml,
} from "../_lib/artifacts.js";

interface StoreMessage {
  messageId?: string;
  role?: string;
  content?: unknown;
  createdAt?: number;
  metadata?: Record<string, unknown>;
}

export async function onRequest(context: any) {
  const { request } = context;

  const parsed = getRequestBody(request);
  if ("error" in parsed) return parsed.error;

  const taskId = parsed.body?.taskId as string | undefined;
  if (!taskId) return errorResponse("taskId is required");

  const conversationId: string = context.conversation_id ?? "";
  const store = context.store ?? null;

  // 1. Try reading from the store
  if (store && conversationId) {
    try {
      const messages: StoreMessage[] = await store.getMessages({
        conversationId,
        limit: 100,
        order: "desc",
      });

      for (const item of messages) {
        const meta = item.metadata ?? {};
        if (meta.app !== APP_NAME) continue;
        if (meta.kind !== ARTIFACTS_KIND) continue;
        if (meta.taskId !== taskId) continue;

        const artifacts = item.content as AnalysisArtifacts | null;
        if (!artifacts || artifacts.kind !== "csv_analysis_artifacts") continue;

        return jsonResponse(artifacts);
      }
    } catch (err) {
      console.warn(
        "[history/detail] store read failed:",
        err instanceof Error ? err.message : String(err),
      );
    }
  }

  // 2. Fallback: build from live session + disk files
  const session = getSession(taskId);
  if (session && (session.status === "done" || session.status === "error")) {
    try {
      const artifacts = await buildArtifactsFromSession(session);
      if (artifacts) return jsonResponse(artifacts);
    } catch (err) {
      console.warn(
        "[history/detail] session fallback failed:",
        err instanceof Error ? err.message : String(err),
      );
    }
  }

  return errorResponse("artifacts not found for this taskId", 404);
}

/**
 * Build artifacts from a live session's disk files (no store required)
 */
async function buildArtifactsFromSession(
  session: Session,
): Promise<AnalysisArtifacts | null> {
  const events = session.events ?? [];

  // Extract charts and insights
  const charts = extractChartsFromEvents(events);
  if (charts.length === 0) return null;

  const insights = extractInsightsFromEvents(events);

  // Load SVGs and report in parallel
  const [svgs, reportHtml] = await Promise.all([
    loadChartSvgs(session.outDir, charts),
    loadReportHtml(session.outDir),
  ]);

  // Get cost and duration from the done event
  const doneEvt = events.find((e) => e.type === "done");
  const cost = doneEvt?.type === "done"
    ? doneEvt.cost
    : { total: 0 };
  const durationMs = doneEvt?.type === "done" ? doneEvt.durationMs : 0;

  return {
    kind: "csv_analysis_artifacts",
    version: 1,
    taskId: session.id,
    csvName: session.csvName,
    profile: session.profile,
    charts,
    insights,
    svgs,
    reportHtml,
    cost,
    durationMs,
    createdAt: session.createdAt,
  };
}
