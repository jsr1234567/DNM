import type { Database } from "bun:sqlite";

export function setSetting(db: Database, key: string, value: unknown): void {
  db.query(`
    INSERT INTO settings(key, value_json, updated_at) VALUES (?, ?, ?)
    ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json, updated_at = excluded.updated_at
  `).run(key, JSON.stringify(value), new Date().toISOString());
}

export function getSetting<T>(db: Database, key: string): T | undefined {
  const row = db.query("SELECT value_json FROM settings WHERE key = ?").get(key) as
    | { value_json: string }
    | null;
  return row ? (JSON.parse(row.value_json) as T) : undefined;
}

export function setUserSetting(db: Database, userId: string, key: string, value: unknown): void {
  db.query(`
    INSERT INTO user_settings(user_id, key, value_json, updated_at) VALUES (?, ?, ?, ?)
    ON CONFLICT(user_id, key) DO UPDATE SET
      value_json = excluded.value_json, updated_at = excluded.updated_at
  `).run(userId, key, JSON.stringify(value), new Date().toISOString());
}

export function getUserSetting<T>(db: Database, userId: string, key: string): T | undefined {
  const row = db.query(
    "SELECT value_json FROM user_settings WHERE user_id = ? AND key = ?",
  ).get(userId, key) as { value_json: string } | null;
  return row ? JSON.parse(row.value_json) as T : undefined;
}
