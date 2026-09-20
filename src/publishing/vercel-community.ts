import { createHash } from "node:crypto";
import { createClient, type Client } from "@libsql/client";
import type { HelpRequest, Participant, SkillCategory } from "../core/types.ts";

export type CommunityPublisher = (
  request: HelpRequest,
  requester: Participant,
) => Promise<void>;

const categoryLabels: Record<SkillCategory, string> = {
  coding: "Coding",
  website_building: "Website building",
  three_d_printing: "3D printing",
  planning: "Planning",
  companionship: "Companionship",
  food_and_groceries: "Food & groceries",
  general: "General help",
};

const categoryTones: Record<SkillCategory, string> = {
  coding: "spreadsheet",
  website_building: "garden",
  three_d_printing: "print",
  planning: "potluck",
  companionship: "call",
  food_and_groceries: "groceries",
  general: "spreadsheet",
};

export function cloudPublishConfiguration(
  environment: Record<string, string | undefined> = process.env,
):
  | { configured: true; url: string; authToken: string }
  | { configured: false; missing: string[] } {
  const url = environment.TURSO_DATABASE_URL?.trim();
  const authToken = environment.TURSO_AUTH_TOKEN?.trim();
  const missing = [
    ...(!url ? ["TURSO_DATABASE_URL"] : []),
    ...(!authToken ? ["TURSO_AUTH_TOKEN"] : []),
  ];
  return missing.length > 0
    ? { configured: false, missing }
    : { configured: true, url: url!, authToken: authToken! };
}

export function publicProjectId(requestId: string): number {
  const digest = createHash("sha256").update(requestId).digest("hex").slice(0, 12);
  return 1_000_000 + (Number.parseInt(digest, 16) % 900_000_000_000);
}

export function toPublicProject(request: HelpRequest, requester: Participant) {
  return {
    id: publicProjectId(request.id),
    title: request.title,
    summary: request.description,
    category: categoryLabels[request.category],
    location:
      request.mode === "remote"
        ? "Remote"
        : request.mode === "in_person"
          ? request.community
          : `${request.community} · Remote or in person`,
    effort: "Flexible",
    requester: requester.displayName,
    match: "New",
    tone: categoryTones[request.category],
    posted: "Just now",
    status: "open",
  };
}

export function createCommunityPublisher(client: Client): CommunityPublisher {
  return async (request, requester) => {
    const project = toPublicProject(request, requester);
    await client.execute({
      sql: `
        INSERT INTO projects (
          id, title, summary, category, location, effort, requester,
          match_label, tone, posted, status, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        ON CONFLICT(id) DO UPDATE SET
          title = excluded.title,
          summary = excluded.summary,
          category = excluded.category,
          location = excluded.location,
          effort = excluded.effort,
          requester = excluded.requester,
          match_label = excluded.match_label,
          tone = excluded.tone,
          posted = excluded.posted,
          status = excluded.status,
          updated_at = CURRENT_TIMESTAMP
      `,
      args: [
        project.id,
        project.title,
        project.summary,
        project.category,
        project.location,
        project.effort,
        project.requester,
        project.match,
        project.tone,
        project.posted,
        project.status,
      ],
    });
  };
}

export function communityPublisherFromEnvironment(): CommunityPublisher | undefined {
  const configuration = cloudPublishConfiguration();
  if (!configuration.configured) return undefined;
  const client = createClient({
    url: configuration.url,
    authToken: configuration.authToken,
  });
  return createCommunityPublisher(client);
}
