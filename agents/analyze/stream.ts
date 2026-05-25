/**
 * POST /analyze/stream — SSE stream
 *
 * EdgeOne runtime does not pass query params, so the frontend initiates SSE via POST + body {taskId}.
 */
import { formatSse } from "../_lib/session.js";
import { errorResponse, getAndTouchSession, getRequestBody } from "../_lib/handlers.js";

const HEARTBEAT_INTERVAL_MS = 15_000;
const POLL_INTERVAL_MS = 100;

export async function onRequest(context: any) {
  const { request } = context;

  const parsed = getRequestBody(request);
  if ("error" in parsed) return parsed.error;
  const taskId = parsed.body?.taskId as string | undefined;

  const sessionOrError = getAndTouchSession(taskId ?? null);
  if (sessionOrError instanceof Response) return sessionOrError;
  const s = sessionOrError;

  const encoder = new TextEncoder();
  let closed = false;
  let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  let pollTimer: ReturnType<typeof setInterval> | null = null;
  let checkDoneTimer: ReturnType<typeof setInterval> | null = null;

  function cleanup() {
    closed = true;
    if (heartbeatTimer) clearInterval(heartbeatTimer);
    if (pollTimer) clearInterval(pollTimer);
    if (checkDoneTimer) clearInterval(checkDoneTimer);
    heartbeatTimer = pollTimer = checkDoneTimer = null;
  }

  const stream = new ReadableStream({
    start(controller) {
      for (const evt of s.events) {
        controller.enqueue(encoder.encode(formatSse(evt)));
      }

      let lastIdx = s.events.length;

      pollTimer = setInterval(() => {
        if (closed) return;
        while (lastIdx < s.events.length) {
          controller.enqueue(encoder.encode(formatSse(s.events[lastIdx]!)));
          lastIdx++;
        }
      }, POLL_INTERVAL_MS);

      heartbeatTimer = setInterval(() => {
        if (!closed) {
          controller.enqueue(encoder.encode(`: keepalive\n\n`));
        }
      }, HEARTBEAT_INTERVAL_MS);

      checkDoneTimer = setInterval(() => {
        if ((s.status === "done" || s.status === "error") && lastIdx >= s.events.length) {
          cleanup();
          setTimeout(() => controller.close(), 300);
        }
      }, 500);
    },
    cancel() {
      cleanup();
    },
  });

  return new Response(stream, {
    status: 200,
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      "Connection": "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
