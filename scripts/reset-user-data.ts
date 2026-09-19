import { rm } from "node:fs/promises";
import { closeDatabase, openDatabase } from "../src/db/index.ts";
import { rebuildEmailFts } from "../src/email/archive.ts";
import { rebuildMemoryFts } from "../src/memory/index.ts";
import { userDataDir } from "../src/config.ts";

function argument(name: string): string | undefined {
  const prefix = `--${name}=`;
  return process.argv.find((value) => value.startsWith(prefix))?.slice(prefix.length);
}

if (!process.argv.includes("--yes")) throw new Error("Destructive user reset refused. Re-run with --yes after stopping the app and imports.");
const userId = argument("user-id");
if (!userId) throw new Error("Pass --user-id=<local-user-id>");

const db = await openDatabase();
try {
  const exists = db.query("SELECT 1 FROM users WHERE id = ?").get(userId);
  if (!exists) throw new Error("Local user not found");
  db.query("DELETE FROM users WHERE id = ?").run(userId);
  rebuildEmailFts(db);
  rebuildMemoryFts(db);
} finally { closeDatabase(db); }
await rm(userDataDir(userId), { recursive: true, force: true });
console.log(`Removed local sources, indexes, memories, profile, chat, bounties, and token files for ${userId}.`);
console.log("Revoke that user's Google grant separately at https://myaccount.google.com/permissions if desired.");
