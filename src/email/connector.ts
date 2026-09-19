import type { ArchivedEmail } from "./archive.ts";

export interface MailboxProfile {
  provider: string;
  mailboxId: string;
  email: string;
  displayName: string;
}

export interface MailPage {
  messages: ArchivedEmail[];
  nextPageToken?: string;
}

export interface MailChange {
  cursor: string;
  type: "upsert" | "delete";
  providerMessageId: string;
  message?: ArchivedEmail;
}

export interface MailChangePage {
  changes: MailChange[];
  cursor: string;
}

export interface MailConnector {
  readonly provider: string;
  getProfile(): Promise<MailboxProfile>;
  listMessages(options?: { pageToken?: string; pageSize?: number }): Promise<MailPage>;
  getMessage(providerMessageId: string): Promise<ArchivedEmail | undefined>;
  listChanges(afterCursor?: string): Promise<MailChangePage>;
}
