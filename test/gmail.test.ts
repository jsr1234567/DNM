import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { FroggieRepository } from "../src/core/repository.ts";
import {
  addressFromHeader,
  gmailWatchConfiguration,
  pollGmailOnce,
  toEmailInput,
} from "../src/email/gmail.ts";

let repository: FroggieRepository;

beforeEach(() => {
  repository = new FroggieRepository(":memory:");
});

afterEach(() => repository.close());

describe("Gmail watcher", () => {
  test("requires read-only mailbox credentials and an exact sender", () => {
    const status = gmailWatchConfiguration({});
    expect(status.configured).toBe(false);
    if (!status.configured) {
      expect(status.missing).toEqual([
        "GOOGLE_GMAIL_CLIENT_ID",
        "GOOGLE_GMAIL_CLIENT_SECRET",
        "GOOGLE_GMAIL_REFRESH_TOKEN",
        "FROGGIE_GMAIL_FROM",
      ]);
    }
  });

  test("normalizes a named From header", () => {
    expect(addressFromHeader('Margaret Example <Margaret@Example.com>')).toBe(
      "margaret@example.com",
    );
  });

  test("extracts only plain text into an email input", () => {
    const input = toEmailInput(
      {
        id: "abc",
        threadId: "thread",
        internalDate: "1789833600000",
        payload: {
          mimeType: "multipart/alternative",
          headers: [
            { name: "From", value: "Margaret <margaret@example.com>" },
            { name: "To", value: "Friend <friend@example.com>" },
            { name: "Subject", value: "Garden club" },
          ],
          parts: [
            {
              mimeType: "text/plain",
              body: { data: Buffer.from("We may need a small website.").toString("base64url") },
            },
          ],
        },
      },
      "requester",
    );
    expect(input?.providerMessageId).toBe("gmail:abc");
    expect(input?.bodyText).toBe("We may need a small website.");
    expect(input?.fromAddress).toBe("margaret@example.com");
  });

  test("establishes a first-run baseline without notifying about old mail", async () => {
    const imported: string[] = [];
    const result = await pollGmailOnce(
      repository,
      {
        clientId: "client",
        clientSecret: "secret",
        refreshToken: "refresh",
        senderAddress: "margaret@example.com",
        ownerId: "requester",
        pollSeconds: 30,
      },
      async (email) => {
        imported.push(email.providerMessageId);
      },
      new Date("2026-09-19T12:00:00.000Z"),
    );
    expect(result).toEqual({ initialized: true, imported: 0 });
    expect(imported).toHaveLength(0);
  });
});
