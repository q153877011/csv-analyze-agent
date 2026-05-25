/**
 * POST /analyze/rerun-insights — Reuse existing charts, re-run the Insight Agent only
 */
import { dispatch } from "../_lib/session.js";
import { jsonResponse, errorResponse, getAndTouchSession, getRequestBody } from "../_lib/handlers.js";
import { analyze } from "../_lib/analyze.js";
import { appendAnalysisHistory, buildDonePatch, buildErrorPatch } from "../_lib/history.js";

export async function onRequest(context: any) {
  const { request } = context;

  const parsed = getRequestBody(request);
  if ("error" in parsed) return parsed.error;
  const { body } = parsed;

  const taskId = body?.taskId as string | undefined;
  if (!taskId) return errorResponse("taskId is required");

  const sessionOrError = getAndTouchSession(taskId);
  if (sessionOrError instanceof Response) return sessionOrError;
  const s = sessionOrError;

  if (s.status === "running") {
    return errorResponse("a run is already in progress", 409);
  }
  if (s.status === "uploaded") {
    return errorResponse("run /analyze (action=start) first to generate charts");
  }

  const model = typeof body?.model === "string" ? body.model : undefined;
  const demoMode = Boolean(body?.demoMode ?? true);
  s.status = "running";
  s.abort = new AbortController();
  s.events = s.events.filter(
    (e) => e.type !== "insight" && e.type !== "cost" && e.type !== "done",
  );

  await appendAnalysisHistory(context, s, { status: "running" });

  const t0 = Date.now();

  s.runPromise = analyze({
    csvPath: s.csvPath,
    outDir: s.outDir,
    model,
    demoMode,
    taskId: s.id,
    onEvent: (evt) => dispatch(s, evt),
    prewarmedProfile: s.profile,
    prewarmedRows: s.rows,
    insightsOnly: true,
    signal: s.abort.signal,
  })
    .then(async () => {
      s.status = "done";
      try {
        await appendAnalysisHistory(context, s, buildDonePatch(s, Date.now() - t0));
      } catch {
        // context may have expired
      }
    })
    .catch((err) => {
      s.status = "error";
      const patch = buildErrorPatch(err, Date.now() - t0);
      dispatch(s, { type: "error", message: patch.error! });
      if (!s.abort?.signal.aborted) {
        void appendAnalysisHistory(context, s, patch);
      }
    })
    .finally(() => {
      s.rows = [];
    });

  return jsonResponse({ ok: true, taskId: s.id, status: s.status });
}
