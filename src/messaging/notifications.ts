import type { FroggieRepository } from "../core/repository.ts";
import type { HelpSuggestion, Participant } from "../core/types.ts";

type ProactiveSpace = {
  send(content: string): Promise<unknown>;
};

type ProactiveIMessage = {
  user(contact: string): Promise<unknown>;
  space: {
    create(user: unknown): Promise<ProactiveSpace>;
  };
};

export function suggestionNotificationText(suggestion: HelpSuggestion): string {
  return [
    "Froggie spotted a possible community-help request in Margaret’s new email.",
    `Suggested help: ${suggestion.title}`,
    `What someone could do: ${suggestion.summary}`,
    "Nothing has been shared yet.",
    "Would you like Froggie to ask the community for help with this?",
    "Reply YES to ask, NO to dismiss, or EDIT: followed by your preferred wording.",
  ].join("\n\n");
}

function recipientContact(participant: Participant): string | undefined {
  return participant.phone || participant.email;
}

export async function notifySuggestion(
  repository: FroggieRepository,
  messaging: ProactiveIMessage,
  suggestion: HelpSuggestion,
): Promise<boolean> {
  if (repository.wasSuggestionNotified(suggestion.id)) return false;

  const participant = repository.findParticipantById(suggestion.ownerId);
  const contact = participant && recipientContact(participant);
  if (!contact) return false;

  const user = await messaging.user(contact);
  const space = await messaging.space.create(user);
  await space.send(suggestionNotificationText(suggestion));
  repository.markSuggestionNotified(suggestion.id);
  return true;
}

export async function notifyNewestPendingSuggestion(
  repository: FroggieRepository,
  messaging: ProactiveIMessage,
  ownerId: string,
): Promise<boolean> {
  const suggestion = repository
    .listPendingSuggestions(ownerId)
    .find((candidate) => !repository.wasSuggestionNotified(candidate.id));
  if (!suggestion) return false;
  return notifySuggestion(repository, messaging, suggestion);
}
