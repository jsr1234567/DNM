import type { Database } from "bun:sqlite";
import { archiveEmail } from "../email/archive.ts";
import { setSetting } from "../db/settings.ts";
import { gmailAccess, gmailJson } from "./client.ts";

interface GmailListResponse {
  messages?: Array<{ id: string; threadId: string }>;
  nextPageToken?: string;
  resultSizeEstimate?: number;
}

interface GmailPart {
  mimeType?: string;
  filename?: string;
  headers?: Array<{ name: string; value: string }>;
  body?: { data?: string; size?: number };
  parts?: GmailPart[];
}

interface GmailMessage {
  id: string;
  threadId: string;
  labelIds?: string[];
  snippet?: string;
  internalDate?: string;
  payload?: GmailPart;
}

interface GmailProfile {
  emailAddress: string;
}

export interface GmailImportOptions {
  confirmedMailbox: string;
  days?: number;
  limit?: number;
  batchSize?: number;
}

export interface GmailImportResult {
  mailboxEmail: string;
  importedCount: number;
  startedAt: string;
  completedAt: string;
  query: string;
}

function header(part: GmailPart | undefined, name: string): string {
  return part?.headers?.find((item) => item.name.toLowerCase() === name.toLowerCase())?.value ?? "";
}

function addressList(value: string): string[] {
  return value.split(/,(?=(?:[^\"]*\"[^\"]*\")*[^\"]*$)/).map((item) => item.trim()).filter(Boolean);
}

function decodeBase64Url(data: string): string {
  return Buffer.from(data, "base64url").toString("utf8");
}

function decodeHtmlEntities(html: string): string {
  const entities: Record<string, string> = {
    amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ",
  };
  return html.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, entity: string) => {
    if (entity.startsWith("#x")) return String.fromCodePoint(Number.parseInt(entity.slice(2), 16));
    if (entity.startsWith("#")) return String.fromCodePoint(Number.parseInt(entity.slice(1), 10));
    return entities[entity.toLowerCase()] ?? match;
  });
}

function htmlToText(html: string): string {
  return decodeHtmlEntities(
    html
      .replace(/<(script|style|head|svg)[^>]*>[\s\S]*?<\/\1>/gi, " ")
      .replace(/<(br|\/p|\/div|\/li|\/tr|\/h[1-6])\b[^>]*>/gi, "\n")
      .replace(/<[^>]+>/g, " "),
  );
}

function collectBodies(part: GmailPart | undefined, target: { plain: string[]; html: string[] }): void {
  if (!part) return;
  if (!part.filename && part.body?.data) {
    if (part.mimeType === "text/plain") target.plain.push(decodeBase64Url(part.body.data));
    if (part.mimeType === "text/html") target.html.push(htmlToText(decodeBase64Url(part.body.data)));
  }
  for (const child of part.parts ?? []) collectBodies(child, target);
}

export function normalizeEmailBody(message: GmailMessage): string {
  const bodies = { plain: [] as string[], html: [] as string[] };
  collectBodies(message.payload, bodies);
  const raw = (bodies.plain.length > 0 ? bodies.plain : bodies.html).join("\n\n");
  const withoutQuotes = raw
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .filter((line) => !/^\s*>/.test(line))
    .join("\n")
    .split(/\nOn .{0,240}wrote:\s*\n/i)[0] ?? "";
  return withoutQuotes.replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}

function errorCode(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  if (message.includes("authorization")) return "authorization";
  if (message.includes("rate-limit")) return "rate-limit";
  if (message.includes("timeout")) return "timeout";
  return "import-error";
}

export async function importRecentGmail(db: Database, options: GmailImportOptions): Promise<GmailImportResult> {
  const days = Math.max(1, Math.min(365, Math.trunc(options.days ?? 30)));
  const limit = Math.max(1, Math.min(500, Math.trunc(options.limit ?? 500)));
  const batchSize = Math.max(1, Math.min(20, Math.trunc(options.batchSize ?? 10)));
  const startedAt = new Date().toISOString();
  const query = `newer_than:${days}d -in:spam -in:trash`;
  const { token } = await gmailAccess();
  const profile = await gmailJson<GmailProfile>("/profile", token);
  const mailboxEmail = profile.emailAddress.toLowerCase();
  if (options.confirmedMailbox.trim().toLowerCase() !== mailboxEmail) {
    throw new Error(`Connected mailbox does not match --confirm-mailbox (${mailboxEmail})`);
  }

  const run = db.query(`
    INSERT INTO import_runs(mailbox_email, status, query, requested_limit, started_at)
    VALUES (?, 'running', ?, ?, ?)
  `).run(mailboxEmail, query, limit, startedAt);
  const runId = Number(run.lastInsertRowid);
  let importedCount = 0;

  try {
    const ids: string[] = [];
    let pageToken: string | undefined;
    while (ids.length < limit) {
      const params = new URLSearchParams({
        maxResults: String(Math.min(100, limit - ids.length)),
        includeSpamTrash: "false",
        q: query,
      });
      if (pageToken) params.set("pageToken", pageToken);
      const page = await gmailJson<GmailListResponse>(`/messages?${params}`, token);
      ids.push(...(page.messages ?? []).map((message) => message.id));
      pageToken = page.nextPageToken;
      if (!pageToken) break;
    }

    for (let offset = 0; offset < ids.length; offset += batchSize) {
      const batch = ids.slice(offset, offset + batchSize);
      const messages = await Promise.all(batch.map((id) =>
        gmailJson<GmailMessage>(`/messages/${encodeURIComponent(id)}?format=full`, token),
      ));
      for (const message of messages) {
        const body = normalizeEmailBody(message);
        archiveEmail(db, {
          providerMessageId: message.id,
          providerThreadId: message.threadId,
          mailboxEmail,
          rfcMessageId: header(message.payload, "Message-ID") || undefined,
          sentAt: header(message.payload, "Date") || undefined,
          internalDateMs: Number(message.internalDate ?? 0),
          sender: header(message.payload, "From"),
          recipients: addressList(header(message.payload, "To")),
          cc: addressList(header(message.payload, "Cc")),
          bcc: addressList(header(message.payload, "Bcc")),
          subject: header(message.payload, "Subject"),
          normalizedBody: body,
          snippet: message.snippet ?? "",
          labels: message.labelIds ?? [],
        });
        importedCount += 1;
      }
      db.query("UPDATE import_runs SET imported_count = ? WHERE id = ?").run(importedCount, runId);
    }

    const completedAt = new Date().toISOString();
    db.query(`
      UPDATE import_runs SET status = 'complete', imported_count = ?, completed_at = ? WHERE id = ?
    `).run(importedCount, completedAt, runId);
    setSetting(db, "demo_owner", { mailboxEmail, confirmedAt: startedAt });
    setSetting(db, "gmail_snapshot", {
      mailboxEmail, query, importedCount, startedAt, completedAt, complete: true,
    });
    return { mailboxEmail, importedCount, startedAt, completedAt, query };
  } catch (error) {
    const completedAt = new Date().toISOString();
    db.query(`
      UPDATE import_runs SET status = ?, imported_count = ?, completed_at = ?, error_code = ? WHERE id = ?
    `).run(importedCount > 0 ? "partial" : "failed", importedCount, completedAt, errorCode(error), runId);
    setSetting(db, "gmail_snapshot", {
      mailboxEmail, query, importedCount, startedAt, completedAt, complete: false,
    });
    throw error;
  }
}
