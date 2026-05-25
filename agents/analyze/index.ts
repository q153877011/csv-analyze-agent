/**
 * /analyze — Main route (unified POST)
 *
 * POST body.action="get"|"start"|"cancel"|"delete"
 */
import { getSession, destroySession, sanitizeProfile, dispatch } from "../_lib/session.js";
import { jsonResponse, errorResponse, getAndTouchSession, getRequestBody } from "../_lib/handlers.js";
import { analyze } from "../_lib/analyze.js";
import { appendAnalysisHistory, buildDonePatch, buildErrorPatch, persistAnalysisArtifacts } from "../_lib/history.js";

type Action = "get" | "start" | "cancel" | "delete";

export async function onRequest(context: any) {
  const { request } = context;

  const parsed = getRequestBody(request);
  if ("error" in parsed) return parsed.error;
  const { body } = parsed;

  const taskId = body?.taskId as string | undefined;
  const action = body?.action as Action | undefined;

  if (!taskId) return errorResponse("taskId is required");

  switch (action) {
    case "get": return handleGet(taskId);
    case "start": return handleStart(context, taskId, body);
    case "cancel": return handleCancel(context, taskId);
    case "delete": return handleDelete(context, taskId);
    default: return errorResponse(`unknown action: ${action}`);
  }
}

function handleGet(taskId: string): Response {
  const sessionOrError = getAndTouchSession(taskId);
  if (sessionOrError instanceof Response) return sessionOrError;
  const s = sessionOrError;

  return jsonResponse({
    taskId: s.id,
    status: s.status,
    csvName: s.csvName,
    size: s.csvSize,
    createdAt: s.createdAt,
    profile: sanitizeProfile(s.profile),
    distributions: s.distributions,
    events: s.events,
  });
}

async function handleStart(context: any, taskId: string, body: any): Promise<Response> {
  const sessionOrError = getAndTouchSession(taskId);
  if (sessionOrError instanceof Response) return sessionOrError;
  const s = sessionOrError;

  if (s.status !== "uploaded") {
    return jsonResponse({ ok: true, taskId: s.id, status: s.status });
  }

  const chartsOnly = Boolean(body?.chartsOnly ?? false);
  const demoMode = Boolean(body?.demoMode ?? false);
  const model = typeof body?.model === "string" ? body.model : undefined;

  s.status = "running";
  s.abort = new AbortController();

  await appendAnalysisHistory(context, s, { status: "running" });

  const t0 = Date.now();

  s.runPromise = analyze({
    csvPath: s.csvPath,
    outDir: s.outDir,
    chartsOnly,
    demoMode,
    model,
    taskId: s.id,
    onEvent: (evt) => dispatch(s, evt),
    prewarmedProfile: s.profile,
    prewarmedRows: s.rows,
    signal: s.abort.signal,
  })
    .then(async () => {
      s.status = "done";
      const elapsed = Date.now() - t0;
      const patch = buildDonePatch(s, elapsed);
      // Attempt to persist (context may become invalid after the response; best-effort only)
      try {
        await appendAnalysisHistory(context, s, patch);
        await persistAnalysisArtifacts(context, s, patch.cost ?? { total: 0 }, elapsed);
      } catch {
        // If context has expired, handleDelete will backfill on the next request
      }
    })
    .catch((err) => {
      s.status = "error";
      const patch = buildErrorPatch(err, Date.now() - t0);
      dispatch(s, { type: "error", message: patch.error! });
      // If the abort signal fired, the user already cancelled — keep
      // the "cancelled" snapshot instead of overwriting it with "error".
      if (!s.abort?.signal.aborted) {
        void appendAnalysisHistory(context, s, patch);
      }
    })
    .finally(() => {
      s.rows = [];
    });

  return jsonResponse({ ok: true, taskId: s.id, status: s.status });
}

async function handleCancel(context: any, taskId: string): Promise<Response> {
  const sessionOrError = getAndTouchSession(taskId);
  if (sessionOrError instanceof Response) return sessionOrError;
  const s = sessionOrError;

  if (s.status !== "running") {
    return jsonResponse({ ok: true, status: s.status });
  }
  try { s.abort?.abort(); } catch { /* ignore */ }
  await appendAnalysisHistory(context, s, { status: "cancelled" });
  return jsonResponse({ ok: true, status: "cancelling" });
}

async function handleDelete(context: any, taskId: string): Promise<Response> {
  const s = getSession(taskId);
  if (!s) return jsonResponse({ ok: true, existed: false });
  // Carry forward summary fields (charts/insights/cost/reports) so the
  // deleted snapshot still shows what was accomplished before deletion.
  const summary = buildDonePatch(s, 0);

  // Before destroying the session, ensure full artifacts are persisted to the store
  // (here we have a valid request context, unlike the .then() background callback)
  if (s.status === "done") {
    const doneEvt = s.events.find((e) => e.type === "done");
    const cost = doneEvt?.type === "done" ? doneEvt.cost : { total: 0 };
    const durationMs = doneEvt?.type === "done" ? doneEvt.durationMs : 0;
    await persistAnalysisArtifacts(context, s, cost, durationMs);
  }

  await appendAnalysisHistory(context, s, { ...summary, status: "deleted" });
  await destroySession(s);
  return jsonResponse({ ok: true, existed: true });
}
