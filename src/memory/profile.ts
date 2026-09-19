import type { Database } from "bun:sqlite";
import { chmod, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { StructuredCompletionClient } from "../ai/openrouter.ts";
import { dataDir, ensurePrivateDataDir } from "../config.ts";
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

function sourceLabel(memory: MemoryRecord): string {
  return memory.evidence.map((evidence) => `${evidence.type}:${evidence.id}`).join(", ") || "no source reference";
}

function oneLine(value: string, limit: number): string {
  return value.normalize("NFKC").replace(/\s+/g, " ").trim().slice(0, limit);
}

export async function generateMemoryMarkdown(
  db: Database,
  client: StructuredCompletionClient,
  mailbox: string,
): Promise<string> {
  const memories = listActiveMemories(db, 100);
  const allowed = new Map(memories.map((memory) => [memory.id, memory]));
  const profile = await client.complete<GeneratedProfile>({
    name: "user_memory_profile",
    schema: profileSchema,
    system: `You organize source-backed memories into a concise private profile for the mailbox owner.
Use only the supplied active memories. Preserve uncertainty and temporal language exactly; do not turn a proposal into a commitment or confirmation. Do not infer sensitive traits or add biographical claims. Every item must cite the IDs of the memories that support it. Prefer sections such as Preferences, People, Plans and commitments, and Recent context, but omit empty sections. The overview should describe what this memory snapshot covers without inventing facts.`,
    prompt: `<mailbox_owner>${mailbox}</mailbox_owner>\n<active_memories>${JSON.stringify(memories)}</active_memories>`,
    maxTokens: 2_000,
  });

  const lines = [
    "# DNM memory",
    "",
    `Generated: ${new Date().toISOString()}`,
    `Model: ${client.model}`,
    "",
    oneLine(profile.overview, 600) || "Active source-backed memory snapshot.",
  ];

  for (const section of profile.sections ?? []) {
    const validItems = section.items.flatMap((item) => {
      const sources = [...new Set(item.memoryIds)].map((id) => allowed.get(id)).filter(Boolean) as MemoryRecord[];
      const text = oneLine(item.text, 350);
      return sources.length === 0 || !text ? [] : [{ text, sources }];
    });
    const title = oneLine(section.title, 80);
    if (validItems.length === 0 || !title) continue;
    lines.push("", `## ${title}`, "");
    for (const item of validItems) {
      lines.push(`- ${item.text}`);
      for (const source of item.sources) {
        lines.push(`  - Memory ${source.id} (${source.origin}; ${sourceLabel(source)})`);
      }
    }
  }
  lines.push("");
  return lines.join("\n");
}

export async function writeMemoryMarkdown(markdown: string): Promise<string> {
  await ensurePrivateDataDir();
  const target = join(dataDir, "memory.md");
  const temporary = join(dataDir, `.memory-${process.pid}.tmp`);
  await writeFile(temporary, markdown, { encoding: "utf8", mode: 0o600 });
  await rename(temporary, target);
  await chmod(target, 0o600);
  return target;
}
