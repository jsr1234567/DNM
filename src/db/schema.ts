export const SCHEMA_VERSION = 3;

export const schemaSql = `
CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL);

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY, display_name TEXT NOT NULL,
  spectrum_sender_id TEXT NOT NULL UNIQUE, phone TEXT UNIQUE,
  status TEXT NOT NULL CHECK(status IN ('active', 'paused')),
  bounty_discovery_enabled INTEGER NOT NULL DEFAULT 0 CHECK(bounty_discovery_enabled IN (0, 1)),
  helper_matching_enabled INTEGER NOT NULL DEFAULT 0 CHECK(helper_matching_enabled IN (0, 1)),
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS mailboxes (
  id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  email TEXT NOT NULL, source TEXT NOT NULL CHECK(source IN ('gmail', 'mock')),
  status TEXT NOT NULL CHECK(status IN ('active', 'disconnected')),
  consent_confirmed_at TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
  UNIQUE(source, email)
);
CREATE INDEX IF NOT EXISTS mailboxes_user_idx ON mailboxes(user_id, status);
CREATE TABLE IF NOT EXISTS mock_mailboxes (
  id TEXT PRIMARY KEY REFERENCES mailboxes(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  persona_id TEXT NOT NULL UNIQUE, owner_name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE, phone TEXT NOT NULL UNIQUE,
  description TEXT NOT NULL, seeded_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS demo_profile_bindings (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  sender_id TEXT NOT NULL UNIQUE,
  email TEXT NOT NULL,
  display_name TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS email_messages (
  id INTEGER PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  mailbox_id TEXT NOT NULL REFERENCES mailboxes(id) ON DELETE CASCADE,
  provider_message_id TEXT NOT NULL, provider_thread_id TEXT NOT NULL,
  mailbox_email TEXT NOT NULL, rfc_message_id TEXT, sent_at TEXT,
  internal_date_ms INTEGER NOT NULL, sender TEXT NOT NULL DEFAULT '',
  recipients_json TEXT NOT NULL DEFAULT '[]' CHECK(json_valid(recipients_json)),
  cc_json TEXT NOT NULL DEFAULT '[]' CHECK(json_valid(cc_json)),
  bcc_json TEXT NOT NULL DEFAULT '[]' CHECK(json_valid(bcc_json)),
  subject TEXT NOT NULL DEFAULT '', normalized_body TEXT NOT NULL,
  snippet TEXT NOT NULL DEFAULT '', labels_json TEXT NOT NULL DEFAULT '[]' CHECK(json_valid(labels_json)),
  imported_at TEXT NOT NULL, updated_at TEXT NOT NULL,
  UNIQUE(user_id, provider_message_id)
);
CREATE INDEX IF NOT EXISTS email_messages_thread_idx ON email_messages(user_id, provider_thread_id, internal_date_ms);
CREATE INDEX IF NOT EXISTS email_messages_date_idx ON email_messages(user_id, internal_date_ms DESC);
CREATE INDEX IF NOT EXISTS email_messages_mailbox_idx ON email_messages(user_id, mailbox_id, internal_date_ms DESC);
CREATE TABLE IF NOT EXISTS chunks (
  id INTEGER PRIMARY KEY, email_message_id INTEGER NOT NULL REFERENCES email_messages(id) ON DELETE CASCADE,
  chunk_index INTEGER NOT NULL CHECK(chunk_index >= 0), text TEXT NOT NULL,
  index_version TEXT NOT NULL, created_at TEXT NOT NULL,
  UNIQUE(email_message_id, chunk_index, index_version)
);
CREATE INDEX IF NOT EXISTS chunks_message_idx ON chunks(email_message_id);
CREATE VIRTUAL TABLE IF NOT EXISTS chunks_fts USING fts5(
  chunk_id UNINDEXED, text, subject, participants, tokenize = 'unicode61 remove_diacritics 2'
);
CREATE TABLE IF NOT EXISTS chunk_embeddings (
  chunk_id INTEGER PRIMARY KEY REFERENCES chunks(id) ON DELETE CASCADE,
  model TEXT NOT NULL, dimensions INTEGER NOT NULL CHECK(dimensions > 0),
  embedding BLOB NOT NULL, created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS memories (
  id INTEGER PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK(kind IN ('preference', 'person', 'plan', 'commitment', 'episode')),
  claim TEXT NOT NULL CHECK(length(trim(claim)) > 0), fingerprint TEXT NOT NULL,
  evidence_json TEXT NOT NULL DEFAULT '[]' CHECK(json_valid(evidence_json)),
  origin TEXT NOT NULL CHECK(origin IN ('user-stated', 'email-extracted')),
  recorded_at TEXT NOT NULL, event_at TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active', 'superseded', 'forgotten')),
  supersedes_id INTEGER REFERENCES memories(id) ON DELETE SET NULL, UNIQUE(user_id, fingerprint, origin)
);
CREATE INDEX IF NOT EXISTS memories_status_kind_idx ON memories(user_id, status, kind);
CREATE VIRTUAL TABLE IF NOT EXISTS memories_fts USING fts5(
  memory_id UNINDEXED, claim, tokenize = 'unicode61 remove_diacritics 2'
);
CREATE TABLE IF NOT EXISTS memory_suppressions (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, fingerprint TEXT NOT NULL,
  source_refs_json TEXT NOT NULL DEFAULT '[]' CHECK(json_valid(source_refs_json)),
  forgotten_at TEXT NOT NULL, PRIMARY KEY(user_id, fingerprint)
);
CREATE TABLE IF NOT EXISTS user_profiles (
  id INTEGER PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  version INTEGER NOT NULL, profile_json TEXT NOT NULL CHECK(json_valid(profile_json)),
  source_memory_ids_json TEXT NOT NULL CHECK(json_valid(source_memory_ids_json)),
  model TEXT NOT NULL, generated_at TEXT NOT NULL,
  is_current INTEGER NOT NULL CHECK(is_current IN (0, 1)), UNIQUE(user_id, version)
);
CREATE UNIQUE INDEX IF NOT EXISTS user_profiles_current_idx ON user_profiles(user_id) WHERE is_current = 1;

CREATE TABLE IF NOT EXISTS chat_messages (
  id INTEGER PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider_message_id TEXT NOT NULL, conversation_id TEXT NOT NULL, sender_id TEXT NOT NULL,
  direction TEXT NOT NULL CHECK(direction IN ('inbound', 'outbound')), content TEXT NOT NULL,
  occurred_at TEXT NOT NULL, processing_status TEXT NOT NULL DEFAULT 'pending'
    CHECK(processing_status IN ('pending', 'processing', 'processed', 'failed')),
  error_code TEXT, UNIQUE(user_id, provider_message_id)
);
CREATE INDEX IF NOT EXISTS chat_messages_conversation_idx ON chat_messages(user_id, conversation_id, occurred_at DESC);
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY, value_json TEXT NOT NULL CHECK(json_valid(value_json)), updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS user_settings (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, key TEXT NOT NULL,
  value_json TEXT NOT NULL CHECK(json_valid(value_json)), updated_at TEXT NOT NULL,
  PRIMARY KEY(user_id, key)
);
CREATE TABLE IF NOT EXISTS import_runs (
  id INTEGER PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  mailbox_id TEXT NOT NULL REFERENCES mailboxes(id) ON DELETE CASCADE, mailbox_email TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('running', 'complete', 'partial', 'failed')),
  query TEXT NOT NULL, requested_limit INTEGER NOT NULL, imported_count INTEGER NOT NULL DEFAULT 0,
  started_at TEXT NOT NULL, completed_at TEXT, error_code TEXT
);
CREATE INDEX IF NOT EXISTS import_runs_user_idx ON import_runs(user_id, started_at DESC);

CREATE TABLE IF NOT EXISTS circles (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, status TEXT NOT NULL CHECK(status IN ('active', 'paused')),
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS circle_members (
  circle_id TEXT NOT NULL REFERENCES circles(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK(status IN ('active', 'left')), joined_at TEXT NOT NULL,
  PRIMARY KEY(circle_id, user_id)
);
CREATE TABLE IF NOT EXISTS bounties (
  id TEXT PRIMARY KEY, owner_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  audience_circle_id TEXT NOT NULL REFERENCES circles(id),
  status TEXT NOT NULL CHECK(status IN ('draft', 'open', 'paused', 'matched', 'completed', 'dismissed', 'expired')),
  category TEXT NOT NULL CHECK(category IN ('ride', 'pickup', 'moving', 'errand', 'borrow', 'pet', 'event', 'other')),
  dedupe_key TEXT NOT NULL, title TEXT NOT NULL, public_description TEXT NOT NULL,
  timing_text TEXT NOT NULL, starts_at TEXT, ends_at TEXT,
  recurrence_json TEXT CHECK(recurrence_json IS NULL OR json_valid(recurrence_json)), area_text TEXT,
  requirements_json TEXT NOT NULL DEFAULT '[]' CHECK(json_valid(requirements_json)), source_summary TEXT NOT NULL,
  confidence REAL NOT NULL CHECK(confidence >= 0 AND confidence <= 1), created_at TEXT NOT NULL,
  confirmed_at TEXT, expires_at TEXT, updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS bounties_board_idx ON bounties(status, expires_at, starts_at);
CREATE INDEX IF NOT EXISTS bounties_circle_board_idx ON bounties(audience_circle_id, status, expires_at, starts_at);
CREATE INDEX IF NOT EXISTS bounties_owner_idx ON bounties(owner_user_id, status, updated_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS bounties_live_dedupe_idx ON bounties(owner_user_id, dedupe_key)
  WHERE status IN ('draft', 'open', 'paused', 'matched');
CREATE TABLE IF NOT EXISTS bounty_evidence (
  bounty_id TEXT NOT NULL REFERENCES bounties(id) ON DELETE CASCADE,
  owner_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  source_type TEXT NOT NULL CHECK(source_type IN ('email', 'memory', 'chat')), source_id TEXT NOT NULL,
  PRIMARY KEY(bounty_id, source_type, source_id)
);
CREATE TABLE IF NOT EXISTS bounty_matches (
  id TEXT PRIMARY KEY, bounty_id TEXT NOT NULL REFERENCES bounties(id) ON DELETE CASCADE,
  helper_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK(status IN ('candidate', 'asked_helper', 'helper_declined', 'helper_interested', 'asked_owner', 'owner_declined', 'accepted', 'expired')),
  score REAL NOT NULL CHECK(score >= 0 AND score <= 1), private_reason TEXT NOT NULL,
  helper_blurb TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
  UNIQUE(bounty_id, helper_user_id)
);
CREATE INDEX IF NOT EXISTS bounty_matches_helper_idx ON bounty_matches(helper_user_id, status, updated_at DESC);
CREATE TABLE IF NOT EXISTS bounty_events (
  id INTEGER PRIMARY KEY, bounty_id TEXT NOT NULL REFERENCES bounties(id) ON DELETE CASCADE,
  actor_user_id TEXT REFERENCES users(id) ON DELETE SET NULL, event_type TEXT NOT NULL,
  metadata_json TEXT NOT NULL DEFAULT '{}' CHECK(json_valid(metadata_json)), created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS bounty_events_bounty_idx ON bounty_events(bounty_id, created_at);
`;
