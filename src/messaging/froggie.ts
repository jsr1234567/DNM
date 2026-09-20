import type { Message, Space, User } from "spectrum-ts";
import type { FroggieRepository } from "../core/repository.ts";
import type { CommunityPublisher } from "../publishing/vercel-community.ts";

type IMessageUser = User & { address?: string };
type IMessageSpace = Space & { type?: "dm" | "group" };
type IncomingMessage = Message<string, IMessageUser, IMessageSpace>;

function participantForMessage(repository: FroggieRepository, message: IncomingMessage) {
  const contacts = [message.sender?.address, message.sender?.id].filter(
    (contact): contact is string => Boolean(contact),
  );
  for (const contact of contacts) {
    const participant = repository.findParticipantByContact(contact);
    if (participant) return participant;
  }
  return undefined;
}

export async function handleFroggieMessage(
  repository: FroggieRepository,
  space: IMessageSpace,
  message: IncomingMessage,
  publishRequest?: CommunityPublisher,
): Promise<boolean> {
  // Spectrum can echo messages sent by this process back through app.messages.
  // Never treat one of Froggie's own sends as a fresh user command.
  if (message.direction === "outbound") return false;
  if (message.content.type !== "text") return false;
  if (space.type && space.type !== "dm") {
    await space.send("Froggie only handles private requests in direct messages.");
    return true;
  }

  const participant = participantForMessage(repository, message);
  if (!participant) return false;

  const pending = repository.listPendingSuggestions(participant.id);
  const suggestion = pending[0];
  if (!suggestion) return false;

  const reply = message.content.text.trim();
  const command = reply.toLowerCase();

  if (command === "yes" || command === "approve") {
    const request = repository.approveSuggestion(suggestion.id, participant.id);
    if (publishRequest) {
      try {
        await publishRequest(request, participant);
        repository.markRequestPublished(request.id);
      } catch {
        await space.send(
          "Thanks — your request is approved and saved. Froggie could not update the community site yet, so it will retry automatically.",
        );
        return true;
      }
    }
    await space.send(
      publishRequest
        ? `Thanks — I shared “${request.title}” on the community site with the ${request.category.replaceAll("_", " ")} helpers.`
        : `Thanks — I saved “${request.title}”, but the community site connection is not configured yet.`,
    );
    return true;
  }

  if (command === "no" || command === "dismiss") {
    repository.dismissSuggestion(suggestion.id, participant.id);
    await space.send("Okay — I dismissed it. Nothing was shared.");
    return true;
  }

  if (command.startsWith("edit:")) {
    const description = reply.slice(reply.indexOf(":") + 1).trim();
    if (!description) {
      await space.send("Add your preferred wording after “edit:”. Nothing has been shared yet.");
      return true;
    }
    const request = repository.approveSuggestion(suggestion.id, participant.id, { description });
    if (publishRequest) {
      try {
        await publishRequest(request, participant);
        repository.markRequestPublished(request.id);
      } catch {
        await space.send(
          "Thanks — your edited request is approved and saved. Froggie could not update the community site yet, so it will retry automatically.",
        );
        return true;
      }
    }
    await space.send(
      publishRequest
        ? `Thanks — I shared your edited request on the community site: “${request.description}”`
        : `Thanks — I saved your edited request, but the community site connection is not configured yet: “${request.description}”`,
    );
    return true;
  }

  await space.send(
    [
      `I noticed something your community might be able to help with: ${suggestion.summary}`,
      "Nothing has been shared yet.",
      "Reply YES to share it, NO to dismiss it, or EDIT: followed by your preferred wording.",
    ].join("\n\n"),
  );
  return true;
}
