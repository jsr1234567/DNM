import { OpenRouterClient } from "../src/ai/openrouter.ts";
import { extractBountyDrafts } from "../src/bounties/extract.ts";
import { closeDatabase, openDatabase } from "../src/db/index.ts";

function argument(name: string): string | undefined {
  const prefix = `--${name}=`;
  return process.argv.find((value) => value.startsWith(prefix))?.slice(prefix.length);
}

const db = await openDatabase();
const client = new OpenRouterClient();
try {
  const requested = argument("user-id");
  const users = db.query(`SELECT id FROM users WHERE status = 'active' AND bounty_discovery_enabled = 1
    AND (? IS NULL OR id = ?) ORDER BY id`).all(requested ?? null, requested ?? null) as Array<{ id: string }>;
  let sources = 0, created = 0, duplicates = 0, sensitive = 0, skipped = 0;
  for (const user of users) {
    const result = await extractBountyDrafts(db, client, user.id);
    sources += result.sourcesConsidered; created += result.created.length;
    duplicates += result.duplicateCount; sensitive += result.sensitiveCount; skipped += result.skippedCount;
  }
  console.log(`Bounty extraction: users=${users.length} sources=${sources} drafts=${created} duplicates=${duplicates} sensitive=${sensitive} skipped=${skipped}.`);
} finally { closeDatabase(db); }
