/**
 * Frontend event types, mirroring agents/src/events.ts.
 * This file is the sole frontend copy of the frontend-backend "interface contract" — if backend changes, this must be synced.
 */
import type { ChartMeta, Insight } from "../types";

export type AgentRole = "chart" | "insight";
export type AgentState = "running" | "done" | "skipped";
export type ToolState = "running" | "done" | "failed";

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
