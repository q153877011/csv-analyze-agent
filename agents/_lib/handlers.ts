/**
 * Route handler common utilities.
 */
import type { Session } from "./session.js";
import { getSession, touchSession } from "./session.js";

const JSON_HEADERS = { "Content-Type": "application/json" } as const;

/** Build a JSON response */
export function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), { status, headers: JSON_HEADERS });
}

/** Build an error JSON response */
export function errorResponse(error: string, status = 400): Response {
  return jsonResponse({ error }, status);
}

/** Get and touch a session; returns a 404 Response if not found */
export function getAndTouchSession(
  taskId: string | null,
): Session | Response {
  if (!taskId) {
    return errorResponse("taskId is required", 400);
  }
  const s = getSession(taskId);
  if (!s) {
    return errorResponse("session not found", 404);
  }
  touchSession(s);
  return s;
}

/**
 * Get the body from an EdgeOne context.request.
 * EdgeOne runtime auto-parses JSON content-type into an object, so we can take it directly.
 */
export function getRequestBody(
  request: any,
): { body: any } | { error: Response } {
  const body = request.body;
  if (body === undefined || body === null) {
    return { error: errorResponse("request body is empty") };
  }
  return { body };
}

