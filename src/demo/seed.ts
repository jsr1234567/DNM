import { FroggieRepository } from "../core/repository.ts";
import { ingestEmailForSuggestions } from "../core/email-intake.ts";
import type { EmailMessageInput } from "../core/types.ts";

const requesterId = "demo-margaret";
const helperId = "demo-helper";
const requesterEmail = process.env.DEMO_REQUESTER_EMAIL ?? "margaret@example.test";
const helperEmail = process.env.DEMO_HELPER_EMAIL ?? "helper@example.test";
const fixtureUrl = new URL("../../fixtures/margaret-emails.json", import.meta.url);

const messages = (await Bun.file(fixtureUrl).json()) as Array<
  Omit<EmailMessageInput, "ownerId" | "source">
>;

const repository = new FroggieRepository();

try {
  repository.registerParticipant({
    id: requesterId,
    displayName: "Margaret",
    email: requesterEmail,
    community: "San Francisco",
    leaderboardVisibility: "anonymous",
  });
  repository.registerParticipant({
    id: helperId,
    displayName: "Demo Helper",
    email: helperEmail,
    community: "San Francisco",
    leaderboardVisibility: "public",
  });
  repository.setHelperProfile({
    participantId: helperId,
    skills: ["website_building", "planning", "general"],
    mode: "both",
  });

  let suggestionCount = 0;
  for (const fixture of messages) {
    const { suggestions } = ingestEmailForSuggestions(repository, {
      ...fixture,
      ownerId: requesterId,
      source: "fixture",
      fromAddress: fixture.fromAddress.replace("margaret@example.test", requesterEmail),
      toAddresses: fixture.toAddresses.map((address) =>
        address
          .replace("margaret@example.test", requesterEmail)
          .replace("son@example.test", helperEmail),
      ),
    });
    suggestionCount += suggestions.length;
  }

  console.log(
    `Seeded ${messages.length} fictional emails and ${suggestionCount} private suggestions in ${repository.path}.`,
  );
} finally {
  repository.close();
}
