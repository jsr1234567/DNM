export const SKILL_CATEGORIES = [
  "coding",
  "website_building",
  "three_d_printing",
  "planning",
  "companionship",
  "food_and_groceries",
  "general",
] as const;

export const HELP_MODES = ["remote", "in_person", "either"] as const;

export type SkillCategory = (typeof SKILL_CATEGORIES)[number];
export type HelpMode = (typeof HELP_MODES)[number];
export type HelperMode = HelpMode | "both";
export type LeaderboardVisibility = "public" | "anonymous";
export type SuggestionStatus = "pending" | "approved" | "dismissed";
export type RequestStatus =
  | "open"
  | "claimed"
  | "in_progress"
  | "awaiting_confirmation"
  | "completed"
  | "cancelled";

export interface Participant {
  id: string;
  displayName: string;
  email?: string;
  phone?: string;
  community: string;
  leaderboardVisibility: LeaderboardVisibility;
}

export interface EmailMessageInput {
  id?: string;
  ownerId: string;
  providerMessageId: string;
  threadId: string;
  fromAddress: string;
  toAddresses: string[];
  subject: string;
  bodyText: string;
  sentAt: string;
  source?: "gmail" | "fixture";
}

export interface EmailMessage extends Required<EmailMessageInput> {}

export interface OpportunityCandidate {
  title: string;
  summary: string;
  category: SkillCategory;
  mode: HelpMode;
  confidence: number;
  reason: string;
}

export interface HelpSuggestion extends OpportunityCandidate {
  id: string;
  ownerId: string;
  emailMessageId: string;
  status: SuggestionStatus;
  createdAt: string;
}

export interface HelpRequest {
  id: string;
  suggestionId: string;
  requesterId: string;
  title: string;
  description: string;
  category: SkillCategory;
  mode: HelpMode;
  community: string;
  status: RequestStatus;
  claimedBy?: string;
  createdAt: string;
  updatedAt: string;
}

export interface LeaderboardEntry {
  participantId: string;
  displayName: string;
  points: number;
  completedProjects: number;
}
