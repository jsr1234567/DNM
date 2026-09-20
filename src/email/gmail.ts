import type { FroggieRepository } from "../core/repository.ts";
import type { EmailMessageInput } from "../core/types.ts";

const GMAIL_API = "https://gmail.googleapis.com/gmail/v1";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const DEFAULT_POLL_SECONDS = 30;
const WATCH_OVERLAP_SECONDS = 60;

type GmailHeader = { name?: string; value?: string };
type GmailPart = {
  mimeType?: string;
  body?: { data?: string };
  parts?: GmailPart[];
};
type GmailMessage = {
  id?: string;
  threadId?: string;
  internalDate?: string;
  payload?: GmailPart & { headers?: GmailHeader[] };
};

export type GmailWatchConfig = {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
  senderAddress: string;
  ownerId: string;
  pollSeconds: number;
};

export function gmailWatchConfiguration(
  environment: Record<string, string | undefined> = process.env,
): { configured: true; config: GmailWatchConfig } | { configured: false; missing: string[] } {
  const required = {
    GOOGLE_GMAIL_CLIENT_ID:
      environment.GOOGLE_GMAIL_CLIENT_ID?.trim() || environment.PERSONAL_GOOGLE_CLIENT_ID?.trim(),
    GOOGLE_GMAIL_CLIENT_SECRET:
      environment.GOOGLE_GMAIL_CLIENT_SECRET?.trim() || environment.PERSONAL_GOOGLE_CLIENT_SECRET?.trim(),
    GOOGLE_GMAIL_REFRESH_TOKEN: environment.GOOGLE_GMAIL_REFRESH_TOKEN?.trim(),
    FROGGIE_GMAIL_FROM: environment.FROGGIE_GMAIL_FROM?.trim().toLowerCase(),
  };
  const missing = Object.entries(required)
    .filter(([, value]) => !value)
    .map(([name]) => name);
  if (missing.length > 0) return { configured: false, missing };

  const requestedPollSeconds = Number.parseInt(
    environment.FROGGIE_GMAIL_POLL_SECONDS ?? String(DEFAULT_POLL_SECONDS),
    10,
  );
  return {
    configured: true,
    config: {
      clientId: required.GOOGLE_GMAIL_CLIENT_ID!,
      clientSecret: required.GOOGLE_GMAIL_CLIENT_SECRET!,
      refreshToken: required.GOOGLE_GMAIL_REFRESH_TOKEN!,
      senderAddress: required.FROGGIE_GMAIL_FROM!,
      ownerId: environment.FROGGIE_GMAIL_OWNER_ID?.trim() || "demo-margaret",
      pollSeconds: Number.isFinite(requestedPollSeconds)
        ? Math.max(15, requestedPollSeconds)
        : DEFAULT_POLL_SECONDS,
    },
  };
}

function decodeBase64Url(value: string): string {
  return Buffer.from(value, "base64url").toString("utf8");
}

function plainText(part: GmailPart | undefined): string {
  if (!part) return "";
  if (part.mimeType === "text/plain" && part.body?.data) return decodeBase64Url(part.body.data);
  for (const child of part.parts ?? []) {
    const text = plainText(child);
    if (text) return text;
  }
  return "";
}

function header(headers: GmailHeader[] | undefined, name: string): string {
  return headers?.find((item) => item.name?.toLowerCase() === name.toLowerCase())?.value?.trim() ?? "";
}

export function addressFromHeader(value: string): string {
  const bracketed = value.match(/<([^>]+)>/);
  return (bracketed?.[1] ?? value).trim().toLowerCase();
}

function addressesFromHeader(value: string): string[] {
  return value
    .split(",")
    .map(addressFromHeader)
    .filter(Boolean);
}

export function toEmailInput(message: GmailMessage, ownerId: string): EmailMessageInput | undefined {
  if (!message.id || !message.threadId || !message.payload) return undefined;
  const headers = message.payload.headers;
  const bodyText = plainText(message.payload).trim();
  if (!bodyText) return undefined;
  const timestamp = Number(message.internalDate);
  return {
    ownerId,
    providerMessageId: `gmail:${message.id}`,
    threadId: message.threadId,
    fromAddress: addressFromHeader(header(headers, "from")),
    toAddresses: addressesFromHeader(header(headers, "to")),
    subject: header(headers, "subject") || "(no subject)",
    bodyText,
    sentAt: Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : new Date().toISOString(),
    source: "gmail",
  };
}

async function responseJson<T>(response: Response): Promise<T> {
  if (!response.ok) throw new Error(`Gmail request failed with status ${response.status}.`);
  return response.json() as Promise<T>;
}

async function accessToken(config: GmailWatchConfig): Promise<string> {
  const body = new URLSearchParams({
    client_id: config.clientId,
    client_secret: config.clientSecret,
    refresh_token: config.refreshToken,
    grant_type: "refresh_token",
  });
  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const result = await responseJson<{ access_token?: string }>(response);
  if (!result.access_token) throw new Error("Google did not return a Gmail access token.");
  return result.access_token;
}

async function gmailGet<T>(path: string, token: string): Promise<T> {
  const response = await fetch(`${GMAIL_API}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return responseJson<T>(response);
}

export async function pollGmailOnce(
  repository: FroggieRepository,
  config: GmailWatchConfig,
  onEmail: (email: EmailMessageInput) => Promise<void>,
  now = new Date(),
): Promise<{ initialized: boolean; imported: number }> {
  const watchId = `gmail:${config.ownerId}:${config.senderAddress}`;
  const lastCheckedAt = repository.getMailboxLastCheckedAt(watchId);
  if (!lastCheckedAt) {
    repository.setMailboxLastCheckedAt(watchId, now.toISOString());
    return { initialized: true, imported: 0 };
  }

  const token = await accessToken(config);
  const after = Math.max(
    0,
    Math.floor(new Date(lastCheckedAt).getTime() / 1000) - WATCH_OVERLAP_SECONDS,
  );
  const query = encodeURIComponent(
    `from:${config.senderAddress} after:${after} -in:spam -in:trash`,
  );
  const listing = await gmailGet<{ messages?: Array<{ id?: string }> }>(
    `/users/me/messages?maxResults=25&q=${query}`,
    token,
  );

  const messages: EmailMessageInput[] = [];
  for (const item of listing.messages ?? []) {
    if (!item.id || repository.hasEmailProviderMessage(`gmail:${item.id}`)) continue;
    const raw = await gmailGet<GmailMessage>(
      `/users/me/messages/${encodeURIComponent(item.id)}?format=full`,
      token,
    );
    const email = toEmailInput(raw, config.ownerId);
    if (!email || email.fromAddress !== config.senderAddress) continue;
    messages.push(email);
  }

  messages.sort((left, right) => Date.parse(left.sentAt) - Date.parse(right.sentAt));
  for (const email of messages) await onEmail(email);
  repository.setMailboxLastCheckedAt(watchId, now.toISOString());
  return { initialized: false, imported: messages.length };
}

export function startGmailWatcher(
  repository: FroggieRepository,
  config: GmailWatchConfig,
  onEmail: (email: EmailMessageInput) => Promise<void>,
): () => void {
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const schedule = () => {
    if (!stopped) timer = setTimeout(run, config.pollSeconds * 1000);
  };
  const run = async () => {
    try {
      await pollGmailOnce(repository, config, onEmail);
    } catch (error) {
      const detail = error instanceof Error ? error.message : "Unknown Gmail error";
      console.error(`Gmail watcher could not complete a poll: ${detail}`);
    } finally {
      schedule();
    }
  };

  void run();
  return () => {
    stopped = true;
    if (timer) clearTimeout(timer);
  };
}
