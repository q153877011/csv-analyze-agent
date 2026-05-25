/**
 * AgentEvent: Event protocol shared between frontend and backend.
 *
 * The backend emits these events via the analyze() onEvent callback;
 * the HTTP server pushes them to the browser as SSE;
 * the frontend useAgentStream hook consumes them to drive the UI.
 */
import type { ChartMeta, Insight } from "./types.js";

export type AgentRole = "chart" | "insight";

export type AgentState = "running" | "done" | "skipped";

export type ToolState = "running" | "done" | "failed";

/** session: sent once when the task starts; contains static metadata */
export interface SessionEvent {
  type: "session";
  taskId: string;
  model: string;
  startedAt: string;
  csvName: string;
  profileAvailable: boolean;
}

export interface AgentEventMsg {
  type: "agent";
  role: AgentRole;
  state: AgentState;
}

export interface ToolEvent {
  type: "tool";
  id: string;
  name: string;
  agent: AgentRole;
  state: ToolState;
  durationMs?: number;
  argsSummary?: string;
  resultSummary?: string;
  error?: string;
}

export interface ChartEvent {
  type: "chart";
  chart: ChartMeta;
}

export interface InsightEvent {
  type: "insight";
  insight: Insight;
}

export interface CostEvent {
  type: "cost";
  chart?: number;
  insight?: number;
  total: number;
  durationMs: number;
}

export interface DoneEvent {
  type: "done";
  taskId: string;
  reports: {
    charts: string;
    insight?: string;
    merged: string;
    html?: string;
  };
  charts: number;
  insights: number;
  cost: { chart?: number; insight?: number; total: number };
  durationMs: number;
}

export interface ErrorEvent {
  type: "error";
  message: string;
  role?: AgentRole;
}

export type AgentEvent =
  | SessionEvent
  | AgentEventMsg
  | ToolEvent
  | ChartEvent
  | InsightEvent
  | CostEvent
  | DoneEvent
  | ErrorEvent;

/** Signature for in-process event callbacks */
export type EventEmitter = (event: AgentEvent) => void;
