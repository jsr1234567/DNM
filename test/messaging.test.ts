import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { FroggieRepository } from "../src/core/repository.ts";
import { handleFroggieMessage } from "../src/messaging/froggie.ts";

let repository: FroggieRepository;

beforeEach(() => {
  repository = new FroggieRepository(":memory:");
  repository.registerParticipant({
    id: "requester",
    displayName: "Margaret",
    phone: "+14155550100",
  });
  const email = repository.insertEmailMessage({
    id: "email-1",
    ownerId: "requester",
    providerMessageId: "provider-1",
    threadId: "thread-1",
    fromAddress: "margaret@example.test",
    toAddresses: ["son@example.test"],
    subject: "Garden club",
    bodyText: "The raw private email body must not be shared.",
    sentAt: "2026-09-19T12:00:00.000Z",
    source: "fixture",
  });
  repository.createSuggestion("requester", email.id, {
    title: "Garden club website",
    summary: "The requester may appreciate help with a small website.",
    category: "website_building",
    mode: "remote",
    confidence: 0.9,
    reason: "Website signal.",
  });
});

afterEach(() => repository.close());

function incoming(text: string) {
  return {
    direction: "inbound" as const,
    content: { type: "text" as const, text },
    sender: { id: "+14155550100", __platform: "imessage" },
  };
}

function directSpace() {
  const sent: string[] = [];
  return {
    sent,
    space: {
      type: "dm" as const,
      send: async (content: string) => {
        sent.push(content);
        return undefined;
      },
    },
  };
}

describe("handleFroggieMessage", () => {
  test("ignores outbound messages echoed by the provider", async () => {
    const { space, sent } = directSpace();
    const message = { ...incoming("YES"), direction: "outbound" as const };
    await handleFroggieMessage(repository, space as never, message as never);
    expect(sent).toHaveLength(0);
    expect(repository.listOpenRequests()).toHaveLength(0);
  });

  test("shows only the safe suggestion summary before approval", async () => {
    const { space, sent } = directSpace();
    await handleFroggieMessage(repository, space as never, incoming("check") as never);
    expect(sent[0]).toContain("Nothing has been shared yet");
    expect(sent[0]).not.toContain("raw private email body");
    expect(repository.listOpenRequests()).toHaveLength(0);
  });

  test("publishes only after an affirmative reply", async () => {
    const { space, sent } = directSpace();
    const published: string[] = [];
    await handleFroggieMessage(
      repository,
      space as never,
      incoming("YES") as never,
      async (request) => {
        published.push(request.id);
      },
    );
    expect(sent[0]).toContain("community site");
    expect(published).toHaveLength(1);
    expect(repository.listOpenRequests()).toHaveLength(1);
  });

  test("dismisses without publishing", async () => {
    const { space } = directSpace();
    await handleFroggieMessage(repository, space as never, incoming("NO") as never);
    expect(repository.listOpenRequests()).toHaveLength(0);
    expect(repository.listPendingSuggestions("requester")).toHaveLength(0);
  });
});
