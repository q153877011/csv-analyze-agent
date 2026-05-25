/**
 * AI Gateway configuration.
 *
 * Claude Agent SDK subprocesses still read Anthropic protocol env vars,
 * so we map AI_GATEWAY_* to ANTHROPIC_* for the SDK.
 */
import "dotenv/config";

export const CLAUDE_MODEL = process.env.AI_GATEWAY_MODEL || "@Pages/hy3-preview";

export function collectGatewayEnv(): Record<string, string> {
  const env: Record<string, string> = {};
  const baseUrl = process.env.AI_GATEWAY_BASE_URL;
  const apiKey = process.env.AI_GATEWAY_API_KEY;
  const smallModel = process.env.AI_GATEWAY_SMALL_MODEL || CLAUDE_MODEL;

  if (baseUrl) env.ANTHROPIC_BASE_URL = baseUrl;
  if (apiKey) env.ANTHROPIC_API_KEY = apiKey;
  if (smallModel) env.ANTHROPIC_SMALL_FAST_MODEL = smallModel;
  if (process.env.ANTHROPIC_CUSTOM_HEADERS) {
    env.ANTHROPIC_CUSTOM_HEADERS = process.env.ANTHROPIC_CUSTOM_HEADERS;
  }

  return env;
}

export function resolveModelName(explicit?: string): string {
  return explicit || CLAUDE_MODEL;
}
