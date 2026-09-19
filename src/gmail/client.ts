import { chmod } from "node:fs/promises";
import { resolve } from "node:path";
import { ensurePrivateDataDir, gmailTokenPath } from "../config.ts";

interface GoogleWebCredentials {
  client_id: string;
  client_secret: string;
  token_uri: string;
}

interface StoredTokens {
  access_token: string;
  refresh_token?: string;
  expires_at: number;
  scope?: string;
  email?: string;
}

interface TokenResponse {
  access_token: string;
  expires_in: number;
  scope?: string;
}

const legacyTokenPath = resolve(".gmail-token.json");

async function existingTokenPath(): Promise<string> {
  if (await Bun.file(gmailTokenPath).exists()) return gmailTokenPath;
  // Compatibility with the existing OAuth UI. New connections should use .data/.
  if (await Bun.file(legacyTokenPath).exists()) return legacyTokenPath;
  return gmailTokenPath;
}

async function loadCredentials(): Promise<GoogleWebCredentials> {
  const path = process.env.GOOGLE_OAUTH_CREDENTIALS_FILE;
  if (!path) throw new Error("GOOGLE_OAUTH_CREDENTIALS_FILE is not configured");
  const document = (await Bun.file(path).json()) as { web?: GoogleWebCredentials };
  if (!document.web) throw new Error("Google credential file does not contain a web OAuth client");
  return document.web;
}

async function loadTokens(): Promise<{ tokens: StoredTokens; path: string }> {
  const path = await existingTokenPath();
  const file = Bun.file(path);
  if (!(await file.exists())) throw new Error("Gmail is not connected; complete local OAuth first");
  return { tokens: (await file.json()) as StoredTokens, path };
}

async function saveTokens(path: string, tokens: StoredTokens): Promise<void> {
  await ensurePrivateDataDir();
  await Bun.write(path, `${JSON.stringify(tokens, null, 2)}\n`);
  await chmod(path, 0o600);
}

export async function gmailAccess(): Promise<{ token: string; mailboxEmail?: string }> {
  const { tokens, path } = await loadTokens();
  if (tokens.expires_at > Date.now() + 60_000) {
    return { token: tokens.access_token, mailboxEmail: tokens.email };
  }
  if (!tokens.refresh_token) throw new Error("Google did not return a refresh token; reconnect Gmail");

  const credentials = await loadCredentials();
  const response = await fetch(credentials.token_uri, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: credentials.client_id,
      client_secret: credentials.client_secret,
      refresh_token: tokens.refresh_token,
      grant_type: "refresh_token",
    }),
  });
  if (!response.ok) throw new Error(`OAuth token refresh failed (${response.status})`);
  const refreshed = (await response.json()) as TokenResponse;
  const next: StoredTokens = {
    ...tokens,
    access_token: refreshed.access_token,
    expires_at: Date.now() + refreshed.expires_in * 1000,
    scope: refreshed.scope ?? tokens.scope,
  };
  await saveTokens(path, next);
  return { token: next.access_token, mailboxEmail: next.email };
}

export async function gmailJson<T>(path: string, token: string): Promise<T> {
  const response = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me${path}`, {
    headers: { authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) {
    const code = response.status === 401 || response.status === 403 ? "authorization" :
      response.status === 429 ? "rate-limit" : "request";
    throw new Error(`Gmail ${code} failure (${response.status})`);
  }
  return (await response.json()) as T;
}
