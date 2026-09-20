import { describe, expect, test } from "bun:test";
import { detectHelpOpportunities } from "../src/core/opportunity-detector.ts";
import type { EmailMessage } from "../src/core/types.ts";

function message(bodyText: string, subject = "Hello"): EmailMessage {
  return {
    id: "email-1",
    ownerId: "requester-1",
    providerMessageId: "provider-1",
    threadId: "thread-1",
    fromAddress: "requester@example.test",
    toAddresses: ["relative@example.test"],
    subject,
    bodyText,
    sentAt: "2026-09-19T12:00:00.000Z",
    source: "fixture",
  };
}

describe("detectHelpOpportunities", () => {
  test("finds one concrete low-risk opportunity", () => {
    const result = detectHelpOpportunities(
      message("The garden group needs a simple website with our meeting dates."),
    );
    expect(result).toHaveLength(1);
    expect(result[0]?.category).toBe("website_building");
    expect(result[0]?.mode).toBe("remote");
  });

  test("does not turn ordinary conversation into a request", () => {
    expect(detectHelpOpportunities(message("I made soup and read all afternoon."))).toEqual([]);
  });

  test("recognizes a 3D-printed replacement part", () => {
    const result = detectHelpOpportunities(
      message("A replacement clip could probably be 3D printed."),
    );
    expect(result[0]?.category).toBe("three_d_printing");
  });

  test("suggests concrete help for a broken sentimental vase", () => {
    const result = detectHelpOpportunities(
      message(
        "The beautiful vase you gave me unfortunately broke, and I am sad because it meant so much to me.",
        "broken vase :(",
      ),
    );
    expect(result).toHaveLength(1);
    expect(result[0]?.title).toBe("Help repair or replace a broken vase");
    expect(result[0]?.summary).toContain("ceramic repair");
    expect(result[0]?.category).toBe("general");
  });

  test("prefers the concrete grocery need over an incidental website mention", () => {
    const result = detectHelpOpportunities(
      message("I need help setting up a recurring grocery order on the store website."),
    );
    expect(result[0]?.category).toBe("food_and_groceries");
  });

  test("recognizes planning language with descriptive words", () => {
    const result = detectHelpOpportunities(
      message("We would like to organize a small autumn potluck."),
    );
    expect(result[0]?.category).toBe("planning");
  });

  test("blocks high-risk suggestions even when a normal category also matches", () => {
    expect(
      detectHelpOpportunities(
        message("I need urgent medical advice, and I also wanted help with a website."),
      ),
    ).toEqual([]);
  });
});
