import type { Database } from "bun:sqlite";
import { editDraft, getOwnedBounty, listOwnedBounties, recordBountyEvent, transitionBounty,
  type BountyRecord } from "./index.ts";
import { formatOwnedBounties } from "./present.ts";
import { getUser, setUserConsent } from "../users/index.ts";

export type PrivateDelivery = (userId: string, text: string) => Promise<void>;
export interface CommandResult { handled: boolean; reply?: string }

function numbered<T>(items: T[], raw: string | undefined): T | undefined {
  if (!items.length) return undefined;
  if (!raw) return items.length === 1 ? items[0] : undefined;
  const index = Number(raw) - 1;
  return Number.isInteger(index) && index >= 0 ? items[index] : undefined;
}

function chooseMessage(noun: string, count: number): string {
  return `You have ${count} pending ${noun}s. Reply with the command and its number, such as “post 2”.`;
}

export async function handleBountyCommand(
  db: Database, userId: string, text: string, deliver: PrivateDelivery,
): Promise<CommandResult> {
  const command = text.normalize("NFKC").trim();
  const lower = command.toLowerCase();
  if (lower === "my bounties" || lower === "my requests") {
    return { handled: true, reply: formatOwnedBounties(listOwnedBounties(db, userId)) };
  }
  if (lower === "stop matching me") {
    setUserConsent(db, userId, "helper_matching_enabled", false);
    return { handled: true, reply: "I stopped suggesting requests you could help with. Your existing choices are unchanged." };
  }
  if (lower === "stop finding help for me") {
    setUserConsent(db, userId, "bounty_discovery_enabled", false);
    return { handled: true, reply: "I stopped finding or drafting new requests for you. Existing requests remain private or keep their current status." };
  }

  const drafts = listOwnedBounties(db, userId, ["draft"]);
  const draftAction = lower.match(/^(post|dismiss)(?:\s+(\d+))?$/);
  if (draftAction) {
    const draft = numbered(drafts, draftAction[2]);
    if (!draft) return { handled: true, reply: drafts.length > 1 ? chooseMessage("draft", drafts.length) : "You don't have a pending draft." };
    const post = draftAction[1] === "post";
    const changed = transitionBounty(db, userId, draft.id, "draft", post ? "open" : "dismissed",
      post ? "owner_opened" : "owner_dismissed");
    return { handled: true, reply: changed ? (post ? "Posted to your trusted circle. Nobody is volunteered, and I'll ask you again before connecting anyone." : "Dismissed. It was never shared.") : "That draft already changed." };
  }
  const edit = command.match(/^edit(?:\s+(\d+))?\s+(.+)$/i);
  if (edit) {
    const draft = numbered(drafts, edit[1]);
    if (!draft) return { handled: true, reply: drafts.length > 1 ? chooseMessage("draft", drafts.length) : "You don't have a pending draft." };
    return { handled: true, reply: editDraft(db, userId, draft.id, edit[2]!) ? `Updated the private draft to: “${edit[2]!.trim()}” Reply post when it looks right.` : "That draft can no longer be edited." };
  }

  const active = listOwnedBounties(db, userId, ["open", "paused", "matched"]);
  const ownerAction = lower.match(/^(pause|close) bounty\s+(\d+)$/);
  if (ownerAction) {
    const bounty = active[Number(ownerAction[2]) - 1];
    if (!bounty) return { handled: true, reply: `Choose a valid request number:\n${formatOwnedBounties(active)}` };
    if (ownerAction[1] === "pause") {
      if (bounty.status !== "open") return { handled: true, reply: "Only an open request can be paused." };
      transitionBounty(db, userId, bounty.id, "open", "paused", "owner_paused");
      return { handled: true, reply: "Paused. It is no longer considered for new matches." };
    }
    const next = bounty.status === "matched" ? "completed" : "dismissed";
    transitionBounty(db, userId, bounty.id, bounty.status, next, "owner_closed");
    return { handled: true, reply: "Closed the request." };
  }

  const helperPending = db.query(`SELECT bm.id, bm.bounty_id, b.public_description, b.timing_text, b.area_text
    FROM bounty_matches bm JOIN bounties b ON b.id = bm.bounty_id
    WHERE bm.helper_user_id = ? AND bm.status = 'asked_helper' ORDER BY bm.updated_at DESC`
  ).all(userId) as Array<{ id: string; bounty_id: string; public_description: string; timing_text: string; area_text: string | null }>;
  const helperAction = lower.match(/^(offer|pass)(?:\s+(\d+))?$/);
  if (helperAction) {
    const match = numbered(helperPending, helperAction[2]);
    if (!match) return { handled: true, reply: helperPending.length > 1 ? chooseMessage("request", helperPending.length) : "You don't have a pending request to answer." };
    const decline = helperAction[1] === "pass";
    const now = new Date().toISOString();
    const changed = db.query(`UPDATE bounty_matches SET status = ?, updated_at = ?
      WHERE id = ? AND helper_user_id = ? AND status = 'asked_helper'`
    ).run(decline ? "helper_declined" : "helper_interested", now, match.id, userId);
    if (changed.changes !== 1) return { handled: true, reply: "That request was already answered." };
    recordBountyEvent(db, match.bounty_id, userId, decline ? "helper_declined" : "helper_interested");
    if (decline) return { handled: true, reply: "Passed. I won't share your reason or tell the requester anything about your private context." };
    const owner = db.query(`SELECT b.owner_user_id, u.display_name FROM bounties b JOIN users u ON u.id = ?
      WHERE b.id = ?`).get(userId, match.bounty_id) as { owner_user_id: string; display_name: string } | null;
    if (!owner) return { handled: true, reply: "Your offer is saved, but I couldn't notify the requester." };
    try {
      await deliver(owner.owner_user_id, `${owner.display_name} offered to help with your request: “${match.public_description}” Want me to connect you two? Reply connect or decline.`);
      db.query(`UPDATE bounty_matches SET status = 'asked_owner', updated_at = ?
        WHERE id = ? AND status = 'helper_interested'`).run(new Date().toISOString(), match.id);
      recordBountyEvent(db, match.bounty_id, userId, "owner_asked");
      return { handled: true, reply: "Thanks—your offer was shared with the requester. I won't share contact details unless they accept." };
    } catch {
      return { handled: true, reply: "Your offer is saved, but the requester notification failed. I did not retry automatically." };
    }
  }

  const ownerPending = db.query(`SELECT bm.id, bm.bounty_id, bm.helper_user_id, u.display_name, u.phone
    FROM bounty_matches bm JOIN bounties b ON b.id = bm.bounty_id JOIN users u ON u.id = bm.helper_user_id
    WHERE b.owner_user_id = ? AND bm.status = 'asked_owner' ORDER BY bm.updated_at DESC`
  ).all(userId) as Array<{ id: string; bounty_id: string; helper_user_id: string; display_name: string; phone: string | null }>;
  const connectAction = lower.match(/^(connect|decline)(?:\s+(\d+))?$/);
  if (connectAction) {
    const match = numbered(ownerPending, connectAction[2]);
    if (!match) return { handled: true, reply: ownerPending.length > 1 ? chooseMessage("offer", ownerPending.length) : "You don't have a pending offer." };
    const decline = connectAction[1] === "decline";
    const next = decline ? "owner_declined" : "accepted";
    const changed = db.query(`UPDATE bounty_matches SET status = ?, updated_at = ?
      WHERE id = ? AND status = 'asked_owner'`).run(next, new Date().toISOString(), match.id);
    if (changed.changes !== 1) return { handled: true, reply: "That offer was already answered." };
    recordBountyEvent(db, match.bounty_id, userId, decline ? "owner_declined" : "owner_accepted");
    if (decline) return { handled: true, reply: "Declined. I won't share a reason or either person's contact details." };
    const owner = getUser(db, userId)!;
    const helper = getUser(db, match.helper_user_id)!;
    const bounty = getOwnedBounty(db, userId, match.bounty_id)!;
    if (bounty.status === "open") transitionBounty(db, userId, bounty.id, "open", "matched", "matched");
    const ownerContact = owner.phone ?? owner.spectrumSenderId;
    const helperContact = helper.phone ?? helper.spectrumSenderId;
    try {
      await deliver(helper.id, `${owner.displayName} accepted your offer for “${bounty.title}.” You can reach them at ${ownerContact}. Please coordinate exact details directly.`);
    } catch {
      recordBountyEvent(db, bounty.id, null, "introduction_delivery_failed", { recipient: "helper" });
    }
    recordBountyEvent(db, bounty.id, userId, "introduced");
    return { handled: true, reply: `Connected. ${helper.displayName} can be reached at ${helperContact}. Please coordinate exact details directly.` };
  }

  return { handled: false };
}
