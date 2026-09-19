import type { Database } from "bun:sqlite";
import { createHash } from "node:crypto";

export type MemoryKind = "preference" | "person" | "plan" | "commitment" | "episode";
export type MemoryOrigin = "user-stated" | "email-extracted";
export type MemoryStatus = "active" | "superseded" | "forgotten";

export interface EvidenceReference {
  type: "email" | "chat";
  id: string;
}

export interface MemoryRecord {
  id: number;
  userId: string;
  kind: MemoryKind;
  claim: string;
  fingerprint: string;
  evidence: EvidenceReference[];
  origin: MemoryOrigin;
  recordedAt: string;
  eventAt?: string;
  status: MemoryStatus;
  supersedesId?: number;
}

export interface CreateMemoryInput {
  kind: MemoryKind;
  claim: string;
  evidence?: EvidenceReference[];
  origin: MemoryOrigin;
  eventAt?: string;
  supersedesId?: number;
}

export interface CreateMemoryResult {
  memory?: MemoryRecord;
  suppressed: boolean;
}

function normalizedClaim(claim: string): string {
  return claim.normalize("NFKC").trim().replace(/\s+/g, " ");
}

export function memoryFingerprint(claim: string, evidence: EvidenceReference[] = []): string {
  const sources = evidence
    .map((item) => `${item.type}:${item.id}`)
    .sort()
    .join("|");
  return createHash("sha256").update(`${normalizedClaim(claim).toLowerCase()}\n${sources}`).digest("hex");
}

function toRecord(row: {
  id: number;
  user_id: string;
  kind: MemoryKind;
  claim: string;
  fingerprint: string;
  evidence_json: string;
  origin: MemoryOrigin;
  recorded_at: string;
  event_at: string | null;
  status: MemoryStatus;
  supersedes_id: number | null;
}): MemoryRecord {
  return {
    id: row.id,
    userId: row.user_id,
    kind: row.kind,
    claim: row.claim,
    fingerprint: row.fingerprint,
    evidence: JSON.parse(row.evidence_json) as EvidenceReference[],
    origin: row.origin,
    recordedAt: row.recorded_at,
    eventAt: row.event_at ?? undefined,
    status: row.status,
    supersedesId: row.supersedes_id ?? undefined,
  };
}

function validateEvidenceOwnership(
  db: Database,
  userId: string,
  evidence: EvidenceReference[],
): void {
  for (const item of evidence) {
    const table = item.type === "email" ? "email_messages" : "chat_messages";
    const row = db.query(
      `SELECT 1 AS present FROM ${table} WHERE user_id = ? AND provider_message_id = ?`,
    ).get(userId, item.id);
    if (!row) throw new Error(`Evidence ${item.type}:${item.id} does not belong to this user`);
  }
}

export function createMemory(db: Database, userId: string, input: CreateMemoryInput): CreateMemoryResult {
  const claim = normalizedClaim(input.claim);
  if (!claim) throw new Error("Memory claim is required");
  if (
    input.origin === "email-extracted" &&
    /\b(password|passcode|one[- ]time (?:code|password)|otp|verification code|authentication code|2fa code)\b/i.test(claim)
  ) {
    throw new Error("Credential-like email content cannot be extracted into memory");
  }
  const evidence = input.evidence ?? [];
  validateEvidenceOwnership(db, userId, evidence);
  const fingerprint = memoryFingerprint(claim, evidence);
  if (input.origin === "email-extracted") {
    const suppression = db.query(
      "SELECT 1 FROM memory_suppressions WHERE user_id = ? AND fingerprint = ?",
    ).get(userId, fingerprint);
    if (suppression) return { suppressed: true };
  }

  return db.transaction(() => {
    const existing = db.query(`
      SELECT * FROM memories WHERE user_id = ? AND fingerprint = ? AND origin = ?
    `).get(userId, fingerprint, input.origin) as Parameters<typeof toRecord>[0] | null;
    if (existing) return { memory: toRecord(existing), suppressed: false };

    const now = new Date().toISOString();
    const result = db.query(`
      INSERT INTO memories(
        user_id, kind, claim, fingerprint, evidence_json, origin, recorded_at,
        event_at, status, supersedes_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'active', ?)
    `).run(
      userId,
      input.kind,
      claim,
      fingerprint,
      JSON.stringify(evidence),
      input.origin,
      now,
      input.eventAt ?? null,
      input.supersedesId ?? null,
    );
    const id = Number(result.lastInsertRowid);
    db.query("INSERT INTO memories_fts(memory_id, claim) VALUES (?, ?)").run(id, claim);
    const row = db.query("SELECT * FROM memories WHERE id = ? AND user_id = ?").get(id, userId) as Parameters<
      typeof toRecord
    >[0];
    return { memory: toRecord(row), suppressed: false };
  })();
}

export function correctMemory(
  db: Database,
  userId: string,
  memoryId: number,
  correction: Omit<CreateMemoryInput, "origin" | "supersedesId">,
): MemoryRecord {
  return db.transaction(() => {
    const existing = db.query("SELECT status FROM memories WHERE id = ? AND user_id = ?").get(memoryId, userId) as
      | { status: MemoryStatus }
      | null;
    if (!existing || existing.status !== "active") throw new Error("Active memory not found");
    db.query("UPDATE memories SET status = 'superseded' WHERE id = ? AND user_id = ?").run(memoryId, userId);
    db.query("DELETE FROM memories_fts WHERE memory_id = ?").run(memoryId);
    const created = createMemory(db, userId, {
      ...correction,
      origin: "user-stated",
      supersedesId: memoryId,
    });
    if (!created.memory) throw new Error("Correction was unexpectedly suppressed");
    return created.memory;
  })();
}

export function forgetMemory(db: Database, userId: string, memoryId: number): boolean {
  return db.transaction(() => {
    const row = db.query(`
      SELECT fingerprint, evidence_json, status FROM memories WHERE id = ? AND user_id = ?
    `).get(memoryId, userId) as { fingerprint: string; evidence_json: string; status: MemoryStatus } | null;
    if (!row || row.status !== "active") return false;
    const now = new Date().toISOString();
    db.query("UPDATE memories SET status = 'forgotten' WHERE id = ? AND user_id = ?").run(memoryId, userId);
    db.query("DELETE FROM memories_fts WHERE memory_id = ?").run(memoryId);
    db.query(`
      INSERT INTO memory_suppressions(user_id, fingerprint, source_refs_json, forgotten_at)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(user_id, fingerprint) DO UPDATE SET
        source_refs_json = excluded.source_refs_json, forgotten_at = excluded.forgotten_at
    `).run(userId, row.fingerprint, row.evidence_json, now);
    return true;
  })();
}

export function searchMemories(db: Database, userId: string, query: string, limit = 8): MemoryRecord[] {
  const stopWords = new Set(["a", "an", "and", "did", "do", "for", "i", "in", "is", "me", "my", "of", "the", "to", "was", "what", "who"]);
  const tokens = (query.normalize("NFKC").match(/[\p{L}\p{N}_@.-]+/gu) ?? [])
    .filter((token) => !stopWords.has(token.toLowerCase()));
  if (tokens.length === 0) return [];
  const match = tokens.slice(0, 16).map((token) => `"${token.replaceAll('"', '""')}"`).join(" OR ");
  const rows = db.query(`
    SELECT m.*
    FROM memories_fts
    JOIN memories m ON m.id = memories_fts.memory_id
    WHERE memories_fts MATCH ? AND m.user_id = ? AND m.status = 'active'
    ORDER BY CASE m.origin WHEN 'user-stated' THEN 0 ELSE 1 END,
      bm25(memories_fts), m.recorded_at DESC
    LIMIT ?
  `).all(match, userId, Math.max(1, Math.min(25, Math.trunc(limit)))) as Array<Parameters<typeof toRecord>[0]>;
  return rows.map(toRecord);
}

export function listActiveMemories(db: Database, userId: string, limit = 100): MemoryRecord[] {
  const rows = db.query(`
    SELECT * FROM memories WHERE user_id = ? AND status = 'active'
    ORDER BY CASE origin WHEN 'user-stated' THEN 0 ELSE 1 END, recorded_at DESC
    LIMIT ?
  `).all(userId, Math.max(1, Math.min(500, Math.trunc(limit)))) as Array<Parameters<typeof toRecord>[0]>;
  return rows.map(toRecord);
}

export function rebuildMemoryFts(db: Database): number {
  return db.transaction(() => {
    db.exec("DELETE FROM memories_fts");
    db.exec("INSERT INTO memories_fts(memory_id, claim) SELECT id, claim FROM memories WHERE status = 'active'");
    return (db.query("SELECT count(*) AS count FROM memories_fts").get() as { count: number }).count;
  })();
}
