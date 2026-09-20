import { describe, expect, test } from "bun:test";
import {
  cloudPublishConfiguration,
  createCommunityPublisher,
  publicProjectId,
  toPublicProject,
} from "../src/publishing/vercel-community.ts";

const request = {
  id: "request-123",
  suggestionId: "suggestion-123",
  requesterId: "margaret",
  title: "Help with a small website",
  description: "A community member could help create the simple website.",
  category: "website_building" as const,
  mode: "remote" as const,
  community: "San Francisco",
  status: "open" as const,
  createdAt: "2026-09-19T12:00:00.000Z",
  updatedAt: "2026-09-19T12:00:00.000Z",
};

const requester = {
  id: "margaret",
  displayName: "Margaret",
  community: "San Francisco",
  leaderboardVisibility: "anonymous" as const,
};

describe("Vercel community publishing", () => {
  test("requires the two Turso connection variables", () => {
    expect(cloudPublishConfiguration({})).toEqual({
      configured: false,
      missing: ["TURSO_DATABASE_URL", "TURSO_AUTH_TOKEN"],
    });
  });

  test("maps an approved request to the public site schema without private email text", () => {
    const project = toPublicProject(request, requester);
    expect(project).toMatchObject({
      title: "Help with a small website",
      category: "Website building",
      location: "Remote",
      requester: "Margaret",
      posted: "Just now",
    });
    expect(project.summary).toBe(request.description);
    expect(project.id).toBe(publicProjectId(request.id));
  });

  test("upserts with a stable public project id", async () => {
    const calls: Array<{ sql: string; args?: unknown[] }> = [];
    const client = {
      execute: async (statement: { sql: string; args?: unknown[] }) => {
        calls.push(statement);
        return {};
      },
    };
    const publish = createCommunityPublisher(client as never);
    await publish(request, requester);
    await publish(request, requester);
    expect(calls).toHaveLength(2);
    expect(calls[0]?.args?.[0]).toBe(calls[1]?.args?.[0]);
    expect(calls[0]?.sql).toContain("ON CONFLICT(id) DO UPDATE");
  });
});
