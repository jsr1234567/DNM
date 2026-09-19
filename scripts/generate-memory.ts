import { OpenRouterClient } from "../src/ai/openrouter.ts";
import { closeDatabase, openDatabase } from "../src/db/index.ts";
import { setSetting } from "../src/db/settings.ts";
import { extractMemoriesFromEmail } from "../src/memory/extract.ts";
import { generateMemoryMarkdown, renderMemoryMarkdown, writeMemoryMarkdown } from "../src/memory/profile.ts";

function argument(name: string): string | undefined {
  const prefix = `--${name}=`;
  return process.argv.find((value) => value.startsWith(prefix))?.slice(prefix.length);
}

const mailbox = argument("confirm-mailbox")?.trim().toLowerCase();
if (!mailbox) throw new Error("Pass --confirm-mailbox=you@example.com to confirm this consenting mailbox");
if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(mailbox) || mailbox.length > 254) {
  throw new Error("--confirm-mailbox must be a valid email address");
}
const userId = argument("user-id");
if (!userId) throw new Error("Pass --user-id=<local-user-id>");
const profileOnly = process.argv.includes("--profile-only");
const threadLimit = Number(argument("threads") ?? 25);
const client = new OpenRouterClient();
const db = await openDatabase();

try {
  const owned = db.query(`
    SELECT id FROM mailboxes WHERE user_id = ? AND lower(email) = lower(?) AND status = 'active'
  `).get(userId, mailbox) as { id: string } | null;
  if (!owned) throw new Error(`No active mailbox ${mailbox} belongs to ${userId}`);
  const messageCount = (db.query(
    "SELECT count(*) AS count FROM email_messages WHERE user_id = ? AND mailbox_id = ?",
  ).get(userId, owned.id) as { count: number }).count;
  if (messageCount === 0) throw new Error(`No indexed email found for ${mailbox}`);

  if (!profileOnly) {
    const extraction = await extractMemoriesFromEmail(db, client, {
      userId, mailboxId: owned.id, mailbox, threadLimit,
    });
    console.log(`Read ${extraction.threadsRead} threads; stored ${extraction.created.length} memories; skipped ${extraction.skipped}.`);
  }

  let markdown: string;
  try {
    markdown = await generateMemoryMarkdown(db, client, userId, mailbox);
  } catch {
    console.warn("Model profile formatting was unavailable; using the local source-backed formatter.");
    markdown = renderMemoryMarkdown(db, userId, mailbox, client.model);
  }
  const path = await writeMemoryMarkdown(userId, markdown);
  setSetting(db, `memory_generation:${userId}`, {
    mailbox,
    model: client.model,
    generatedAt: new Date().toISOString(),
    profilePath: path,
  });
  console.log(`Generated private memory profile at ${path}.`);
} finally {
  closeDatabase(db);
}
