import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { FroggieRepository } from "../src/core/repository.ts";
import { notifySuggestion } from "../src/messaging/notifications.ts";

let repository: FroggieRepository;

beforeEach(() => {
  repository = new FroggieRepository(":memory:");
});

afterEach(() => repository.close());

describe("private suggestion notifications", () => {
  test("sends once to the requester's registered iMessage contact", async () => {
    repository.registerParticipant({
      id: "requester",
      displayName: "Margaret",
      email: "margaret@example.test",
    });
    const email = repository.insertEmailMessage({
      ownerId: "requester",
      providerMessageId: "mail-1",
      threadId: "thread-1",
      fromAddress: "margaret@example.test",
      toAddresses: ["friend@example.test"],
      subject: "Garden club site",
      bodyText: "Could someone help us make a website?",
      sentAt: "2026-09-19T12:00:00.000Z",
    });
    const suggestion = repository.createSuggestion("requester", email.id, {
      title: "Help with a small website",
      summary: "The requester may appreciate help creating a simple website.",
      category: "website_building",
      mode: "remote",
      confidence: 0.9,
      reason: "Website signal.",
    });

    const contacts: string[] = [];
    const sent: string[] = [];
    const messaging = {
      user: async (contact: string) => {
        contacts.push(contact);
        return { id: contact };
      },
      space: {
        create: async () => ({
          send: async (content: string) => sent.push(content),
        }),
      },
    };

    expect(await notifySuggestion(repository, messaging, suggestion)).toBe(true);
    expect(await notifySuggestion(repository, messaging, suggestion)).toBe(false);
    expect(contacts).toEqual(["margaret@example.test"]);
    expect(sent).toHaveLength(1);
    expect(sent[0]).toContain("Suggested help: Help with a small website");
    expect(sent[0]).toContain("What someone could do:");
    expect(sent[0]).toContain("Would you like Froggie to ask the community for help with this?");
    expect(sent[0]).not.toContain("Could someone help us make a website?");
  });
});
