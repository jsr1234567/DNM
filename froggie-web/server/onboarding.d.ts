import type { Database } from "bun:sqlite";

export interface WebOnboardingInput {
  name: string;
  email: string;
  phone: string;
  role: "requester" | "helper";
  consent?: boolean;
  community?: string;
  mode?: string;
  availability?: string;
  identity?: string;
  skills?: string[];
}

export interface WebOnboardingResult {
  userId: string;
  approvalStatus: "active" | "pending-circle-approval";
  gmailStatus?: "connected" | "connection-requested";
  bountyDiscoveryEnabled: boolean;
  helperMatchingEnabled: boolean;
}

export function completeOnboarding(
  db: Database,
  input: WebOnboardingInput,
  options?: { trustedCircleId?: string },
): WebOnboardingResult;
