import type { Database } from "bun:sqlite";
import { chmod, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { StructuredCompletionClient } from "../ai/openrouter.ts";
import { ensurePrivateUserDataDir } from "../config.ts";
import { listActiveMemories, type MemoryRecord } from "./index.ts";

const profileSchema = {
  type: "object",
  properties: {
    overview: { type: "string", description: "A concise overview, no more than 600 characters." },
    sections: {
      type: "array",
      maxItems: 6,
      items: {
        type: "object",
        properties: {
          title: { type: "string", description: "A short section title." },
          items: {
            type: "array",
            maxItems: 12,
            items: {
              type: "object",
              properties: {
                text: { type: "string", description: "A concise source-backed profile statement." },
                memoryIds: { type: "array", minItems: 1, maxItems: 6, items: { type: "integer" } },
              },
              required: ["text", "memoryIds"],
              additionalProperties: false,
            },
          },
        },
        required: ["title", "items"],
        additionalProperties: false,
      },
    },
  },
  required: ["overview", "sections"],
  additionalProperties: false,
} satisfies Record<string, unknown>;

interface GeneratedProfile {
  overview: string;
  sections: Array<{ title: string; items: Array<{ text: string; memoryIds: number[] }> }>;
}

interface CanonicalProfile {
  overview: string;
  sections: Array<{ title: string; items: Array<{ text: string; memoryIds: number[] }> }>;
}

function sourceLabel(memory: MemoryRecord): string {
  return memory.evidence.map((evidence) => `${evidence.type}:${evidence.id}`).join(", ") || "no source reference";
}

function oneLine(value: string, limit: number): string {
  return value.normalize("NFKC").replace(/\s+/g, " ").trim().slice(0, limit);
}

function storeProfileSnapshot(
  db: Database,
  userId: string,
  profile: CanonicalProfile,
  memoryIds: number[],
  model: string,
): void {
  db.transaction(() => {
    const current = db.query(
      "SELECT coalesce(max(version), 0) AS version FROM user_profiles WHERE user_id = ?",
    ).get(userId) as { version: number };
    db.query("UPDATE user_profiles SET is_current = 0 WHERE user_id = ? AND is_current = 1").run(userId);
    db.query(`
      INSERT INTO user_profiles(
        user_id, version, profile_json, source_memory_ids_json, model, generated_at, is_current
      ) VALUES (?, ?, ?, ?, ?, ?, 1)
    `).run(userId, current.version + 1, JSON.stringify(profile), JSON.stringify(memoryIds),
      model, new Date().toISOString());
  })();
}

export async function generateMemoryMarkdown(
  db: Database,
  client: StructuredCompletionClient,
  userId: string,
  mailbox: string,
): Promise<string> {
  const memories = listActiveMemories(db, userId, 100);
  const allowed = new Map(memories.map((memory) => [memory.id, memory]));
  const profile = await client.complete<GeneratedProfile>({
    name: "user_memory_profile",
    schema: profileSchema,
    system: `You organize source-backed memories into a concise private profile for the mailbox owner.
Use only the supplied active memories. Preserve uncertainty and temporal language exactly; do not turn a proposal into a commitment or confirmation. Do not infer sensitive traits or add biographical claims. Every item must cite the IDs of the memories that support it. Prefer sections such as Preferences, People, Plans and commitments, and Recent context, but omit empty sections. The overview should describe what this memory snapshot covers without inventing facts.`,
    prompt: `<mailbox_owner>${mailbox}</mailbox_owner>\n<active_memories>${JSON.stringify(memories)}</active_memories>`,
    maxTokens: 900,
  });

  const sections = (profile.sections ?? []).flatMap((section) => {
    const title = oneLine(section.title, 80);
    const items = section.items.flatMap((item) => {
      const sources = [...new Set(item.memoryIds)].map((id) => allowed.get(id)).filter(Boolean) as MemoryRecord[];
      const text = oneLine(item.text, 350);
      return sources.length === 0 || !text ? [] : [{ text, sources }];
    });
    return !title || items.length === 0 ? [] : [{ title, items }];
  });
  const canonicalProfile = {
    overview: oneLine(profile.overview, 600) || "Active source-backed memory snapshot.",
    sections: sections.map((section) => ({
      title: section.title,
      items: section.items.map((item) => ({ text: item.text, memoryIds: item.sources.map((source) => source.id) })),
    })),
  };

  storeProfileSnapshot(db, userId, canonicalProfile,
    [...new Set(sections.flatMap((section) => section.items.flatMap((item) => item.sources.map((source) => source.id))))],
    client.model);

  const lines = [
    "# DNM memory",
    "",
    `Generated: ${new Date().toISOString()}`,
    `Model: ${client.model}`,
    "",
    canonicalProfile.overview,
  ];

  for (const section of sections) {
    lines.push("", `## ${section.title}`, "");
    for (const item of section.items) {
      lines.push(`- ${item.text}`);
      for (const source of item.sources) {
        lines.push(`  - Memory ${source.id} (${source.origin}; ${sourceLabel(source)})`);
      }
    }
  }
  lines.push("");
  return lines.join("\n");
}

export function renderMemoryMarkdown(
  db: Database,
  userId: string,
  mailbox: string,
  model: string,
): string {
  const memories = listActiveMemories(db, userId, 100);
  const labels: Record<MemoryRecord["kind"], string> = {
    preference: "Preferences", person: "People", plan: "Plans",
    commitment: "Commitments", episode: "Recent context",
  };
  const sections = (["preference", "person", "plan", "commitment", "episode"] as const).flatMap((kind) => {
    const items = memories.filter((memory) => memory.kind === kind).map((memory) => ({
      text: oneLine(memory.claim, 350), memoryIds: [memory.id], memory,
    }));
    return items.length ? [{ title: labels[kind], items }] : [];
  });
  const profile: CanonicalProfile = {
    overview: `Source-backed memory snapshot for ${mailbox} containing ${memories.length} active items.`,
    sections: sections.map((section) => ({
      title: section.title,
      items: section.items.map(({ text, memoryIds }) => ({ text, memoryIds })),
    })),
  };
  const fallbackModel = `${model} (local profile formatting fallback)`;
  storeProfileSnapshot(db, userId, profile, memories.map((memory) => memory.id), fallbackModel);
  const lines = ["# DNM memory", "", `Generated: ${new Date().toISOString()}`,
    `Model: ${fallbackModel}`, "", profile.overview];
  for (const section of sections) {
    lines.push("", `## ${section.title}`, "");
    for (const item of section.items) {
      lines.push(`- ${item.text}`);
      lines.push(`  - Memory ${item.memory.id} (${item.memory.origin}; ${sourceLabel(item.memory)})`);
    }
  }
  lines.push("");
  return lines.join("\n");
}

export async function writeMemoryMarkdown(userId: string, markdown: string): Promise<string> {
  const directory = await ensurePrivateUserDataDir(userId);
  const target = join(directory, "memory.md");
  const temporary = join(directory, `.memory-${process.pid}.tmp`);
  await writeFile(temporary, markdown, { encoding: "utf8", mode: 0o600 });
  await rename(temporary, target);
  await chmod(target, 0o600);
  return target;
}
