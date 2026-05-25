/**
 * Session management: in-memory + disk.
 * EdgeOne Pages Functions share a single process, so in-memory sessions are valid within the same instance.
 */
import crypto from "node:crypto";
import path from "node:path";
import os from "node:os";
import { mkdir, unlink, rm } from "node:fs/promises";
import type { AgentEvent } from "./events.js";
import type { CsvProfile } from "./types.js";
import type { ColumnDistribution } from "./column-distribution.js";

const WORK_ROOT = path.resolve(
  process.env.WORK_ROOT ?? path.join(os.tmpdir(), "csv-analyze-sessions"),
);
const SESSION_TTL_MS = Number(process.env.SESSION_TTL_MS ?? 24 * 60 * 60 * 1000);
const SWEEP_INTERVAL_MS = 60 * 60 * 1000;
const MAX_SESSIONS = 200;

export interface Session {
  id: string;
  csvPath: string;
  csvName: string;
  csvSize: number;
  outDir: string;
  createdAt: number;
  lastAccessed: number;
  status: "uploaded" | "running" | "done" | "error";
  profile: CsvProfile;
  rows: Record<string, unknown>[];
  distributions: ColumnDistribution[];
  events: AgentEvent[];
  runPromise?: Promise<unknown>;
  abort?: AbortController;
}

const sessions = new Map<string, Session>();

export function getSession(id: string): Session | undefined {
  return sessions.get(id);
}

export function setSession(id: string, session: Session): void {
  sessions.set(id, session);
}

export function touchSession(s: Session): void {
  s.lastAccessed = Date.now();
}

export function generateTaskId(): string {
  return "t_" + crypto.randomBytes(6).toString("hex");
}

export function getWorkRoot(): string {
  return WORK_ROOT;
}

export async function ensureWorkspace(): Promise<void> {
  await mkdir(WORK_ROOT, { recursive: true });
}

export async function destroySession(s: Session): Promise<void> {
  try {
    s.abort?.abort();
  } catch {
    /* ignore */
  }
  sessions.delete(s.id);
  await Promise.allSettled([
    unlink(s.csvPath),
    rm(s.outDir, { recursive: true, force: true }),
  ]);
}

export function sanitizeProfile(p: CsvProfile): CsvProfile {
  return { ...p, csvPath: path.basename(p.csvPath) };
}

export function formatSse(evt: AgentEvent): string {
  return `event: ${evt.type}\ndata: ${JSON.stringify(evt)}\n\n`;
}

export function dispatch(session: Session, evt: AgentEvent): void {
  if (evt.type === "chart") {
    const withUrl: AgentEvent = {
      ...evt,
      chart: {
        ...evt.chart,
        svgUrl: `${session.id}/${evt.chart.relPath}`,
      },
    };
    session.events.push(withUrl);
    return;
  }
  session.events.push(evt);
}

// Auto-start sweeper on first import (idempotent via guard)
let sweeperStarted = false;
function initSweeper(): void {
  if (sweeperStarted) return;
  sweeperStarted = true;
  setInterval(() => {
    const now = Date.now();
    const victims: Session[] = [];
    for (const s of sessions.values()) {
      if (now - s.lastAccessed > SESSION_TTL_MS && s.status !== "running") {
        victims.push(s);
      }
    }
    if (sessions.size > MAX_SESSIONS) {
      const sorted = [...sessions.values()]
        .filter((s) => s.status !== "running")
        .sort((a, b) => a.lastAccessed - b.lastAccessed);
      const extra = sessions.size - MAX_SESSIONS;
      victims.push(...sorted.slice(0, extra));
    }
    for (const s of victims) {
      void destroySession(s);
    }
  }, SWEEP_INTERVAL_MS).unref();
}

// Start sweeper on module load — no need for callers to invoke manually
initSweeper();
