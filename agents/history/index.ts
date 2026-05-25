/**
 * POST /history — Fetch analysis history
 *
 * Reads the current conversation's analysis records from context.store,
 * deduplicates by taskId keeping the latest state, and marks each as restorable.
 */
import { getSession } from "../_lib/session.js";
import { jsonResponse } from "../_lib/handlers.js";
import {
  APP_NAME,
  RECORD_KIND,
  type CsvAnalysisHistoryRecord,
} from "../_lib/history.js";

interface StoreMessage {
  messageId?: string;
  role?: string;
  content?: unknown;
  createdAt?: number;
  metadata?: Record<string, unknown>;
}

export type HistoryRecordWithRestore = CsvAnalysisHistoryRecord & {
  restorable: boolean;
};

export async function onRequest(context: any) {
  const conversationId: string = context.conversation_id ?? "";
  const store = context.store ?? null;

  console.log(`[history] GET conversationId=${conversationId || "(empty)"} store=${store ? "ok" : "null"}`);

  if (!store || !conversationId) {
    return jsonResponse({ conversation_id: conversationId, records: [] });
  }

  let messages: StoreMessage[];
  try {
    messages = await store.getMessages({
      conversationId,
      limit: 100,
      order: "asc",
    });
    console.log(`[history] getMessages returned ${messages.length} items`);
  } catch (err) {
    console.warn(
      "[history] getMessages failed:",
      err instanceof Error ? err.message : String(err),
    );
    return jsonResponse({ conversation_id: conversationId, records: [] });
  }

  // Deduplicate by taskId, keeping the entry with the highest updatedAt
  const latest = new Map<string, CsvAnalysisHistoryRecord>();

  for (const item of messages) {
    const meta = item.metadata ?? {};
    if (meta.app !== APP_NAME) continue;
    if (meta.kind !== RECORD_KIND) continue;

    const record = item.content as CsvAnalysisHistoryRecord | null;
    if (!record?.taskId) continue;
    if (record.kind !== "csv_analysis") continue;

    const prev = latest.get(record.taskId);
    if (!prev || record.updatedAt >= prev.updatedAt) {
      latest.set(record.taskId, record);
    }
  }

  // Sort by updatedAt descending and annotate restorable
  const records: HistoryRecordWithRestore[] = [...latest.values()]
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .map((record) => ({
      ...record,
      // done/deleted: artifacts can be loaded from store; running/uploaded: requires a live session
      restorable:
        record.status === "done" ||
        record.status === "deleted" ||
        Boolean(getSession(record.taskId)),
    }));

  return jsonResponse({ conversation_id: conversationId, records });
}
