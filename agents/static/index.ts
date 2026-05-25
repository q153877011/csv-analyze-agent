/**
 * POST /static — Serve static files from a session's outDir
 *
 * body: { taskId, path: "charts/chart-1.svg" }
 */
import path from "node:path";
import { readFile } from "node:fs/promises";
import { errorResponse, getAndTouchSession, getRequestBody } from "../_lib/handlers.js";

const MIME_MAP: Record<string, string> = {
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".json": "application/json",
  ".html": "text/html",
  ".md": "text/markdown",
};

export async function onRequest(context: any) {
  const { request } = context;

  const parsed = getRequestBody(request);
  if ("error" in parsed) return parsed.error;
  const { taskId, path: filePath } = parsed.body ?? {};

  if (!taskId || !filePath) {
    return errorResponse("taskId and path are required");
  }

  const sessionOrError = getAndTouchSession(taskId);
  if (sessionOrError instanceof Response) return sessionOrError;
  const s = sessionOrError;

  // Path traversal guard
  const abs = path.resolve(s.outDir, filePath);
  const within = path.relative(s.outDir, abs);
  if (within.startsWith("..") || path.isAbsolute(within)) {
    return errorResponse("bad path");
  }

  try {
    const content = await readFile(abs);
    const ext = path.extname(abs).toLowerCase();
    const mime = MIME_MAP[ext] ?? "application/octet-stream";
    return new Response(content, {
      status: 200,
      headers: { "Content-Type": mime },
    });
  } catch {
    return new Response("file not found", { status: 404 });
  }
}
