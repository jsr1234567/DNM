import type { ArchivedEmail } from "../archive.ts";
import type {
  MailChangePage,
  MailConnector,
  MailPage,
  MailboxProfile,
} from "../connector.ts";
import { getPersona, type PersonaDefinition } from "./personas.ts";

const DAY_MS = 24 * 60 * 60 * 1000;

function parseOffset(value: string | undefined, maximum: number): number {
  if (value === undefined) return 0;
  const offset = Number(value);
  if (!Number.isSafeInteger(offset) || offset < 0 || offset > maximum) {
    throw new Error("Invalid mock-mail page token");
  }
  return offset;
}

function buildMessages(persona: PersonaDefinition, anchor: Date): ArchivedEmail[] {
  return persona.messages
    .map((fixture) => {
      const sentAt = new Date(anchor.getTime() + fixture.dayOffset * DAY_MS);
      const outgoing = fixture.direction === "outgoing";
      return {
        providerMessageId: `mock:${persona.id}:${fixture.id}`,
        providerThreadId: `mock:${persona.id}:${fixture.threadId}`,
        mailboxEmail: persona.email,
        rfcMessageId: `<${fixture.id}.${persona.id}@mock.dnm.test>`,
        sentAt: sentAt.toISOString(),
        internalDateMs: sentAt.getTime(),
        sender: outgoing ? `${persona.name} <${persona.email}>` : fixture.correspondent,
        recipients: outgoing ? [fixture.correspondent] : [`${persona.name} <${persona.email}>`],
        subject: fixture.subject,
        normalizedBody: fixture.body,
        snippet: fixture.body.slice(0, 180),
        labels: fixture.labels ?? (outgoing ? ["SENT"] : ["INBOX"]),
      } satisfies ArchivedEmail;
    })
    .sort((a, b) => b.internalDateMs - a.internalDateMs);
}

export class MockMailConnector implements MailConnector {
  readonly provider = "mock";
  readonly persona: PersonaDefinition;
  readonly anchor: Date;
  readonly messages: readonly ArchivedEmail[];

  constructor(personaId: string, anchor = new Date()) {
    const persona = getPersona(personaId);
    if (!persona) throw new Error(`Unknown mock-mail persona: ${personaId}`);
    if (Number.isNaN(anchor.getTime())) throw new Error("Invalid mock-mail anchor date");
    this.persona = persona;
    this.anchor = new Date(anchor);
    this.messages = buildMessages(persona, anchor);
  }

  async getProfile(): Promise<MailboxProfile> {
    return {
      provider: this.provider,
      mailboxId: this.persona.id,
      email: this.persona.email,
      displayName: this.persona.name,
    };
  }

  async listMessages(options: { pageToken?: string; pageSize?: number } = {}): Promise<MailPage> {
    const offset = parseOffset(options.pageToken, this.messages.length);
    const pageSize = Math.max(1, Math.min(100, Math.trunc(options.pageSize ?? 25)));
    const messages = this.messages.slice(offset, offset + pageSize).map((message) => ({ ...message }));
    const nextOffset = offset + messages.length;
    return {
      messages,
      nextPageToken: nextOffset < this.messages.length ? String(nextOffset) : undefined,
    };
  }

  async getMessage(providerMessageId: string): Promise<ArchivedEmail | undefined> {
    const message = this.messages.find((candidate) => candidate.providerMessageId === providerMessageId);
    return message ? { ...message } : undefined;
  }

  async listChanges(afterCursor = "0"): Promise<MailChangePage> {
    const chronological = [...this.messages].sort((a, b) => a.internalDateMs - b.internalDateMs);
    const offset = parseOffset(afterCursor, chronological.length);
    return {
      changes: chronological.slice(offset).map((message, index) => ({
        cursor: String(offset + index + 1),
        type: "upsert" as const,
        providerMessageId: message.providerMessageId,
        message: { ...message },
      })),
      cursor: String(chronological.length),
    };
  }
}
