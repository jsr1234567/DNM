import { Database } from "bun:sqlite";
import { chmodSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { randomUUID } from "node:crypto";
import type {
  EmailMessage,
  EmailMessageInput,
  HelpMode,
  HelpRequest,
  HelpSuggestion,
  HelperMode,
  LeaderboardEntry,
  LeaderboardVisibility,
  OpportunityCandidate,
  Participant,
  SkillCategory,
} from "./types.ts";

type ParticipantInput = Omit<Participant, "community" | "leaderboardVisibility"> & {
  community?: string;
  leaderboardVisibility?: LeaderboardVisibility;
};

type HelperProfileInput = {
  participantId: string;
  skills: SkillCategory[];
  mode: HelperMode;
};

type RequestOverrides = Partial<
  Pick<HelpRequest, "title" | "description" | "category" | "mode" | "community">
>;

function now(): string {
  return new Date().toISOString();
}

function mapRequest(row: Record<string, unknown>): HelpRequest {
  return {
    id: String(row.id),
    suggestionId: String(row.suggestion_id),
    requesterId: String(row.requester_id),
    title: String(row.title),
    description: String(row.description),
    category: row.category as SkillCategory,
    mode: row.mode as HelpMode,
    community: String(row.community),
    status: row.status as HelpRequest["status"],
    claimedBy: row.claimed_by ? String(row.claimed_by) : undefined,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

function mapEmail(row: Record<string, unknown>): EmailMessage {
  return {
    id: String(row.id),
    ownerId: String(row.owner_id),
    providerMessageId: String(row.provider_message_id),
    threadId: String(row.thread_id),
    fromAddress: String(row.from_address),
    toAddresses: JSON.parse(String(row.to_addresses_json)) as string[],
    subject: String(row.subject),
    bodyText: String(row.body_text),
    sentAt: String(row.sent_at),
    source: row.source as EmailMessage["source"],
  };
}

function mapSuggestion(row: Record<string, unknown>): HelpSuggestion {
  return {
    id: String(row.id),
    ownerId: String(row.owner_id),
    emailMessageId: String(row.email_message_id),
    title: String(row.title),
    summary: String(row.summary),
    category: row.category as SkillCategory,
    mode: row.mode as HelpMode,
    confidence: Number(row.confidence),
    reason: String(row.reason),
    status: row.status as HelpSuggestion["status"],
    createdAt: String(row.created_at),
  };
}

function mapParticipant(row: Record<string, unknown>): Participant {
  return {
    id: String(row.id),
    displayName: String(row.display_name),
    email: row.email ? String(row.email) : undefined,
    phone: row.phone ? String(row.phone) : undefined,
    community: String(row.community),
    leaderboardVisibility: row.leaderboard_visibility as LeaderboardVisibility,
  };
}

export class FroggieRepository {
  readonly db: Database;
  readonly path: string;

  constructor(path = process.env.FROGGIE_DB_PATH ?? ".data/froggie.sqlite") {
    this.path = path;
    if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
    this.db = new Database(path, { create: true, strict: true });
    this.db.run("PRAGMA foreign_keys = ON");
    this.db.run("PRAGMA busy_timeout = 5000");
    if (path !== ":memory:") this.db.run("PRAGMA journal_mode = WAL");
    this.migrate();
    if (path !== ":memory:") chmodSync(path, 0o600);
  }

  close(): void {
    this.db.close();
  }

  private migrate(): void {
    this.db.run(`
      CREATE TABLE IF NOT EXISTS participants (
        id TEXT PRIMARY KEY,
        display_name TEXT NOT NULL,
        email TEXT,
        phone TEXT,
        community TEXT NOT NULL DEFAULT 'general',
        leaderboard_visibility TEXT NOT NULL DEFAULT 'anonymous'
          CHECK (leaderboard_visibility IN ('public', 'anonymous')),
        created_at TEXT NOT NULL,
        CHECK (email IS NOT NULL OR phone IS NOT NULL)
      );

      CREATE UNIQUE INDEX IF NOT EXISTS participants_email_unique
        ON participants(email) WHERE email IS NOT NULL;
      CREATE UNIQUE INDEX IF NOT EXISTS participants_phone_unique
        ON participants(phone) WHERE phone IS NOT NULL;

      CREATE TABLE IF NOT EXISTS helper_profiles (
        participant_id TEXT PRIMARY KEY REFERENCES participants(id) ON DELETE CASCADE,
        mode TEXT NOT NULL CHECK (mode IN ('remote', 'in_person', 'either', 'both')),
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS helper_skills (
        participant_id TEXT NOT NULL REFERENCES participants(id) ON DELETE CASCADE,
        category TEXT NOT NULL,
        PRIMARY KEY (participant_id, category)
      );

      CREATE TABLE IF NOT EXISTS email_messages (
        id TEXT PRIMARY KEY,
        owner_id TEXT NOT NULL REFERENCES participants(id) ON DELETE CASCADE,
        provider_message_id TEXT NOT NULL UNIQUE,
        thread_id TEXT NOT NULL,
        from_address TEXT NOT NULL,
        to_addresses_json TEXT NOT NULL,
        subject TEXT NOT NULL,
        body_text TEXT NOT NULL,
        sent_at TEXT NOT NULL,
        source TEXT NOT NULL CHECK (source IN ('gmail', 'fixture')),
        imported_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS help_suggestions (
        id TEXT PRIMARY KEY,
        owner_id TEXT NOT NULL REFERENCES participants(id) ON DELETE CASCADE,
        email_message_id TEXT NOT NULL REFERENCES email_messages(id) ON DELETE CASCADE,
        title TEXT NOT NULL,
        summary TEXT NOT NULL,
        category TEXT NOT NULL,
        mode TEXT NOT NULL CHECK (mode IN ('remote', 'in_person', 'either')),
        confidence REAL NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
        reason TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending'
          CHECK (status IN ('pending', 'approved', 'dismissed')),
        created_at TEXT NOT NULL,
        UNIQUE (owner_id, email_message_id, category)
      );

      CREATE TABLE IF NOT EXISTS help_requests (
        id TEXT PRIMARY KEY,
        suggestion_id TEXT NOT NULL UNIQUE REFERENCES help_suggestions(id),
        requester_id TEXT NOT NULL REFERENCES participants(id),
        title TEXT NOT NULL,
        description TEXT NOT NULL,
        category TEXT NOT NULL,
        mode TEXT NOT NULL CHECK (mode IN ('remote', 'in_person', 'either')),
        community TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'open'
          CHECK (status IN ('open', 'claimed', 'in_progress', 'awaiting_confirmation', 'completed', 'cancelled')),
        claimed_by TEXT REFERENCES participants(id),
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS suggestion_notifications (
        suggestion_id TEXT PRIMARY KEY REFERENCES help_suggestions(id) ON DELETE CASCADE,
        sent_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS mailbox_watch_state (
        id TEXT PRIMARY KEY,
        last_checked_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS request_publications (
        request_id TEXT PRIMARY KEY REFERENCES help_requests(id) ON DELETE CASCADE,
        published_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS points_ledger (
        id TEXT PRIMARY KEY,
        participant_id TEXT NOT NULL REFERENCES participants(id),
        request_id TEXT NOT NULL REFERENCES help_requests(id),
        points INTEGER NOT NULL CHECK (points > 0),
        reason TEXT NOT NULL,
        created_at TEXT NOT NULL,
        UNIQUE (participant_id, request_id, reason)
      );
    `);
  }

  registerParticipant(input: ParticipantInput): Participant {
    const participant: Participant = {
      ...input,
      community: input.community ?? "general",
      leaderboardVisibility: input.leaderboardVisibility ?? "anonymous",
    };
    this.db.query(`
      INSERT INTO participants (
        id, display_name, email, phone, community, leaderboard_visibility, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        display_name = excluded.display_name,
        email = excluded.email,
        phone = excluded.phone,
        community = excluded.community,
        leaderboard_visibility = excluded.leaderboard_visibility
    `).run(
      participant.id,
      participant.displayName,
      participant.email ?? null,
      participant.phone ?? null,
      participant.community,
      participant.leaderboardVisibility,
      now(),
    );
    return participant;
  }

  findParticipantByContact(contact: string): Participant | undefined {
    const trimmed = contact.trim();
    const normalizedPhone = trimmed.replace(/[\s()-]/g, "");
    const row = this.db.query(`
      SELECT * FROM participants
      WHERE lower(email) = lower(?) OR phone = ?
      LIMIT 1
    `).get(trimmed, normalizedPhone) as Record<string, unknown> | null;
    return row ? mapParticipant(row) : undefined;
  }

  findParticipantById(id: string): Participant | undefined {
    const row = this.db
      .query("SELECT * FROM participants WHERE id = ? LIMIT 1")
      .get(id) as Record<string, unknown> | null;
    return row ? mapParticipant(row) : undefined;
  }

  setHelperProfile(input: HelperProfileInput): void {
    if (input.skills.length === 0) throw new Error("Choose at least one helper skill.");
    const write = this.db.transaction(() => {
      this.db.query(`
        INSERT INTO helper_profiles (participant_id, mode, updated_at)
        VALUES (?, ?, ?)
        ON CONFLICT(participant_id) DO UPDATE SET
          mode = excluded.mode,
          updated_at = excluded.updated_at
      `).run(input.participantId, input.mode, now());
      this.db.query("DELETE FROM helper_skills WHERE participant_id = ?").run(input.participantId);
      const insert = this.db.query(
        "INSERT INTO helper_skills (participant_id, category) VALUES (?, ?)",
      );
      for (const skill of new Set(input.skills)) insert.run(input.participantId, skill);
    });
    write();
  }

  insertEmailMessage(input: EmailMessageInput): EmailMessage {
    const message: EmailMessage = {
      ...input,
      id: input.id ?? randomUUID(),
      source: input.source ?? "gmail",
    };
    this.db.query(`
      INSERT INTO email_messages (
        id, owner_id, provider_message_id, thread_id, from_address,
        to_addresses_json, subject, body_text, sent_at, source, imported_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(provider_message_id) DO UPDATE SET
        thread_id = excluded.thread_id,
        from_address = excluded.from_address,
        to_addresses_json = excluded.to_addresses_json,
        subject = excluded.subject,
        body_text = excluded.body_text,
        sent_at = excluded.sent_at,
        source = excluded.source,
        imported_at = excluded.imported_at
    `).run(
      message.id,
      message.ownerId,
      message.providerMessageId,
      message.threadId,
      message.fromAddress,
      JSON.stringify(message.toAddresses),
      message.subject,
      message.bodyText,
      message.sentAt,
      message.source,
      now(),
    );
    const stored = this.db
      .query("SELECT * FROM email_messages WHERE provider_message_id = ?")
      .get(message.providerMessageId) as Record<string, unknown>;
    return mapEmail(stored);
  }

  hasEmailProviderMessage(providerMessageId: string): boolean {
    return Boolean(
      this.db
        .query("SELECT 1 FROM email_messages WHERE provider_message_id = ? LIMIT 1")
        .get(providerMessageId),
    );
  }

  getMailboxLastCheckedAt(id: string): string | undefined {
    const row = this.db
      .query("SELECT last_checked_at FROM mailbox_watch_state WHERE id = ?")
      .get(id) as { last_checked_at: string } | null;
    return row?.last_checked_at;
  }

  setMailboxLastCheckedAt(id: string, checkedAt: string): void {
    this.db
      .query(`
        INSERT INTO mailbox_watch_state (id, last_checked_at) VALUES (?, ?)
        ON CONFLICT(id) DO UPDATE SET last_checked_at = excluded.last_checked_at
      `)
      .run(id, checkedAt);
  }

  createSuggestion(
    ownerId: string,
    emailMessageId: string,
    candidate: OpportunityCandidate,
  ): HelpSuggestion {
    const suggestion: HelpSuggestion = {
      ...candidate,
      id: randomUUID(),
      ownerId,
      emailMessageId,
      status: "pending",
      createdAt: now(),
    };
    this.db.query(`
      INSERT OR IGNORE INTO help_suggestions (
        id, owner_id, email_message_id, title, summary, category, mode,
        confidence, reason, status, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?)
    `).run(
      suggestion.id,
      suggestion.ownerId,
      suggestion.emailMessageId,
      suggestion.title,
      suggestion.summary,
      suggestion.category,
      suggestion.mode,
      suggestion.confidence,
      suggestion.reason,
      suggestion.createdAt,
    );
    const stored = this.db
      .query(`
        SELECT * FROM help_suggestions
        WHERE owner_id = ? AND email_message_id = ? AND category = ?
      `)
      .get(ownerId, emailMessageId, candidate.category) as Record<string, unknown>;
    return mapSuggestion(stored);
  }

  listPendingSuggestions(ownerId: string): HelpSuggestion[] {
    const rows = this.db.query(`
      SELECT * FROM help_suggestions
      WHERE owner_id = ? AND status = 'pending'
      ORDER BY created_at DESC
    `).all(ownerId) as Array<Record<string, unknown>>;
    return rows.map(mapSuggestion);
  }

  wasSuggestionNotified(suggestionId: string): boolean {
    return Boolean(
      this.db
        .query("SELECT 1 FROM suggestion_notifications WHERE suggestion_id = ? LIMIT 1")
        .get(suggestionId),
    );
  }

  markSuggestionNotified(suggestionId: string): void {
    this.db
      .query(`
        INSERT OR IGNORE INTO suggestion_notifications (suggestion_id, sent_at)
        VALUES (?, ?)
      `)
      .run(suggestionId, now());
  }

  approveSuggestion(
    suggestionId: string,
    requesterId: string,
    overrides: RequestOverrides = {},
  ): HelpRequest {
    const approve = this.db.transaction(() => {
      const row = this.db
        .query("SELECT * FROM help_suggestions WHERE id = ?")
        .get(suggestionId) as Record<string, unknown> | null;
      if (!row) throw new Error("Suggestion not found.");
      if (row.owner_id !== requesterId) throw new Error("Only the requester can approve this suggestion.");
      if (row.status !== "pending") throw new Error("Suggestion has already been handled.");

      const participant = this.db
        .query("SELECT community FROM participants WHERE id = ?")
        .get(requesterId) as { community: string } | null;
      if (!participant) throw new Error("Requester not found.");

      const timestamp = now();
      const request: HelpRequest = {
        id: randomUUID(),
        suggestionId,
        requesterId,
        title: overrides.title ?? String(row.title),
        description: overrides.description ?? String(row.summary),
        category: overrides.category ?? (row.category as SkillCategory),
        mode: overrides.mode ?? (row.mode as HelpMode),
        community: overrides.community ?? participant.community,
        status: "open",
        createdAt: timestamp,
        updatedAt: timestamp,
      };

      this.db.query("UPDATE help_suggestions SET status = 'approved' WHERE id = ?").run(suggestionId);
      this.db.query(`
        INSERT INTO help_requests (
          id, suggestion_id, requester_id, title, description, category,
          mode, community, status, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'open', ?, ?)
      `).run(
        request.id,
        request.suggestionId,
        request.requesterId,
        request.title,
        request.description,
        request.category,
        request.mode,
        request.community,
        request.createdAt,
        request.updatedAt,
      );
      return request;
    });
    return approve();
  }

  dismissSuggestion(suggestionId: string, requesterId: string): void {
    const result = this.db.query(`
      UPDATE help_suggestions
      SET status = 'dismissed'
      WHERE id = ? AND owner_id = ? AND status = 'pending'
    `).run(suggestionId, requesterId);
    if (result.changes !== 1) throw new Error("Pending suggestion not found.");
  }

  listOpenRequests(community?: string): HelpRequest[] {
    const rows = community
      ? this.db.query(`
          SELECT * FROM help_requests
          WHERE status = 'open' AND community IN (?, 'general')
          ORDER BY created_at DESC
        `).all(community)
      : this.db.query(`
          SELECT * FROM help_requests
          WHERE status = 'open'
          ORDER BY created_at DESC
        `).all();
    return (rows as Record<string, unknown>[]).map(mapRequest);
  }

  listUnpublishedOpenRequests(): Array<{ request: HelpRequest; requester: Participant }> {
    const rows = this.db.query(`
      SELECT
        r.*,
        p.id AS participant_id,
        p.display_name AS participant_display_name,
        p.email AS participant_email,
        p.phone AS participant_phone,
        p.community AS participant_community,
        p.leaderboard_visibility AS participant_leaderboard_visibility
      FROM help_requests r
      JOIN participants p ON p.id = r.requester_id
      LEFT JOIN request_publications rp ON rp.request_id = r.id
      WHERE r.status = 'open' AND rp.request_id IS NULL
      ORDER BY r.created_at ASC
    `).all() as Array<Record<string, unknown>>;

    return rows.map((row) => ({
      request: mapRequest(row),
      requester: mapParticipant({
        id: row.participant_id,
        display_name: row.participant_display_name,
        email: row.participant_email,
        phone: row.participant_phone,
        community: row.participant_community,
        leaderboard_visibility: row.participant_leaderboard_visibility,
      }),
    }));
  }

  markRequestPublished(requestId: string): void {
    this.db
      .query(`
        INSERT OR IGNORE INTO request_publications (request_id, published_at)
        VALUES (?, ?)
      `)
      .run(requestId, now());
  }

  claimRequest(requestId: string, helperId: string): HelpRequest {
    const claim = this.db.transaction(() => {
      const requestRow = this.db
        .query("SELECT * FROM help_requests WHERE id = ?")
        .get(requestId) as Record<string, unknown> | null;
      if (!requestRow || requestRow.status !== "open") throw new Error("This project is no longer available.");
      if (requestRow.requester_id === helperId) throw new Error("You cannot claim your own project.");

      const profile = this.db
        .query("SELECT mode FROM helper_profiles WHERE participant_id = ?")
        .get(helperId) as { mode: HelperMode } | null;
      if (!profile) throw new Error("Create a helper profile before claiming a project.");
      const skills = this.db
        .query("SELECT category FROM helper_skills WHERE participant_id = ?")
        .all(helperId) as Array<{ category: SkillCategory }>;

      const category = requestRow.category as SkillCategory;
      const hasSkill = skills.some(({ category: skill }) => skill === category || skill === "general");
      const requestMode = requestRow.mode as HelpMode;
      const modeMatches =
        profile.mode === "both" ||
        profile.mode === "either" ||
        requestMode === "either" ||
        profile.mode === requestMode;
      if (!hasSkill || !modeMatches) throw new Error("This project does not match your helper profile.");

      const timestamp = now();
      const result = this.db.query(`
        UPDATE help_requests
        SET status = 'claimed', claimed_by = ?, updated_at = ?
        WHERE id = ? AND status = 'open'
      `).run(helperId, timestamp, requestId);
      if (result.changes !== 1) throw new Error("Another helper already claimed this project.");

      return mapRequest({ ...requestRow, status: "claimed", claimed_by: helperId, updated_at: timestamp });
    });
    return claim();
  }

  startRequest(requestId: string, helperId: string): HelpRequest {
    return this.transitionByHelper(requestId, helperId, "claimed", "in_progress");
  }

  submitForConfirmation(requestId: string, helperId: string): HelpRequest {
    return this.transitionByHelper(requestId, helperId, "in_progress", "awaiting_confirmation");
  }

  private transitionByHelper(
    requestId: string,
    helperId: string,
    from: HelpRequest["status"],
    to: HelpRequest["status"],
  ): HelpRequest {
    const timestamp = now();
    const result = this.db.query(`
      UPDATE help_requests SET status = ?, updated_at = ?
      WHERE id = ? AND claimed_by = ? AND status = ?
    `).run(to, timestamp, requestId, helperId, from);
    if (result.changes !== 1) throw new Error("Project cannot move to that status.");
    const row = this.db.query("SELECT * FROM help_requests WHERE id = ?").get(requestId);
    return mapRequest(row as Record<string, unknown>);
  }

  confirmCompletion(requestId: string, requesterId: string, points = 10): HelpRequest {
    const complete = this.db.transaction(() => {
      const row = this.db
        .query("SELECT * FROM help_requests WHERE id = ?")
        .get(requestId) as Record<string, unknown> | null;
      if (!row || row.requester_id !== requesterId || row.status !== "awaiting_confirmation") {
        throw new Error("Only the requester can confirm this completed project.");
      }
      if (!row.claimed_by) throw new Error("Completed project has no helper.");

      const timestamp = now();
      this.db.query(`
        UPDATE help_requests SET status = 'completed', updated_at = ? WHERE id = ?
      `).run(timestamp, requestId);
      this.db.query(`
        INSERT INTO points_ledger (id, participant_id, request_id, points, reason, created_at)
        VALUES (?, ?, ?, ?, 'project_completed', ?)
      `).run(randomUUID(), String(row.claimed_by), requestId, points, timestamp);
      return mapRequest({ ...row, status: "completed", updated_at: timestamp });
    });
    return complete();
  }

  leaderboard(): LeaderboardEntry[] {
    const rows = this.db.query(`
      SELECT
        p.id AS participant_id,
        CASE
          WHEN p.leaderboard_visibility = 'public' THEN p.display_name
          ELSE 'Anonymous helper'
        END AS display_name,
        COALESCE(SUM(l.points), 0) AS points,
        COUNT(DISTINCT l.request_id) AS completed_projects
      FROM participants p
      JOIN helper_profiles hp ON hp.participant_id = p.id
      LEFT JOIN points_ledger l ON l.participant_id = p.id
      GROUP BY p.id, p.display_name, p.leaderboard_visibility
      ORDER BY points DESC, completed_projects DESC, p.created_at ASC
    `).all() as Array<Record<string, unknown>>;
    return rows.map((row) => ({
      participantId: String(row.participant_id),
      displayName: String(row.display_name),
      points: Number(row.points),
      completedProjects: Number(row.completed_projects),
    }));
  }
}
