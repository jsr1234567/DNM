import type { EmailMessage, OpportunityCandidate, SkillCategory } from "./types.ts";

const blockedRiskPattern =
  /\b(emergency|urgent medical|diagnos(?:e|is)|prescription|childcare|babysit|loan|wire money|bank account|credit card|password|one[- ]time code|enter my home)\b/i;

type Rule = {
  category: SkillCategory;
  pattern: RegExp;
  title: string;
  summary: string;
  mode: OpportunityCandidate["mode"];
};

const rules: Rule[] = [
  {
    category: "general",
    pattern: /\b(?:broken|broke|cracked)\b.{0,40}\b(?:vase|ceramic|pottery)\b|\b(?:vase|ceramic|pottery)\b.{0,40}\b(?:broken|broke|cracked)\b/i,
    title: "Help repair or replace a broken vase",
    summary: "A community member could help find a ceramic repair option, assess whether the vase can be repaired, or locate a similar replacement.",
    mode: "either",
  },
  {
    category: "three_d_printing",
    pattern: /\b(3d print(?:ed|ing)?|3-d print(?:ed|ing)?|replacement (?:clip|knob|part)|plastic (?:clip|knob|part).*(?:broke|broken))\b/i,
    title: "3D-print a replacement part",
    summary: "A community member could help design or 3D-print a replacement for the small broken part.",
    mode: "either",
  },
  {
    category: "food_and_groceries",
    pattern: /\b(grocery order|order groceries|grocery pickup|pick up groceries|shopping list)\b/i,
    title: "Help with groceries",
    summary: "A community member could help set up the grocery order or collect the pickup.",
    mode: "either",
  },
  {
    category: "planning",
    pattern: /\b(plan(?:ning)?|organize)\b.{0,40}\b(event|lunch|dinner|potluck|outing)\b/i,
    title: "Help planning a small gathering",
    summary: "A community member could help organize the gathering, invitations, or food list.",
    mode: "either",
  },
  {
    category: "companionship",
    pattern: /\b(meet (?:more|new) people|feeling lonely|some company|someone to (?:walk|chat|talk) with)\b/i,
    title: "Make a community connection",
    summary: "A community member could offer a friendly walk, conversation, or low-pressure meetup.",
    mode: "in_person",
  },
  {
    category: "coding",
    pattern: /\b(coding help|help with (?:my |the )?(?:code|app|script)|small software project|programming help)\b/i,
    title: "Help with a coding project",
    summary: "A community member could help troubleshoot or finish the small coding project.",
    mode: "remote",
  },
  {
    category: "website_building",
    pattern: /\b(website|web page|homepage|site for (?:our|the)|put .* online)\b/i,
    title: "Help with a small website",
    summary: "A community member could help create or update the simple website.",
    mode: "remote",
  },
];

/**
 * Conservative offline fallback used for fixtures and tests.
 * A model-backed detector can replace this later, but it must preserve the
 * same low-risk policy and may only create private, pending suggestions.
 */
export function detectHelpOpportunities(message: EmailMessage): OpportunityCandidate[] {
  const text = `${message.subject}\n${message.bodyText}`;
  if (blockedRiskPattern.test(text)) return [];

  const match = rules.find((rule) => rule.pattern.test(text));
  if (!match) return [];

  return [
    {
      title: match.title,
      summary: match.summary,
      category: match.category,
      mode: match.mode,
      confidence: 0.75,
      reason: `Matched a low-risk ${match.category.replaceAll("_", " ")} signal.`,
    },
  ];
}
