import type { Database } from "bun:sqlite";
import { archiveEmail } from "./archive.ts";
import type { MailConnector } from "./connector.ts";

export interface ConnectorSyncResult {
  mailboxEmail: string;
  importedCount: number;
  finalCursor: string;
}

export async function syncMailConnector(
  db: Database,
  owner: { userId: string; mailboxId: string },
  connector: MailConnector,
  pageSize = 25,
): Promise<ConnectorSyncResult> {
  const profile = await connector.getProfile();
  let pageToken: string | undefined;
  let importedCount = 0;

  do {
    const page = await connector.listMessages({ pageToken, pageSize });
    for (const message of page.messages) {
      if (message.mailboxEmail.toLowerCase() !== profile.email.toLowerCase()) {
        throw new Error(`Connector returned a message for the wrong mailbox: ${message.mailboxEmail}`);
      }
      archiveEmail(db, owner, message);
      importedCount += 1;
    }
    pageToken = page.nextPageToken;
  } while (pageToken);

  const changes = await connector.listChanges();
  return { mailboxEmail: profile.email, importedCount, finalCursor: changes.cursor };
}
