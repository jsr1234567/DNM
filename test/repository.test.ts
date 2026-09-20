import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { FroggieRepository } from "../src/core/repository.ts";

let repository: FroggieRepository;

beforeEach(() => {
  repository = new FroggieRepository(":memory:");
  repository.registerParticipant({
    id: "requester",
    displayName: "Margaret",
    email: "margaret@example.test",
    community: "Sunset District",
  });
  repository.registerParticipant({
    id: "helper",
    displayName: "Jordan",
    email: "helper@example.test",
    community: "Sunset District",
    leaderboardVisibility: "public",
  });
  repository.setHelperProfile({
    participantId: "helper",
    skills: ["website_building"],
    mode: "remote",
  });
});

afterEach(() => repository.close());

function pendingWebsiteSuggestion() {
  const email = repository.insertEmailMessage({
    id: "email-1",
    ownerId: "requester",
    providerMessageId: "provider-1",
    threadId: "thread-1",
    fromAddress: "margaret@example.test",
    toAddresses: ["son@example.test"],
    subject: "Garden club",
    bodyText: "We need a website.",
    sentAt: "2026-09-19T12:00:00.000Z",
    source: "fixture",
  });
  return repository.createSuggestion("requester", email.id, {
    title: "Garden club website",
    summary: "Help the garden club make a simple website.",
    category: "website_building",
    mode: "remote",
    confidence: 0.9,
    reason: "Explicit request for a website.",
  });
}

describe("FroggieRepository", () => {
  test("keeps a detected opportunity private until the requester approves it", () => {
    const suggestion = pendingWebsiteSuggestion();
    expect(repository.listOpenRequests()).toEqual([]);

    const request = repository.approveSuggestion(suggestion.id, "requester", {
      description: "Please help us publish meeting dates and photos.",
    });
    expect(request.status).toBe("open");
    expect(repository.listOpenRequests("Sunset District")).toHaveLength(1);
  });

  test("only a matching helper can claim a project", () => {
    const suggestion = pendingWebsiteSuggestion();
    const request = repository.approveSuggestion(suggestion.id, "requester");
    const claimed = repository.claimRequest(request.id, "helper");
    expect(claimed.status).toBe("claimed");
    expect(claimed.claimedBy).toBe("helper");
  });

  test("awards points only after requester confirmation", () => {
    const suggestion = pendingWebsiteSuggestion();
    const request = repository.approveSuggestion(suggestion.id, "requester");
    repository.claimRequest(request.id, "helper");
    repository.startRequest(request.id, "helper");
    repository.submitForConfirmation(request.id, "helper");

    expect(repository.leaderboard()[0]?.points).toBe(0);
    repository.confirmCompletion(request.id, "requester");

    expect(repository.leaderboard()[0]).toMatchObject({
      displayName: "Jordan",
      points: 10,
      completedProjects: 1,
    });
  });

  test("honors anonymous leaderboard identity", () => {
    repository.registerParticipant({
      id: "anonymous-helper",
      displayName: "Private Person",
      email: "private@example.test",
      leaderboardVisibility: "anonymous",
    });
    repository.setHelperProfile({
      participantId: "anonymous-helper",
      skills: ["general"],
      mode: "both",
    });

    const anonymous = repository
      .leaderboard()
      .find((entry) => entry.participantId === "anonymous-helper");
    expect(anonymous?.displayName).toBe("Anonymous helper");
  });
});
