/**
 * POST /upload — File upload handler
 *
 * EdgeOne Pages Functions provides context.request.body as a raw Buffer for multipart requests;
 * manual parsing is required.
 */
import path from "node:path";
import { mkdir, writeFile } from "node:fs/promises";
import {
  getWorkRoot,
  ensureWorkspace,
  generateTaskId,
  setSession,
  sanitizeProfile,
  type Session,
} from "../_lib/session.js";
import { jsonResponse, errorResponse } from "../_lib/handlers.js";
import { loadCsv, computeProfile } from "../_lib/tools/shared/csv-stats.js";
import { computeColumnDistributions } from "../_lib/column-distribution.js";
import { parseMultipart } from "../_lib/multipart.js";
import { appendAnalysisHistory } from "../_lib/history.js";

export async function onRequest(context: any) {
  const { request } = context;
  const contentType = request.headers?.["content-type"] ?? "";

  if (!contentType.includes("multipart/form-data")) {
    return errorResponse("Content-Type must be multipart/form-data");
  }

  const body = request.body;
  if (!body || !Buffer.isBuffer(body)) {
    return errorResponse("no file body received");
  }

  let parsed;
  try {
    parsed = parseMultipart(body, contentType);
  } catch (e) {
    return errorResponse(`multipart parse error: ${e instanceof Error ? e.message : String(e)}`);
  }

  const file = parsed.files.find((f) => f.fieldName === "file");
  if (!file) {
    return errorResponse("no file");
  }

  if (!file.fileName.toLowerCase().endsWith(".csv")) {
    return errorResponse("Only .csv files are supported");
  }

  try {
    await ensureWorkspace();
    const taskId = generateTaskId();
    const WORK_ROOT = getWorkRoot();
    const safeName = file.fileName.replace(/[^a-zA-Z0-9._-]+/g, "_");
    const csvPath = path.join(WORK_ROOT, `${taskId}__${safeName}`);
    const outDir = path.join(WORK_ROOT, taskId);
    await mkdir(path.join(outDir, "charts"), { recursive: true });

    await writeFile(csvPath, file.data);

    const { rows, totalRows, sampledRows } = await loadCsv(csvPath);
    const profile = computeProfile(rows, csvPath, totalRows, sampledRows);
    const distributions = computeColumnDistributions(rows, profile);

    const session: Session = {
      id: taskId,
      csvPath,
      csvName: file.fileName,
      csvSize: file.data.length,
      outDir,
      createdAt: Date.now(),
      lastAccessed: Date.now(),
      status: "uploaded",
      profile,
      rows,
      distributions,
      events: [],
    };
    setSession(taskId, session);
    await appendAnalysisHistory(context, session, { status: "uploaded" });

    return jsonResponse({
      taskId,
      csvName: file.fileName,
      size: file.data.length,
      profile: sanitizeProfile(profile),
      distributions,
    });
  } catch (err) {
    return errorResponse(
      err instanceof Error ? err.message : String(err),
    );
  }
}
