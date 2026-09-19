import type { Database } from "bun:sqlite";
import { searchChunkVectors } from "./vectors.ts";

export interface EmailSearchResult {
  chunkId: number;
  providerMessageId: string;
  providerThreadId: string;
  sender: string;
  recipients: string[];
  subject: string;
  sentAt?: string;
  internalDateMs: number;
  text: string;
  score: number;
}

function ftsQuery(input: string): string {
  const stopWords = new Set(["a", "an", "and", "did", "do", "for", "i", "in", "is", "me", "my", "of", "the", "to", "was", "what", "who"]);
  const tokens = (input.normalize("NFKC").match(/[\p{L}\p{N}_@.-]+/gu) ?? [])
    .filter((token) => !stopWords.has(token.toLowerCase()));
  return tokens.slice(0, 16).map((token) => `"${token.replaceAll('"', '""')}"`).join(" OR ");
}

export function searchEmail(db: Database, userId: string, query: string, limit = 8): EmailSearchResult[] {
  const match = ftsQuery(query);
  if (!match) return [];
  const safeLimit = Math.max(1, Math.min(25, Math.trunc(limit)));
  const rows = db.query(`
    SELECT
      c.id AS chunk_id,
      e.provider_message_id,
      e.provider_thread_id,
      e.sender,
      e.recipients_json,
      e.subject,
      e.sent_at,
      e.internal_date_ms,
      c.text,
      bm25(chunks_fts, 0.0, 1.0, 2.0, 1.5) AS score
    FROM chunks_fts
    JOIN chunks c ON c.id = chunks_fts.chunk_id
    JOIN email_messages e ON e.id = c.email_message_id
    WHERE chunks_fts MATCH ? AND e.user_id = ?
    ORDER BY score, e.internal_date_ms DESC
    LIMIT ?
  `).all(match, userId, safeLimit) as Array<{
    chunk_id: number;
    provider_message_id: string;
    provider_thread_id: string;
    sender: string;
    recipients_json: string;
    subject: string;
    sent_at: string | null;
    internal_date_ms: number;
    text: string;
    score: number;
  }>;

  return rows.map((row) => ({
    chunkId: row.chunk_id,
    providerMessageId: row.provider_message_id,
    providerThreadId: row.provider_thread_id,
    sender: row.sender,
    recipients: JSON.parse(row.recipients_json) as string[],
    subject: row.subject,
    sentAt: row.sent_at ?? undefined,
    internalDateMs: row.internal_date_ms,
    text: row.text,
    score: row.score,
  }));
}

export function getThread(db: Database, userId: string, providerThreadId: string): ArchivedThreadMessage[] {
  const rows = db.query(`
    SELECT provider_message_id, sender, recipients_json, subject, sent_at,
      internal_date_ms, normalized_body
    FROM email_messages
    WHERE user_id = ? AND provider_thread_id = ?
    ORDER BY internal_date_ms
  `).all(userId, providerThreadId) as Array<{
    provider_message_id: string;
    sender: string;
    recipients_json: string;
    subject: string;
    sent_at: string | null;
    internal_date_ms: number;
    normalized_body: string;
  }>;
  return rows.map((row) => ({
    providerMessageId: row.provider_message_id,
    sender: row.sender,
    recipients: JSON.parse(row.recipients_json) as string[],
    subject: row.subject,
    sentAt: row.sent_at ?? undefined,
    internalDateMs: row.internal_date_ms,
    body: row.normalized_body,
  }));
}

export interface HybridEmailSearchResult extends EmailSearchResult {
  retrieval: "keyword" | "vector" | "both";
  rankScore: number;
}

function chunksById(db: Database, userId: string, chunkIds: number[]): Map<number, EmailSearchResult> {
  if (chunkIds.length === 0) return new Map();
  const placeholders = chunkIds.map(() => "?").join(", ");
  const rows = db.query(`
    SELECT c.id AS chunk_id, e.provider_message_id, e.provider_thread_id,
      e.sender, e.recipients_json, e.subject, e.sent_at, e.internal_date_ms, c.text
    FROM chunks c JOIN email_messages e ON e.id = c.email_message_id
    WHERE e.user_id = ? AND c.id IN (${placeholders})
  `).all(userId, ...chunkIds) as Array<{
    chunk_id: number;
    provider_message_id: string;
    provider_thread_id: string;
    sender: string;
    recipients_json: string;
    subject: string;
    sent_at: string | null;
    internal_date_ms: number;
    text: string;
  }>;
  return new Map(rows.map((row) => [row.chunk_id, {
    chunkId: row.chunk_id,
    providerMessageId: row.provider_message_id,
    providerThreadId: row.provider_thread_id,
    sender: row.sender,
    recipients: JSON.parse(row.recipients_json) as string[],
    subject: row.subject,
    sentAt: row.sent_at ?? undefined,
    internalDateMs: row.internal_date_ms,
    text: row.text,
    score: 0,
  }]));
}

export function searchEmailHybrid(
  db: Database,
  userId: string,
  query: string,
  queryEmbedding?: readonly number[],
  limit = 8,
): HybridEmailSearchResult[] {
  const candidateLimit = Math.max(1, Math.min(25, Math.trunc(limit) * 2));
  const keyword = searchEmail(db, userId, query, candidateLimit);
  const vector = queryEmbedding ? searchChunkVectors(db, queryEmbedding, Math.min(100, candidateLimit * 4)) : [];
  const vectorRows = chunksById(db, userId, vector.map((item) => item.chunkId));
  const fused = new Map<number, HybridEmailSearchResult>();

  keyword.forEach((item, rank) => fused.set(item.chunkId, {
    ...item,
    retrieval: "keyword",
    rankScore: 1 / (60 + rank + 1),
  }));
  vector.forEach((item, rank) => {
    if (!vectorRows.has(item.chunkId)) return;
    const existing = fused.get(item.chunkId);
    if (existing) {
      existing.retrieval = "both";
      existing.rankScore += 1 / (60 + rank + 1);
      return;
    }
    const row = vectorRows.get(item.chunkId);
    if (row) fused.set(item.chunkId, {
      ...row,
      score: item.distance,
      retrieval: "vector",
      rankScore: 1 / (60 + rank + 1),
    });
  });

  return [...fused.values()]
    .sort((a, b) => b.rankScore - a.rankScore || b.internalDateMs - a.internalDateMs)
    .slice(0, Math.max(1, Math.min(25, Math.trunc(limit))));
}

export interface ArchivedThreadMessage {
  providerMessageId: string;
  sender: string;
  recipients: string[];
  subject: string;
  sentAt?: string;
  internalDateMs: number;
  body: string;
}
