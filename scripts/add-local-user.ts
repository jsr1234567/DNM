import { closeDatabase, openDatabase } from "../src/db/index.ts";

function argument(name: string): string | undefined {
  const prefix = `--${name}=`;
  return process.argv.find((value) => value.startsWith(prefix))?.slice(prefix.length)?.trim();
}

const id = argument("id");
const name = argument("name");
const senderId = argument("sender-id");
const email = argument("email")?.toLowerCase();
const source = argument("source") ?? "gmail";
if (!id || !name || !senderId) throw new Error("Pass --id=... --name=... --sender-id=...");
if (!process.argv.includes("--consent")) throw new Error("Pass --consent only after the user has explicitly consented");
if (source !== "gmail" && source !== "mock") throw new Error("--source must be gmail or mock");
if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("Invalid --email");
const phone = argument("phone") ?? (/^\+[1-9]\d{7,14}$/.test(senderId) ? senderId : undefined);
const circleId = argument("circle") ?? "trusted-circle";
const now = new Date().toISOString();
const db = await openDatabase();
try {
  const fixtureCount = (db.query("SELECT count(*) AS count FROM mailboxes WHERE source = 'mock'").get() as { count: number }).count;
  if (source === "gmail" && fixtureCount > 0 && !process.argv.includes("--allow-mixed-mode")) {
    throw new Error("Refusing to mix Gmail and fixture users. Use a separate DNM_DATA_DIR, or pass --allow-mixed-mode explicitly.");
  }
  db.transaction(() => {
    db.query(`INSERT INTO users(id, display_name, spectrum_sender_id, phone, status,
      bounty_discovery_enabled, helper_matching_enabled, created_at, updated_at)
      VALUES (?, ?, ?, ?, 'active', ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET display_name = excluded.display_name,
        spectrum_sender_id = excluded.spectrum_sender_id, phone = excluded.phone, updated_at = excluded.updated_at`
    ).run(id, name, senderId, phone ?? null, process.argv.includes("--find-help") ? 1 : 0,
      process.argv.includes("--offer-help") ? 1 : 0, now, now);
    db.query(`INSERT INTO circles(id, name, status, created_at) VALUES (?, ?, 'active', ?)
      ON CONFLICT(id) DO NOTHING`).run(circleId, argument("circle-name") ?? "Trusted circle", now);
    db.query(`INSERT INTO circle_members(circle_id, user_id, status, joined_at) VALUES (?, ?, 'active', ?)
      ON CONFLICT(circle_id, user_id) DO UPDATE SET status = 'active'`).run(circleId, id, now);
    if (email) {
      db.query(`INSERT INTO mailboxes(id, user_id, email, source, status, consent_confirmed_at, created_at, updated_at)
        VALUES (?, ?, ?, ?, 'active', ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET email = excluded.email, status = 'active', updated_at = excluded.updated_at
        WHERE mailboxes.user_id = excluded.user_id`
      ).run(argument("mailbox-id") ?? `${source}:${id}`, id, email, source, now, now, now);
    }
    db.query(`INSERT INTO settings(key, value_json, updated_at) VALUES ('demo_mode', ?, ?)
      ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json, updated_at = excluded.updated_at`
    ).run(JSON.stringify(source === "mock" ? "fixture" : fixtureCount > 0 ? "mixed" : "gmail"), now);
  })();
  console.log(`Allowlisted ${id} in ${circleId}; find-help=${process.argv.includes("--find-help")} offer-help=${process.argv.includes("--offer-help")}.`);
} finally { closeDatabase(db); }
