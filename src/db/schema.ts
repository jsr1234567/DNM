export const SCHEMA_VERSION = 2;

export const schemaSql = `
CREATE TABLE IF NOT EXISTS schema_migrations (
  version INTEGER PRIMARY KEY,
  applied_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS mock_mailboxes (
  id TEXT PRIMARY KEY,
  persona_id TEXT NOT NULL UNIQUE,
  owner_name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  phone TEXT NOT NULL UNIQUE,
  description TEXT NOT NULL,
  seeded_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS email_messages (
  id INTEGER PRIMARY KEY,
  provider_message_id TEXT NOT NULL UNIQUE,
  provider_thread_id TEXT NOT NULL,
  mailbox_email TEXT NOT NULL,
  rfc_message_id TEXT,
  sent_at TEXT,
  internal_date_ms INTEGER NOT NULL,
  sender TEXT NOT NULL DEFAULT '',
  recipients_json TEXT NOT NULL DEFAULT '[]' CHECK(json_valid(recipients_json)),
  cc_json TEXT NOT NULL DEFAULT '[]' CHECK(json_valid(cc_json)),
  bcc_json TEXT NOT NULL DEFAULT '[]' CHECK(json_valid(bcc_json)),
  subject TEXT NOT NULL DEFAULT '',
  normalized_body TEXT NOT NULL,
  snippet TEXT NOT NULL DEFAULT '',
  labels_json TEXT NOT NULL DEFAULT '[]' CHECK(json_valid(labels_json)),
  imported_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS email_messages_thread_idx
  ON email_messages(provider_thread_id, internal_date_ms);
CREATE INDEX IF NOT EXISTS email_messages_date_idx ON email_messages(internal_date_ms DESC);
CREATE INDEX IF NOT EXISTS email_messages_mailbox_idx
  ON email_messages(mailbox_email, internal_date_ms DESC);

CREATE TABLE IF NOT EXISTS chunks (
  id INTEGER PRIMARY KEY,
  email_message_id INTEGER NOT NULL REFERENCES email_messages(id) ON DELETE CASCADE,
  chunk_index INTEGER NOT NULL CHECK(chunk_index >= 0),
  text TEXT NOT NULL,
  index_version TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE(email_message_id, chunk_index, index_version)
);

CREATE INDEX IF NOT EXISTS chunks_message_idx ON chunks(email_message_id);

CREATE VIRTUAL TABLE IF NOT EXISTS chunks_fts USING fts5(
  chunk_id UNINDEXED,
  text,
  subject,
  participants,
  tokenize = 'unicode61 remove_diacritics 2'
);

CREATE TABLE IF NOT EXISTS chunk_embeddings (
  chunk_id INTEGER PRIMARY KEY REFERENCES chunks(id) ON DELETE CASCADE,
  model TEXT NOT NULL,
  dimensions INTEGER NOT NULL CHECK(dimensions > 0),
  embedding BLOB NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS memories (
  id INTEGER PRIMARY KEY,
  kind TEXT NOT NULL CHECK(kind IN ('preference', 'person', 'plan', 'commitment', 'episode')),
  claim TEXT NOT NULL CHECK(length(trim(claim)) > 0),
  fingerprint TEXT NOT NULL,
  evidence_json TEXT NOT NULL DEFAULT '[]' CHECK(json_valid(evidence_json)),
  origin TEXT NOT NULL CHECK(origin IN ('user-stated', 'email-extracted')),
  recorded_at TEXT NOT NULL,
  event_at TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active', 'superseded', 'forgotten')),
  supersedes_id INTEGER REFERENCES memories(id),
  UNIQUE(fingerprint, origin)
);

CREATE INDEX IF NOT EXISTS memories_status_kind_idx ON memories(status, kind);
CREATE VIRTUAL TABLE IF NOT EXISTS memories_fts USING fts5(
  memory_id UNINDEXED,
  claim,
  tokenize = 'unicode61 remove_diacritics 2'
);

CREATE TABLE IF NOT EXISTS memory_suppressions (
  fingerprint TEXT PRIMARY KEY,
  source_refs_json TEXT NOT NULL DEFAULT '[]' CHECK(json_valid(source_refs_json)),
  forgotten_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS chat_messages (
  id INTEGER PRIMARY KEY,
  provider_message_id TEXT NOT NULL UNIQUE,
  conversation_id TEXT NOT NULL,
  sender_id TEXT NOT NULL,
  direction TEXT NOT NULL CHECK(direction IN ('inbound', 'outbound')),
  content TEXT NOT NULL,
  occurred_at TEXT NOT NULL,
  processing_status TEXT NOT NULL DEFAULT 'pending'
    CHECK(processing_status IN ('pending', 'processing', 'processed', 'failed')),
  error_code TEXT
);

CREATE INDEX IF NOT EXISTS chat_messages_conversation_idx
  ON chat_messages(conversation_id, occurred_at DESC);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value_json TEXT NOT NULL CHECK(json_valid(value_json)),
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS import_runs (
  id INTEGER PRIMARY KEY,
  mailbox_email TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('running', 'complete', 'partial', 'failed')),
  query TEXT NOT NULL,
  requested_limit INTEGER NOT NULL,
  imported_count INTEGER NOT NULL DEFAULT 0,
  started_at TEXT NOT NULL,
  completed_at TEXT,
  error_code TEXT
);
`;
