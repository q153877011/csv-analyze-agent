/**
 * POST /analyze/download — Download report
 *
 * body: { taskId, kind: "charts"|"insight"|"merged"|"html" }
 */
import path from "node:path";
import { readFile } from "node:fs/promises";
import { errorResponse, getAndTouchSession, getRequestBody } from "../_lib/handlers.js";

const KIND_MAP: Record<string, { file: string; mime: string }> = {
  charts: { file: "charts.md", mime: "text/markdown; charset=utf-8" },
  insight: { file: "insight.md", mime: "text/markdown; charset=utf-8" },
  merged: { file: "report.md", mime: "text/markdown; charset=utf-8" },
  html: { file: "report.html", mime: "text/html; charset=utf-8" },
};

export async function onRequest(context: any) {
  const { request } = context;

  const parsed = getRequestBody(request);
  if ("error" in parsed) return parsed.error;
  const { taskId, kind } = parsed.body ?? {};

  if (!taskId || !kind) {
    return errorResponse("taskId and kind are required");
  }

  const sessionOrError = getAndTouchSession(taskId);
  if (sessionOrError instanceof Response) return sessionOrError;
  const s = sessionOrError;

  const entry = KIND_MAP[kind];
  if (!entry) return errorResponse("bad kind");

  const abs = path.join(s.outDir, entry.file);
  try {
    const content = await readFile(abs, "utf-8");
    const basename = path.basename(s.csvName, ".csv");
    return new Response(content, {
      status: 200,
      headers: {
        "Content-Type": entry.mime,
        "Content-Disposition": `attachment; filename="${basename}-${entry.file}"`,
      },
    });
  } catch {
    return new Response("file not found", { status: 404 });
  }
}
