import { Spectrum } from "spectrum-ts";
import { imessage } from "@spectrum-ts/imessage";
import { OpenRouterClient } from "./ai/openrouter.ts";
import { generateSessionReply } from "./agent/respond.ts";
import {
  recordChatMessage,
  updateProcessingStatus,
} from "./chat/history.ts";
import { openDatabase } from "./db/index.ts";
import { resolveInboundUser, getUser } from "./users/index.ts";
import { handleBountyCommand } from "./bounties/commands.ts";
import { extractBountyDrafts } from "./bounties/extract.ts";
import { runBountyMatching } from "./bounties/match.ts";
import { draftPrompt } from "./bounties/present.ts";
import { loadDemoProfile } from "./demo/profile.ts";

const projectId = process.env.PROJECT_ID ?? "";

if (!projectId || !process.env.PROJECT_SECRET) {
  throw new Error(
    "Missing PROJECT_ID or PROJECT_SECRET. Check the project-local .env file.",
  );
}

// Spectrum bridges a single agent loop to many messaging interfaces.
// Each provider in `providers` adds an interface (terminal TUI, iMessage, …).
// Docs: https://photon.codes/docs/spectrum-ts
const app = await Spectrum({
  projectId,
  projectSecret: process.env.PROJECT_SECRET,
  providers: [
    // imessage
    imessage.config(),
  ],
});
const db = await openDatabase();
const llm = new OpenRouterClient();
const demoProfile = await loadDemoProfile(db);
if (demoProfile) {
  console.log(`Bound stage sender to fixture persona ${demoProfile.userId}.`);
}

const publicDir = new URL("../public/", import.meta.url);
const port = Number.parseInt(process.env.PORT ?? "3000", 10);

const rateLimits = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;
const RATE_LIMIT_MAX = 5;

type Registration = {
  firstName?: unknown;
  lastName?: unknown;
  email?: unknown;
  phone?: unknown;
  consent?: unknown;
};

function json(body: unknown, status = 200) {
  return Response.json(body, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "Content-Security-Policy": "default-src 'none'; frame-ancestors 'none'",
    },
  });
}

function clientKey(request: Request) {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "localhost"
  );
}

function isRateLimited(request: Request) {
  const key = clientKey(request);
  const now = Date.now();
  const current = rateLimits.get(key);

  if (!current || current.resetAt <= now) {
    rateLimits.set(key, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return false;
  }

  current.count += 1;
  return current.count > RATE_LIMIT_MAX;
}

function validateRegistration(input: Registration) {
  const firstName = typeof input.firstName === "string" ? input.firstName.trim() : "";
  const lastName = typeof input.lastName === "string" ? input.lastName.trim() : "";
  const email = typeof input.email === "string" ? input.email.trim().toLowerCase() : "";
  const phone = typeof input.phone === "string" ? input.phone.replace(/[\s()-]/g, "") : "";

  const errors: Record<string, string> = {};
  const namePattern = /^[\p{L}\p{M}][\p{L}\p{M}' .-]{0,59}$/u;

  if (!namePattern.test(firstName)) errors.firstName = "Enter your first name.";
  if (!namePattern.test(lastName)) errors.lastName = "Enter your last name.";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
    errors.email = "Enter a valid email address.";
  }
  if (!/^\+[1-9]\d{7,14}$/.test(phone)) {
    errors.phone = "Use international format, such as +14155551234.";
  }
  if (input.consent !== true) errors.consent = "Consent is required to join.";

  return {
    values: { firstName, lastName, email, phone },
    errors,
  };
}

async function registerUser(request: Request) {
  const contentLength = Number(request.headers.get("content-length") ?? "0");
  if (contentLength > 16_384) return json({ message: "Request is too large." }, 413);

  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) {
    return json({ message: "This form must be submitted from the DNM page." }, 403);
  }

  if (isRateLimited(request)) {
    return json({ message: "Too many attempts. Please try again in ten minutes." }, 429);
  }

  let input: Registration;
  try {
    input = (await request.json()) as Registration;
  } catch {
    return json({ message: "The form could not be read. Please try again." }, 400);
  }

  const { values, errors } = validateRegistration(input);
  if (Object.keys(errors).length > 0) {
    return json({ message: "Please check the highlighted fields.", errors }, 400);
  }

  const process = Bun.spawn(
    [
      "photon",
      "spectrum",
      "users",
      "add",
      "--project",
      projectId,
      "--first-name",
      values.firstName,
      "--last-name",
      values.lastName,
      "--email",
      values.email,
      "--phone",
      values.phone,
      "--invite",
      "--json",
    ],
    { stdout: "pipe", stderr: "pipe" },
  );

  const [exitCode, stdout, stderr] = await Promise.all([
    process.exited,
    new Response(process.stdout).text(),
    new Response(process.stderr).text(),
  ]);

  if (exitCode !== 0) {
    let message = "Photon could not register this number. Check the details and try again.";
    try {
      const parsed = JSON.parse(stdout || stderr) as { error?: { message?: string } };
      if (parsed.error?.message) message = parsed.error.message;
    } catch {
      // Keep the safe, user-facing fallback instead of returning CLI output.
    }
    return json({ message }, 502);
  }

  try {
    const user = JSON.parse(stdout) as { assignedPhoneNumber?: string };
    if (!user.assignedPhoneNumber) throw new Error("Missing assigned phone number");
    return json({
      success: true,
      assignedPhoneNumber: user.assignedPhoneNumber,
      message: "You're registered with Photon. A demo operator must explicitly approve your local DNM access.",
    });
  } catch {
    return json(
      { message: "Registration succeeded, but the assigned number could not be displayed." },
      502,
    );
  }
}

const server = Bun.serve({
  hostname: "127.0.0.1",
  port,
  async fetch(request) {
    const url = new URL(request.url);

    if (request.method === "POST" && url.pathname === "/api/register") {
      return registerUser(request);
    }

    if (request.method !== "GET" && request.method !== "HEAD") {
      return json({ message: "Method not allowed." }, 405);
    }

    const assets: Record<string, { file: string; type: string }> = {
      "/": { file: "index.html", type: "text/html; charset=utf-8" },
      "/styles.css": { file: "styles.css", type: "text/css; charset=utf-8" },
      "/app.js": { file: "app.js", type: "text/javascript; charset=utf-8" },
    };
    const asset = assets[url.pathname];
    if (!asset) return new Response("Not found", { status: 404 });

    return new Response(Bun.file(new URL(asset.file, publicDir)), {
      headers: {
        "Content-Type": asset.type,
        "Cache-Control": "no-store",
        "Content-Security-Policy":
          "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'",
        "Referrer-Policy": "no-referrer",
        "X-Content-Type-Options": "nosniff",
      },
    });
  },
});

console.log(`DNM signup is ready at http://localhost:${server.port}`);

async function deliverPrivateMessage(userId: string, content: string): Promise<void> {
  const user = getUser(db, userId);
  if (!user || user.status !== "active") throw new Error("Active recipient not found");
  const platform = imessage(app);
  const recipient = await platform.user(user.spectrumSenderId);
  const directMessage = await platform.space.create(recipient);
  await directMessage.send(content);
}

let matching = false;
async function matchAndDeliver(): Promise<void> {
  if (matching) return;
  matching = true;
  try {
    const result = await runBountyMatching(db, llm, {
      askHelper: ({ helperUserId, text }) => deliverPrivateMessage(helperUserId, text),
    });
    console.log(`Bounty match run: open=${result.openBountiesScanned} scored=${result.helperPairsScored} asked=${result.asksSucceeded} failed=${result.asksFailed}`);
  } catch (error) {
    console.error("Bounty matching failed.", error instanceof Error ? error.message : error);
  } finally { matching = false; }
}

async function runMessageLoop() {
  for await (const [space, message] of app.messages) {
    if (message.direction !== "inbound" || message.content.type !== "text") continue;
    if (!imessage.is(message) || imessage(space).type !== "dm") continue;

    const senderId = message.sender?.id;
    const inboundText = message.content.text;
    const user = resolveInboundUser(db, {
      direction: message.direction, contentType: message.content.type, platform: message.platform,
      spaceType: imessage(space).type, senderId,
    });
    if (!user) {
      await space.send("This private demo is limited to explicitly allowlisted users.").catch(() => undefined);
      continue;
    }

    const inserted = recordChatMessage(db, {
      userId: user.id,
      providerMessageId: message.id,
      conversationId: space.id,
      senderId: senderId!,
      direction: "inbound",
      content: inboundText,
      occurredAt: message.timestamp.toISOString(),
    });
    if (!inserted) continue;

    updateProcessingStatus(db, user.id, message.id, "processing");
    try {
      await space.responding(async () => {
        const command = await handleBountyCommand(
          db, user.id, inboundText, deliverPrivateMessage,
        );
        let reply = command.reply;
        if (!command.handled) {
          reply = await generateSessionReply(db, llm, user.id, space.id);
          const extraction = await extractBountyDrafts(db, llm, user.id);
          if (extraction.created[0]) reply += `\n\n${draftPrompt(extraction.created[0])}`;
        }
        if (!reply) throw new Error("No reply was produced");
        const outbound = await space.send(reply);
        recordChatMessage(db, {
          userId: user.id,
          providerMessageId: outbound?.id ?? `reply:${message.id}`,
          conversationId: space.id,
          senderId: outbound?.sender?.id ?? "dnm",
          direction: "outbound",
          content: reply,
          occurredAt: outbound?.timestamp.toISOString(),
          processingStatus: "processed",
        });
      });
      updateProcessingStatus(db, user.id, message.id, "processed");
      if (/^post(?:\s+\d+)?$/i.test(inboundText.trim())) void matchAndDeliver();
    } catch (error) {
      updateProcessingStatus(
        db,
        user.id,
        message.id,
        "failed",
        error instanceof Error ? error.name : "UnknownError",
      );
      console.error("Could not answer an iMessage.", error);
      try {
        await space.send("Sorry, I couldn't answer that right now. Please try again.");
      } catch (sendError) {
        console.error("Could not send the iMessage error response.", sendError);
      }
    }
  }
}

runMessageLoop().catch((error) => {
  console.error("The iMessage listener stopped.", error);
});

const matchIntervalMs = Number.parseInt(process.env.DNM_BOUNTY_INTERVAL_MS ?? "0", 10);
if (Number.isFinite(matchIntervalMs) && matchIntervalMs >= 60_000) {
  setInterval(() => void matchAndDeliver(), matchIntervalMs);
  void matchAndDeliver();
}
