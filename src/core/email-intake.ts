import { detectHelpOpportunities } from "./opportunity-detector.ts";
import type { FroggieRepository } from "./repository.ts";
import type { EmailMessageInput, HelpSuggestion } from "./types.ts";

export function ingestEmailForSuggestions(
  repository: FroggieRepository,
  input: EmailMessageInput,
): { suggestions: HelpSuggestion[] } {
  const message = repository.insertEmailMessage(input);
  const suggestions = detectHelpOpportunities(message).map((candidate) =>
    repository.createSuggestion(input.ownerId, message.id, candidate),
  );
  return { suggestions };
}
