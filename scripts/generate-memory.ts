import { OpenRouterClient } from "../src/ai/openrouter.ts";
import { closeDatabase, openDatabase } from "../src/db/index.ts";
import { setSetting } from "../src/db/settings.ts";
import { extractMemoriesFromEmail } from "../src/memory/extract.ts";
import { generateMemoryMarkdown, writeMemoryMarkdown } from "../src/memory/profile.ts";

function argument(name: string): string | undefined {
  const prefix = `--${name}=`;
  return process.argv.find((value) => value.startsWith(prefix))?.slice(prefix.length);
}

const mailbox = argument("confirm-mailbox")?.trim().toLowerCase();
if (!mailbox) throw new Error("Pass --confirm-mailbox=you@example.com to confirm this consenting mailbox");
if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(mailbox) || mailbox.length > 254) {
  throw new Error("--confirm-mailbox must be a valid email address");
}
const profileOnly = process.argv.includes("--profile-only");
const threadLimit = Number(argument("threads") ?? 25);
const client = new OpenRouterClient();
const db = await openDatabase();

try {
  const messageCount = (db.query(
    "SELECT count(*) AS count FROM email_messages WHERE lower(mailbox_email) = lower(?)",
  ).get(mailbox) as { count: number }).count;
  if (messageCount === 0) throw new Error(`No indexed email found for ${mailbox}`);

  if (!profileOnly) {
    const extraction = await extractMemoriesFromEmail(db, client, { mailbox, threadLimit });
    console.log(`Read ${extraction.threadsRead} threads; stored ${extraction.created.length} memories; skipped ${extraction.skipped}.`);
  }

  const markdown = await generateMemoryMarkdown(db, client, mailbox);
  const path = await writeMemoryMarkdown(markdown);
  setSetting(db, "memory_generation", {
    mailbox,
    model: client.model,
    generatedAt: new Date().toISOString(),
    profilePath: path,
  });
  console.log(`Generated private memory profile at ${path}.`);
} finally {
  closeDatabase(db);
}
