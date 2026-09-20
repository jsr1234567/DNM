import type { FroggieRepository } from "../core/repository.ts";
import { ingestEmailForSuggestions } from "../core/email-intake.ts";
import { HELP_MODES, SKILL_CATEGORIES } from "../core/types.ts";
import type {
  HelpMode,
  HelpSuggestion,
  LeaderboardVisibility,
  SkillCategory,
} from "../core/types.ts";

type JsonObject = Record<string, unknown>;

function json(body: unknown, status = 200): Response {
  return Response.json(body, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "Content-Security-Policy": "default-src 'none'; frame-ancestors 'none'",
    },
  });
}

async function readJson(request: Request): Promise<JsonObject> {
  const contentLength = Number(request.headers.get("content-length") ?? "0");
  if (contentLength > 32_768) throw new Error("Request is too large.");
  return (await request.json()) as JsonObject;
}

function text(input: unknown, name: string): string {
  if (typeof input !== "string" || !input.trim()) throw new Error(`${name} is required.`);
  return input.trim();
}

function isCategory(value: unknown): value is SkillCategory {
  return SKILL_CATEGORIES.includes(value as SkillCategory);
}

function isHelpMode(value: unknown): value is HelpMode {
  return HELP_MODES.includes(value as HelpMode);
}

/**
 * Local-demo API. Identity is explicit in each request body so the frontend
 * contract is testable; production authentication is intentionally out of scope.
 */
export async function handleCommunityApi(
  request: Request,
  url: URL,
  repository: FroggieRepository,
  options: {
    onSuggestion?: (suggestion: HelpSuggestion) => Promise<boolean>;
  } = {},
): Promise<Response | undefined> {
  if (!url.pathname.startsWith("/api/community/")) return undefined;

  try {
    if (request.method === "GET" && url.pathname === "/api/community/meta") {
      return json({
        skills: SKILL_CATEGORIES,
        requestModes: HELP_MODES,
        helperModes: ["remote", "in_person", "both"],
        requestStatuses: [
          "open",
          "claimed",
          "in_progress",
          "awaiting_confirmation",
          "completed",
        ],
      });
    }

    if (request.method === "GET" && url.pathname === "/api/community/requests") {
      return json({ requests: repository.listOpenRequests(url.searchParams.get("community") ?? undefined) });
    }

    if (request.method === "GET" && url.pathname === "/api/community/leaderboard") {
      return json({ leaderboard: repository.leaderboard() });
    }

    if (request.method === "GET" && url.pathname === "/api/community/suggestions") {
      const participantId = text(url.searchParams.get("participantId"), "participantId");
      return json({ suggestions: repository.listPendingSuggestions(participantId) });
    }

    if (request.method === "POST" && url.pathname === "/api/community/emails/import") {
      const body = await readJson(request);
      const ownerId = text(body.ownerId, "ownerId");
      if (!repository.findParticipantById(ownerId)) throw new Error("Email owner was not found.");
      const toAddresses = Array.isArray(body.toAddresses)
        ? body.toAddresses.map((value) => text(value, "toAddress"))
        : [];
      const sentAt = text(body.sentAt, "sentAt");
      if (Number.isNaN(Date.parse(sentAt))) throw new Error("sentAt must be an ISO date.");

      const { suggestions } = ingestEmailForSuggestions(repository, {
        ownerId,
        providerMessageId: text(body.providerMessageId, "providerMessageId"),
        threadId: text(body.threadId, "threadId"),
        fromAddress: text(body.fromAddress, "fromAddress"),
        toAddresses,
        subject: text(body.subject, "subject"),
        bodyText: text(body.bodyText, "bodyText"),
        sentAt,
        source: body.source === "fixture" ? "fixture" : "gmail",
      });

      let notificationsSent = 0;
      for (const suggestion of suggestions) {
        if (options.onSuggestion && await options.onSuggestion(suggestion)) notificationsSent += 1;
      }
      return json({ suggestions, notificationsSent }, 201);
    }

    if (request.method === "POST" && url.pathname === "/api/community/participants") {
      const body = await readJson(request);
      const visibility = body.leaderboardVisibility ?? "anonymous";
      if (visibility !== "public" && visibility !== "anonymous") {
        throw new Error("leaderboardVisibility must be public or anonymous.");
      }
      const participant = repository.registerParticipant({
        id: text(body.id, "id"),
        displayName: text(body.displayName, "displayName"),
        email: typeof body.email === "string" ? body.email : undefined,
        phone: typeof body.phone === "string" ? body.phone : undefined,
        community: typeof body.community === "string" ? body.community : undefined,
        leaderboardVisibility: visibility as LeaderboardVisibility,
      });
      return json({ participant }, 201);
    }

    if (request.method === "POST" && url.pathname === "/api/community/helpers/profile") {
      const body = await readJson(request);
      const skills = Array.isArray(body.skills) ? body.skills : [];
      if (!skills.every(isCategory)) throw new Error("One or more helper skills are invalid.");
      const mode = body.mode;
      if (mode !== "remote" && mode !== "in_person" && mode !== "both") {
        throw new Error("Helper mode must be remote, in_person, or both.");
      }
      repository.setHelperProfile({
        participantId: text(body.participantId, "participantId"),
        skills,
        mode,
      });
      return json({ success: true });
    }

    const suggestionAction = url.pathname.match(
      /^\/api\/community\/suggestions\/([^/]+)\/(approve|dismiss)$/,
    );
    if (request.method === "POST" && suggestionAction) {
      const [, suggestionId, action] = suggestionAction;
      const body = await readJson(request);
      const participantId = text(body.participantId, "participantId");
      if (action === "dismiss") {
        repository.dismissSuggestion(suggestionId!, participantId);
        return json({ success: true });
      }

      const overrides: {
        title?: string;
        description?: string;
        category?: SkillCategory;
        mode?: HelpMode;
        community?: string;
      } = {};
      if (typeof body.title === "string") overrides.title = body.title.trim();
      if (typeof body.description === "string") overrides.description = body.description.trim();
      if (isCategory(body.category)) overrides.category = body.category;
      if (isHelpMode(body.mode)) overrides.mode = body.mode;
      if (typeof body.community === "string") overrides.community = body.community.trim();
      return json({ request: repository.approveSuggestion(suggestionId!, participantId, overrides) }, 201);
    }

    const requestAction = url.pathname.match(
      /^\/api\/community\/requests\/([^/]+)\/(claim|start|submit|confirm)$/,
    );
    if (request.method === "POST" && requestAction) {
      const [, requestId, action] = requestAction;
      const body = await readJson(request);
      const participantId = text(body.participantId, "participantId");
      if (action === "claim") return json({ request: repository.claimRequest(requestId!, participantId) });
      if (action === "start") return json({ request: repository.startRequest(requestId!, participantId) });
      if (action === "submit") {
        return json({ request: repository.submitForConfirmation(requestId!, participantId) });
      }
      return json({ request: repository.confirmCompletion(requestId!, participantId) });
    }

    return json({ message: "Community API route not found." }, 404);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error.";
    return json({ message }, 400);
  }
}
