import { unlink } from "node:fs/promises";

const credentialsPath = process.env.GOOGLE_OAUTH_CREDENTIALS_FILE;
const redirectUri = process.env.GOOGLE_OAUTH_REDIRECT_URI;
const scope = process.env.GOOGLE_OAUTH_SCOPE ?? "https://www.googleapis.com/auth/gmail.readonly";
const port = Number(process.env.PORT ?? 3000);
const tokenPath = ".gmail-token.json";

interface GoogleWebCredentials {
  client_id: string;
  client_secret: string;
  auth_uri: string;
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
  refresh_token?: string;
  scope?: string;
}

interface GmailMessageList {
  messages?: Array<{ id: string }>;
}

interface GmailMessage {
  id: string;
  payload?: {
    headers?: Array<{ name: string; value: string }>;
  };
}

const pendingStates = new Map<string, number>();

async function loadCredentials(): Promise<GoogleWebCredentials> {
  if (!credentialsPath || !redirectUri) {
    throw new Error("Google OAuth environment variables are not configured");
  }

  const document = (await Bun.file(credentialsPath).json()) as {
    web?: GoogleWebCredentials;
  };
  if (!document.web) throw new Error("Google credential file does not contain a web OAuth client");
  return document.web;
}

async function loadTokens(): Promise<StoredTokens | undefined> {
  const file = Bun.file(tokenPath);
  if (!(await file.exists())) return undefined;
  return (await file.json()) as StoredTokens;
}

async function saveTokens(tokens: StoredTokens): Promise<void> {
  await Bun.write(tokenPath, `${JSON.stringify(tokens, null, 2)}\n`);
  await Bun.$`chmod 600 ${tokenPath}`.quiet();
}

async function exchangeCode(code: string): Promise<StoredTokens> {
  const credentials = await loadCredentials();
  const response = await fetch(credentials.token_uri, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: credentials.client_id,
      client_secret: credentials.client_secret,
      redirect_uri: redirectUri!,
      grant_type: "authorization_code",
    }),
  });
  if (!response.ok) throw new Error(`OAuth token exchange failed (${response.status})`);
  const token = (await response.json()) as TokenResponse;
  return {
    access_token: token.access_token,
    refresh_token: token.refresh_token,
    expires_at: Date.now() + token.expires_in * 1000,
    scope: token.scope,
  };
}

async function accessToken(): Promise<{ token: string; stored: StoredTokens }> {
  const stored = await loadTokens();
  if (!stored) throw new Error("Gmail is not connected");
  if (stored.expires_at > Date.now() + 60_000) return { token: stored.access_token, stored };
  if (!stored.refresh_token) throw new Error("Google did not return a refresh token; reconnect Gmail");

  const credentials = await loadCredentials();
  const response = await fetch(credentials.token_uri, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: credentials.client_id,
      client_secret: credentials.client_secret,
      refresh_token: stored.refresh_token,
      grant_type: "refresh_token",
    }),
  });
  if (!response.ok) throw new Error(`OAuth token refresh failed (${response.status})`);
  const refreshed = (await response.json()) as TokenResponse;
  const next = {
    ...stored,
    access_token: refreshed.access_token,
    expires_at: Date.now() + refreshed.expires_in * 1000,
  };
  await saveTokens(next);
  return { token: next.access_token, stored: next };
}

async function gmailJson<T>(path: string, token: string): Promise<T> {
  const response = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me${path}`, {
    headers: { authorization: `Bearer ${token}` },
  });
  if (!response.ok) throw new Error(`Gmail request failed (${response.status})`);
  return (await response.json()) as T;
}

function header(message: GmailMessage, name: string): string {
  return message.payload?.headers?.find((item) => item.name.toLowerCase() === name.toLowerCase())?.value ?? "";
}

function json(data: unknown, status = 200): Response {
  return Response.json(data, { status });
}

const page = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>DNM Gmail</title>
  <style>
    :root { color-scheme: dark; font-family: ui-sans-serif, system-ui, sans-serif; }
    body { margin: 0; min-height: 100vh; display: grid; place-items: center; background: #10120f; color: #f3f4ed; }
    main { width: min(680px, calc(100% - 40px)); padding: 42px; border: 1px solid #34382f; border-radius: 24px; background: #191c17; box-shadow: 0 24px 80px #0008; }
    h1 { margin: 0 0 10px; font-size: 42px; letter-spacing: -1.5px; }
    p { color: #b9beaF; line-height: 1.55; }
    button, a.button { display: inline-block; border: 0; border-radius: 999px; padding: 12px 20px; background: #d9ff63; color: #151713; font-weight: 700; text-decoration: none; cursor: pointer; }
    button.secondary { background: #30352b; color: #f3f4ed; }
    #account { color: #d9ff63; }
    ul { padding: 0; list-style: none; }
    li { padding: 14px 0; border-top: 1px solid #30352b; }
    li strong, li span { display: block; }
    li span { margin-top: 4px; color: #92998a; font-size: 14px; }
    .actions { display: flex; gap: 10px; margin-top: 24px; }
  </style>
</head>
<body>
  <main>
    <h1>DNM</h1>
    <p id="status">Checking Gmail connection…</p>
    <div id="disconnected" hidden><a class="button" href="/oauth/google">Connect Gmail</a></div>
    <div id="connected" hidden>
      <p>Connected as <strong id="account"></strong>. Recent email metadata:</p>
      <ul id="messages"><li>Loading…</li></ul>
      <div class="actions"><button class="secondary" id="disconnect">Disconnect</button></div>
    </div>
  </main>
  <script>
    const status = document.querySelector('#status');
    const disconnected = document.querySelector('#disconnected');
    const connected = document.querySelector('#connected');
    const account = document.querySelector('#account');
    const messages = document.querySelector('#messages');

    async function load() {
      const state = await fetch('/api/gmail/status').then(r => r.json());
      if (!state.connected) {
        status.textContent = 'Connect Gmail to verify read-only access.';
        disconnected.hidden = false;
        return;
      }
      status.textContent = 'Gmail access is working.';
      connected.hidden = false;
      account.textContent = state.email;
      const recent = await fetch('/api/gmail/recent').then(r => r.json());
      messages.replaceChildren();
      for (const item of recent.messages ?? []) {
        const li = document.createElement('li');
        const title = document.createElement('strong');
        const meta = document.createElement('span');
        title.textContent = item.subject || '(no subject)';
        meta.textContent = [item.from, item.date].filter(Boolean).join(' · ');
        li.append(title, meta);
        messages.append(li);
      }
    }
    document.querySelector('#disconnect').addEventListener('click', async () => {
      await fetch('/api/gmail/disconnect', { method: 'POST' });
      location.reload();
    });
    load().catch(error => { status.textContent = error.message; });
  </script>
</body>
</html>`;

export function startWebServer(): void {
  Bun.serve({
    port,
    async fetch(request) {
      const url = new URL(request.url);
      try {
        if (url.pathname === "/") return new Response(page, { headers: { "content-type": "text/html; charset=utf-8" } });

        if (url.pathname === "/oauth/google") {
          const credentials = await loadCredentials();
          const state = crypto.randomUUID();
          pendingStates.set(state, Date.now() + 10 * 60_000);
          const authorize = new URL(credentials.auth_uri);
          authorize.search = new URLSearchParams({
            client_id: credentials.client_id,
            redirect_uri: redirectUri!,
            response_type: "code",
            scope,
            access_type: "offline",
            prompt: "consent",
            include_granted_scopes: "true",
            state,
          }).toString();
          return Response.redirect(authorize.toString());
        }

        if (url.pathname === "/oauth/google/callback") {
          const state = url.searchParams.get("state");
          const code = url.searchParams.get("code");
          const expiresAt = state ? pendingStates.get(state) : undefined;
          if (!state || !code || !expiresAt || expiresAt < Date.now()) return new Response("Invalid or expired OAuth state", { status: 400 });
          pendingStates.delete(state);
          const tokens = await exchangeCode(code);
          const profile = await gmailJson<{ emailAddress: string }>("/profile", tokens.access_token);
          tokens.email = profile.emailAddress;
          await saveTokens(tokens);
          return Response.redirect(new URL("/?connected=1", url).toString());
        }

        if (url.pathname === "/api/gmail/status") {
          const tokens = await loadTokens();
          return json({ connected: Boolean(tokens), email: tokens?.email });
        }

        if (url.pathname === "/api/gmail/recent") {
          const { token } = await accessToken();
          const list = await gmailJson<GmailMessageList>("/messages?maxResults=10&includeSpamTrash=false&q=newer_than%3A90d", token);
          const messages = await Promise.all((list.messages ?? []).map(({ id }) =>
            gmailJson<GmailMessage>(`/messages/${encodeURIComponent(id)}?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date`, token),
          ));
          return json({ messages: messages.map((message) => ({
            id: message.id,
            from: header(message, "From"),
            subject: header(message, "Subject"),
            date: header(message, "Date"),
          })) });
        }

        if (url.pathname === "/api/gmail/disconnect" && request.method === "POST") {
          const tokens = await loadTokens();
          if (tokens) await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(tokens.refresh_token ?? tokens.access_token)}`, { method: "POST" });
          await unlink(tokenPath).catch(() => undefined);
          return json({ disconnected: true });
        }

        return new Response("Not found", { status: 404 });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unexpected error";
        console.error("[web]", message);
        return json({ error: message }, 500);
      }
    },
  });
  console.log(`[web] DNM is available at http://localhost:${port}`);
}
