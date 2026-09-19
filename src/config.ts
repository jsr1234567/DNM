import { chmod, mkdir } from "node:fs/promises";
import { join, resolve } from "node:path";

export const dataDir = resolve(process.env.DNM_DATA_DIR ?? ".data");
export const databasePath = resolve(process.env.DNM_DATABASE_PATH ?? join(dataDir, "dnm.sqlite"));
export const gmailTokenPath = resolve(
  process.env.GMAIL_TOKEN_FILE ?? join(dataDir, "gmail-token.json"),
);

export async function ensurePrivateDataDir(): Promise<void> {
  await mkdir(dataDir, { recursive: true, mode: 0o700 });
  await chmod(dataDir, 0o700);
}
