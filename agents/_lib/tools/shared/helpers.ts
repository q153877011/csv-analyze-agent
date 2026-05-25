/**
 * Common tool helpers: textResult / errorResult
 */

export function textResult(payload: unknown) {
  const text =
    typeof payload === "string" ? payload : JSON.stringify(payload);
  return {
    content: [{ type: "text" as const, text }],
  };
}

export function errorResult(message: string) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify({ ok: false, error: message }) }],
    isError: true,
  };
}
