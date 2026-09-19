import { closeDatabase, openDatabase } from "../src/db/index.ts";
import { importRecentGmail } from "../src/gmail/import.ts";

function argument(name: string): string | undefined {
  const prefix = `--${name}=`;
  return process.argv.find((value) => value.startsWith(prefix))?.slice(prefix.length);
}

const confirmedMailbox = argument("confirm-mailbox");
if (!confirmedMailbox) {
  throw new Error("Pass --confirm-mailbox=you@example.com to confirm this consenting mailbox");
}
const userId = argument("user-id");
const mailboxId = argument("mailbox-id");
if (!userId || !mailboxId) {
  throw new Error("Pass --user-id=<local-user-id> and --mailbox-id=<owned-gmail-mailbox-id>");
}

const db = await openDatabase();
try {
  const result = await importRecentGmail(db, {
    userId,
    mailboxId,
    confirmedMailbox,
    days: Number(argument("days") ?? 30),
    limit: Number(argument("limit") ?? 500),
  });
  console.log(
    `Imported ${result.importedCount} messages for ${result.mailboxEmail}; snapshot completed ${result.completedAt}.`,
  );
} finally {
  closeDatabase(db);
}
