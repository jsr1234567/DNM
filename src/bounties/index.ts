import type { Database } from "bun:sqlite";
import { createHash, randomUUID } from "node:crypto";

export const BOUNTY_CATEGORIES = ["ride", "pickup", "moving", "errand", "borrow", "pet", "event", "other"] as const;
export type BountyCategory = typeof BOUNTY_CATEGORIES[number];
export type BountyStatus = "draft" | "open" | "paused" | "matched" | "completed" | "dismissed" | "expired";
export type EvidenceType = "email" | "memory" | "chat";

export interface BountyEvidenceInput { type: EvidenceType; id: string }
export interface BountyDraftInput {
  category: BountyCategory;
  title: string;
  publicDescription: string;
  timingText: string;
  startsAt?: string;
  endsAt?: string;
  recurrence?: { cadence: "weekly"; days: string[]; localTime: string; until: string | null };
  areaText?: string;
  requirements: string[];
  sourceSummary: string;
  confidence: number;
  evidence: BountyEvidenceInput[];
}

export interface BountyRecord extends BountyDraftInput {
  id: string;
  ownerUserId: string;
  audienceCircleId: string;
  status: BountyStatus;
  dedupeKey: string;
  createdAt: string;
  confirmedAt?: string;
  expiresAt?: string;
  updatedAt: string;
}

type BountyRow = {
  id: string; owner_user_id: string; audience_circle_id: string; status: BountyStatus;
  category: BountyCategory; dedupe_key: string; title: string; public_description: string;
  timing_text: string; starts_at: string | null; ends_at: string | null;
  recurrence_json: string | null; area_text: string | null; requirements_json: string;
  source_summary: string; confidence: number; created_at: string; confirmed_at: string | null;
  expires_at: string | null; updated_at: string;
};

function oneLine(value: string, max: number, field: string): string {
  const normalized = value.normalize("NFKC").replace(/\s+/g, " ").trim();
  if (!normalized || normalized.length > max) throw new Error(`${field} must be 1-${max} characters`);
  return normalized;
}

function iso(value: string | undefined, field: string): string | undefined {
  if (!value) return undefined;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error(`${field} must be an ISO date`);
  return date.toISOString();
}

function fromRow(row: BountyRow, evidence: BountyEvidenceInput[] = []): BountyRecord {
  return {
    id: row.id, ownerUserId: row.owner_user_id, audienceCircleId: row.audience_circle_id,
    status: row.status, category: row.category, dedupeKey: row.dedupe_key,
    title: row.title, publicDescription: row.public_description, timingText: row.timing_text,
    startsAt: row.starts_at ?? undefined, endsAt: row.ends_at ?? undefined,
    recurrence: row.recurrence_json ? JSON.parse(row.recurrence_json) : undefined,
    areaText: row.area_text ?? undefined, requirements: JSON.parse(row.requirements_json),
    sourceSummary: row.source_summary, confidence: row.confidence, evidence,
    createdAt: row.created_at, confirmedAt: row.confirmed_at ?? undefined,
    expiresAt: row.expires_at ?? undefined, updatedAt: row.updated_at,
  };
}

function assertSafePublicText(input: BountyDraftInput): void {
  const publicText = `${input.title} ${input.publicDescription} ${input.timingText} ${input.areaText ?? ""}`;
  if (/\b[\w.+-]+@[\w.-]+\.[a-z]{2,}\b/i.test(publicText) || /\+?\d[\d ()-]{7,}\d/.test(publicText)) {
    throw new Error("Public bounty text cannot contain contact details");
  }
  if (/\b(password|passcode|verification code|otp|medical diagnosis|social security|exact address)\b/i.test(publicText)) {
    throw new Error("Sensitive bounty text is not allowed");
  }
  if (/\b\d{1,6}\s+[\p{L}0-9.' -]+\s(?:street|st|avenue|ave|road|rd|boulevard|blvd|lane|ln|drive|dr|court|ct)\b/iu.test(publicText) ||
      /\b(doctor|clinic|diagnosis|medication|prescription|therapy|medical appointment)\b/i.test(publicText)) {
    throw new Error("Exact addresses and health details are not allowed in public bounty text");
  }
}

function validateDraft(input: BountyDraftInput): BountyDraftInput {
  if (!BOUNTY_CATEGORIES.includes(input.category)) throw new Error("Invalid bounty category");
  const normalized = {
    ...input,
    title: oneLine(input.title, 100, "title"),
    publicDescription: oneLine(input.publicDescription, 500, "publicDescription"),
    timingText: oneLine(input.timingText, 160, "timingText"),
    startsAt: iso(input.startsAt, "startsAt"), endsAt: iso(input.endsAt, "endsAt"),
    areaText: input.areaText ? oneLine(input.areaText, 120, "areaText") : undefined,
    requirements: [...new Set(input.requirements.map((item) => oneLine(item, 120, "requirement")))].slice(0, 10),
    sourceSummary: oneLine(input.sourceSummary, 500, "sourceSummary"),
    confidence: Number(input.confidence),
    evidence: [...new Map(input.evidence.map((item) => [`${item.type}:${item.id}`, item])).values()],
  };
  if (!Number.isFinite(normalized.confidence) || normalized.confidence < 0 || normalized.confidence > 1) {
    throw new Error("confidence must be between 0 and 1");
  }
  if (normalized.evidence.length === 0) throw new Error("At least one owned source is required");
  if (normalized.startsAt && normalized.endsAt && normalized.startsAt >= normalized.endsAt) {
    throw new Error("Bounty end must be after start");
  }
  assertSafePublicText(normalized);
  return normalized;
}

function assertEvidenceOwned(db: Database, userId: string, evidence: BountyEvidenceInput[]): void {
  for (const source of evidence) {
    let owned: unknown;
    if (source.type === "email") {
      owned = db.query("SELECT 1 FROM email_messages WHERE user_id = ? AND provider_message_id = ?").get(userId, source.id);
    } else if (source.type === "chat") {
      owned = db.query("SELECT 1 FROM chat_messages WHERE user_id = ? AND provider_message_id = ?").get(userId, source.id);
    } else {
      const id = Number(source.id);
      owned = Number.isInteger(id) ? db.query("SELECT 1 FROM memories WHERE user_id = ? AND id = ?").get(userId, id) : undefined;
    }
    if (!owned) throw new Error(`Evidence ${source.type}:${source.id} does not belong to the bounty owner`);
  }
}

export function bountyDedupeKey(ownerUserId: string, input: BountyDraftInput): string {
  const stable = [ownerUserId, input.category, input.startsAt ?? input.timingText, input.endsAt ?? "",
    input.recurrence ? JSON.stringify(input.recurrence) : "", input.areaText?.toLowerCase() ?? "",
    input.title.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim()].join("|");
  return createHash("sha256").update(stable).digest("hex");
}

export function createBountyDraft(
  db: Database, ownerUserId: string, audienceCircleId: string, raw: BountyDraftInput,
): { bounty: BountyRecord; created: boolean } {
  const input = validateDraft(raw);
  assertEvidenceOwned(db, ownerUserId, input.evidence);
  const eligible = db.query(`
    SELECT 1 FROM users u JOIN circle_members cm ON cm.user_id = u.id
    JOIN circles c ON c.id = cm.circle_id
    WHERE u.id = ? AND u.status = 'active' AND u.bounty_discovery_enabled = 1
      AND cm.circle_id = ? AND cm.status = 'active' AND c.status = 'active'
  `).get(ownerUserId, audienceCircleId);
  if (!eligible) throw new Error("Owner is not enabled in this active circle");
  const key = bountyDedupeKey(ownerUserId, input);
  const existing = db.query(`
    SELECT * FROM bounties WHERE owner_user_id = ? AND dedupe_key = ?
      AND status IN ('draft', 'open', 'paused', 'matched')
  `).get(ownerUserId, key) as BountyRow | null;
  if (existing) return { bounty: fromRow(existing, listBountyEvidence(db, ownerUserId, existing.id)), created: false };

  return db.transaction(() => {
    const id = randomUUID();
    const now = new Date().toISOString();
    const expires = new Date(Date.now() + 7 * 86_400_000).toISOString();
    db.query(`
      INSERT INTO bounties(
        id, owner_user_id, audience_circle_id, status, category, dedupe_key, title,
        public_description, timing_text, starts_at, ends_at, recurrence_json, area_text,
        requirements_json, source_summary, confidence, created_at, expires_at, updated_at
      ) VALUES (?, ?, ?, 'draft', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, ownerUserId, audienceCircleId, input.category, key, input.title,
      input.publicDescription, input.timingText, input.startsAt ?? null, input.endsAt ?? null,
      input.recurrence ? JSON.stringify(input.recurrence) : null, input.areaText ?? null,
      JSON.stringify(input.requirements), input.sourceSummary, input.confidence, now, expires, now);
    const insertEvidence = db.query(`
      INSERT INTO bounty_evidence(bounty_id, owner_user_id, source_type, source_id) VALUES (?, ?, ?, ?)
    `);
    for (const source of input.evidence) insertEvidence.run(id, ownerUserId, source.type, source.id);
    recordBountyEvent(db, id, ownerUserId, "draft_created", { evidenceCount: input.evidence.length });
    return { bounty: getOwnedBounty(db, ownerUserId, id)!, created: true };
  })();
}

export function recordBountyEvent(
  db: Database, bountyId: string, actorUserId: string | null, eventType: string,
  metadata: Record<string, unknown> = {},
): void {
  db.query(`INSERT INTO bounty_events(bounty_id, actor_user_id, event_type, metadata_json, created_at)
    VALUES (?, ?, ?, ?, ?)`
  ).run(bountyId, actorUserId, eventType, JSON.stringify(metadata), new Date().toISOString());
}

export function listBountyEvidence(db: Database, ownerUserId: string, bountyId: string): BountyEvidenceInput[] {
  return db.query(`SELECT source_type AS type, source_id AS id FROM bounty_evidence
    WHERE bounty_id = ? AND owner_user_id = ? ORDER BY source_type, source_id`
  ).all(bountyId, ownerUserId) as BountyEvidenceInput[];
}

export function getOwnedBounty(db: Database, ownerUserId: string, bountyId: string): BountyRecord | undefined {
  const row = db.query("SELECT * FROM bounties WHERE id = ? AND owner_user_id = ?").get(bountyId, ownerUserId) as BountyRow | null;
  return row ? fromRow(row, listBountyEvidence(db, ownerUserId, bountyId)) : undefined;
}

export function listOwnedBounties(db: Database, ownerUserId: string, statuses?: BountyStatus[]): BountyRecord[] {
  const allowed = statuses?.filter((item) => ["draft", "open", "paused", "matched", "completed", "dismissed", "expired"].includes(item));
  const where = allowed?.length ? `AND status IN (${allowed.map(() => "?").join(",")})` : "";
  const rows = db.query(`SELECT * FROM bounties WHERE owner_user_id = ? ${where} ORDER BY updated_at DESC`).all(
    ownerUserId, ...(allowed ?? []),
  ) as BountyRow[];
  return rows.map((row) => fromRow(row, listBountyEvidence(db, ownerUserId, row.id)));
}

export function transitionBounty(
  db: Database, ownerUserId: string, bountyId: string, expected: BountyStatus,
  next: BountyStatus, eventType: string,
): boolean {
  const allowed: Record<BountyStatus, BountyStatus[]> = {
    draft: ["open", "dismissed", "expired"], open: ["paused", "matched", "completed", "dismissed", "expired"],
    paused: ["open", "dismissed", "expired"], matched: ["completed", "open"],
    completed: [], dismissed: [], expired: [],
  };
  if (!allowed[expected].includes(next)) throw new Error(`Invalid bounty transition ${expected} -> ${next}`);
  return db.transaction(() => {
    const now = new Date().toISOString();
    let openExpiry: string | null = null;
    if (next === "open") {
      const timing = db.query("SELECT ends_at, recurrence_json FROM bounties WHERE id = ? AND owner_user_id = ?")
        .get(bountyId, ownerUserId) as { ends_at: string | null; recurrence_json: string | null } | null;
      if (timing?.recurrence_json) openExpiry = new Date(Date.now() + 28 * 86_400_000).toISOString();
      else if (timing?.ends_at) openExpiry = new Date(new Date(timing.ends_at).getTime() + 4 * 3_600_000).toISOString();
      else openExpiry = new Date(Date.now() + 7 * 86_400_000).toISOString();
    }
    const result = db.query(`UPDATE bounties SET status = ?, updated_at = ?,
      confirmed_at = CASE WHEN ? = 'open' AND confirmed_at IS NULL THEN ? ELSE confirmed_at END
      , expires_at = CASE WHEN ? = 'open' THEN ? ELSE expires_at END
      WHERE id = ? AND owner_user_id = ? AND status = ?`
    ).run(next, now, next, now, next, openExpiry, bountyId, ownerUserId, expected);
    if (result.changes === 1) recordBountyEvent(db, bountyId, ownerUserId, eventType);
    return result.changes === 1;
  })();
}

export function editDraft(db: Database, ownerUserId: string, bountyId: string, description: string): boolean {
  const safe = oneLine(description, 500, "publicDescription");
  assertSafePublicText({ title: "request", publicDescription: safe, timingText: "pending", category: "other",
    requirements: [], sourceSummary: "private", confidence: 1, evidence: [{ type: "chat", id: "validation-only" }] });
  const result = db.query(`UPDATE bounties SET public_description = ?, updated_at = ?
    WHERE id = ? AND owner_user_id = ? AND status = 'draft'`
  ).run(safe, new Date().toISOString(), bountyId, ownerUserId);
  if (result.changes === 1) recordBountyEvent(db, bountyId, ownerUserId, "owner_edited");
  return result.changes === 1;
}

export interface PublicBounty {
  id: string; category: BountyCategory; title: string; publicDescription: string;
  timingText: string; startsAt?: string; endsAt?: string; recurrence?: BountyDraftInput["recurrence"];
  areaText?: string; requirements: string[]; expiresAt?: string;
}

export function listPublicBoard(db: Database, circleId: string, viewerUserId: string): PublicBounty[] {
  const member = db.query(`SELECT 1 FROM circle_members cm JOIN users u ON u.id = cm.user_id
    WHERE cm.circle_id = ? AND cm.user_id = ? AND cm.status = 'active' AND u.status = 'active'`
  ).get(circleId, viewerUserId);
  if (!member) return [];
  const now = new Date().toISOString();
  const rows = db.query(`SELECT * FROM bounties WHERE audience_circle_id = ? AND owner_user_id <> ?
    AND status = 'open' AND (expires_at IS NULL OR expires_at > ?) ORDER BY updated_at DESC`
  ).all(circleId, viewerUserId, now) as BountyRow[];
  return rows.map((row) => ({
    id: row.id, category: row.category, title: row.title, publicDescription: row.public_description,
    timingText: row.timing_text, startsAt: row.starts_at ?? undefined, endsAt: row.ends_at ?? undefined,
    recurrence: row.recurrence_json ? JSON.parse(row.recurrence_json) : undefined,
    areaText: row.area_text ?? undefined, requirements: JSON.parse(row.requirements_json),
    expiresAt: row.expires_at ?? undefined,
  }));
}

export function expireBounties(db: Database, now = new Date()): number {
  const rows = db.query(`SELECT id, owner_user_id FROM bounties
    WHERE status IN ('draft', 'open', 'paused') AND expires_at IS NOT NULL AND expires_at <= ?`
  ).all(now.toISOString()) as Array<{ id: string; owner_user_id: string }>;
  for (const row of rows) transitionBounty(db, row.owner_user_id, row.id,
    (db.query("SELECT status FROM bounties WHERE id = ?").get(row.id) as { status: BountyStatus }).status,
    "expired", "expired");
  return rows.length;
}
