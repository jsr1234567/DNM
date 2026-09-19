import { Database } from "bun:sqlite";
import { chmod } from "node:fs/promises";
import { resolve } from "node:path";
import * as sqliteVec from "sqlite-vec";
import { databasePath, ensurePrivateDataDir } from "../config.ts";
import { SCHEMA_VERSION, schemaSql } from "./schema.ts";

export interface OpenDatabaseOptions {
  path?: string;
  create?: boolean;
  loadVector?: boolean;
}

export interface VectorStatus {
  available: boolean;
  version?: string;
  reason?: string;
}

let customSqliteConfigured = false;

function configure(db: Database): void {
  db.exec("PRAGMA foreign_keys = ON");
  db.exec("PRAGMA journal_mode = WAL");
  db.exec("PRAGMA synchronous = NORMAL");
  db.exec("PRAGMA busy_timeout = 5000");
}

export function migrate(db: Database): void {
  const hasMigrations = db.query(
    "SELECT 1 AS present FROM sqlite_master WHERE type = 'table' AND name = 'schema_migrations'",
  ).get();
  if (hasMigrations) {
    const existing = db.query("SELECT max(version) AS version FROM schema_migrations").get() as {
      version: number | null;
    };
    if (existing.version && existing.version < SCHEMA_VERSION) {
      throw new Error(
        `Local database schema ${existing.version} is incompatible with ${SCHEMA_VERSION}. ` +
        "Stop the app and run bun run db:reset -- --yes, then reseed.",
      );
    }
  }
  const migrateTransaction = db.transaction(() => {
    db.exec(schemaSql);
    db.query(
      "INSERT OR IGNORE INTO schema_migrations(version, applied_at) VALUES (?, ?)",
    ).run(SCHEMA_VERSION, new Date().toISOString());
  });
  migrateTransaction();
}

export async function openDatabase(options: OpenDatabaseOptions = {}): Promise<Database> {
  const path = options.path ?? databasePath;
  if (path !== ":memory:") await ensurePrivateDataDir();
  const customSqlite = process.env.DNM_SQLITE_LIBRARY;
  if (customSqlite && !customSqliteConfigured) {
    Database.setCustomSQLite(resolve(customSqlite));
    customSqliteConfigured = true;
  }
  const db = new Database(path, { create: options.create ?? true, strict: true });
  configure(db);
  migrate(db);
  if (path !== ":memory:") await chmod(path, 0o600);
  if (options.loadVector) {
    const vector = loadVectorExtension(db);
    if (!vector.available) {
      db.close(false);
      throw new Error(`sqlite-vec is required but unavailable: ${vector.reason}`);
    }
  }
  return db;
}

export function loadVectorExtension(db: Database): VectorStatus {
  try {
    sqliteVec.load(db);
    const row = db.query("SELECT vec_version() AS version").get() as { version: string };
    return { available: true, version: row.version };
  } catch (error) {
    return {
      available: false,
      reason: error instanceof Error ? error.message : String(error),
    };
  }
}

export function closeDatabase(db: Database): void {
  db.close(false);
}
