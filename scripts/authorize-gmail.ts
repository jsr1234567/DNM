import { randomBytes } from "node:crypto";
import { spawnSync } from "node:child_process";

const clientId =
  process.env.GOOGLE_GMAIL_CLIENT_ID?.trim() ||
  process.env.PERSONAL_GOOGLE_CLIENT_ID?.trim();
const clientSecret =
  process.env.GOOGLE_GMAIL_CLIENT_SECRET?.trim() ||
  process.env.PERSONAL_GOOGLE_CLIENT_SECRET?.trim();

if (!clientId || !clientSecret) {
  throw new Error("The project is missing its approved Google OAuth client credentials.");
}

const port = 53682;
const redirectUri = `http://127.0.0.1:${port}/oauth2/callback`;
const state = randomBytes(24).toString("base64url");
const authorizationUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
authorizationUrl.search = new URLSearchParams({
  client_id: clientId,
  redirect_uri: redirectUri,
  response_type: "code",
  scope: "https://www.googleapis.com/auth/gmail.readonly",
  access_type: "offline",
  prompt: "consent",
  include_granted_scopes: "true",
  state,
}).toString();

let finish!: () => void;
const completed = new Promise<void>((resolve) => {
  finish = resolve;
});

const server = Bun.serve({
  hostname: "127.0.0.1",
  port,
  async fetch(request) {
    const url = new URL(request.url);
    if (url.pathname !== "/oauth2/callback") return new Response("Not found", { status: 404 });
    if (url.searchParams.get("state") !== state) {
      return new Response("The OAuth state did not match. Close this tab and try again.", { status: 400 });
    }
    const code = url.searchParams.get("code");
    if (!code) {
      const reason = url.searchParams.get("error") || "authorization was not completed";
      setTimeout(finish, 50);
      return new Response(`Gmail authorization stopped: ${reason}. You can close this tab.`, {
        status: 400,
      });
    }

    try {
      const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          client_id: clientId,
          client_secret: clientSecret,
          code,
          grant_type: "authorization_code",
          redirect_uri: redirectUri,
        }),
      });
      const token = (await tokenResponse.json()) as {
        error?: string;
        refresh_token?: string;
      };
      if (!tokenResponse.ok || !token.refresh_token) {
        throw new Error(token.error || "Google did not return a refresh token");
      }

      const stored = spawnSync(
        "/Users/js/keys/bin/vault-admin",
        ["create", "GOOGLE_GMAIL_REFRESH_TOKEN"],
        { input: token.refresh_token, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] },
      );
      if (stored.status !== 0) {
        throw new Error(stored.stderr?.trim() || "The refresh token could not be stored safely");
      }
      const provisioned = spawnSync(
        "node",
        [
          "/Users/js/keys/bin/provision-project-env.mjs",
          "--confirm",
          "--project",
          "/Users/js/dnm",
          "--project-id",
          "dnm",
          "GOOGLE_GMAIL_REFRESH_TOKEN",
        ],
        { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
      );
      if (provisioned.status !== 0) {
        throw new Error(provisioned.stderr?.trim() || "The refresh token could not be provisioned");
      }

      return new Response(
        "Gmail read-only access is connected and the refresh token is protected in Keychain. You can close this tab.",
        { headers: { "Content-Type": "text/plain; charset=utf-8" } },
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : "Authorization failed";
      return new Response(`Gmail authorization failed: ${message}. You can close this tab.`, {
        status: 500,
      });
    } finally {
      setTimeout(finish, 50);
    }
  },
});

console.log(`GMAIL_AUTH_URL=${authorizationUrl}`);
await completed;
server.stop(true);
