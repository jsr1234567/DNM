import { closeDatabase, openDatabase } from "../src/db/index.ts";

function argument(name: string): string | undefined {
  const prefix = `--${name}=`;
  return process.argv.find((value) => value.startsWith(prefix))?.slice(prefix.length)?.trim();
}

const userId = argument("user-id");
const circleId = argument("circle") ?? "trusted-circle";
if (!userId) throw new Error("Pass --user-id=<pending-user-id>");
const db = await openDatabase();
try {
  const user = db.query("SELECT id FROM users WHERE id = ?").get(userId);
  const circle = db.query("SELECT id FROM circles WHERE id = ? AND status = 'active'").get(circleId);
  if (!user) throw new Error("Local user not found");
  if (!circle) throw new Error(`Active trusted circle not found: ${circleId}`);
  const now = new Date().toISOString();
  db.transaction(() => {
    db.query("UPDATE users SET status = 'active', updated_at = ? WHERE id = ?").run(now, userId);
    db.query(`INSERT INTO circle_members(circle_id, user_id, status, joined_at)
      VALUES (?, ?, 'active', ?) ON CONFLICT(circle_id, user_id)
      DO UPDATE SET status = 'active'`).run(circleId, userId, now);
  })();
  console.log(`Approved ${userId} for ${circleId}.`);
} finally { closeDatabase(db); }
