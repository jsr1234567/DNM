import { closeDatabase, openDatabase } from "../src/db/index.ts";
import { seedMockMailboxes } from "../src/email/mock/seed.ts";

const anchorArgument = process.argv.find((argument) => argument.startsWith("--anchor="));
const anchor = anchorArgument ? new Date(anchorArgument.slice("--anchor=".length)) : new Date();
if (Number.isNaN(anchor.getTime())) {
  throw new Error("Invalid --anchor value. Use an ISO date, for example --anchor=2026-09-19T12:00:00Z");
}

const db = await openDatabase();
try {
  const mailboxes = await seedMockMailboxes(db, anchor);
  const messageCount = mailboxes.reduce((sum, mailbox) => sum + mailbox.messages, 0);
  console.log(`Seeded ${mailboxes.length} mock mailboxes with ${messageCount} messages.`);
  for (const mailbox of mailboxes) {
    console.log(`- ${mailbox.personaId}: ${mailbox.email} (${mailbox.messages} messages)`);
  }
} finally {
  closeDatabase(db);
}
