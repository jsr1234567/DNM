import type { BountyRecord } from "./index.ts";

export function draftPrompt(bounty: BountyRecord): string {
  return `I noticed you may need help and drafted this private request: “${bounty.publicDescription}” (${bounty.timingText}${bounty.areaText ? `, near ${bounty.areaText}` : ""}). Nothing is shared yet. Reply post, edit <new wording>, or dismiss.`;
}

export function formatOwnedBounties(bounties: BountyRecord[]): string {
  if (!bounties.length) return "You don't have any requests yet.";
  return bounties.slice(0, 10).map((item, index) =>
    `${index + 1}. [${item.status}] ${item.title} — ${item.timingText}`,
  ).join("\n");
}
