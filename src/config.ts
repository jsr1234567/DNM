import { chmod, mkdir } from "node:fs/promises";
import { join, resolve } from "node:path";

export const dataDir = resolve(process.env.DNM_DATA_DIR ?? ".data");
export const databasePath = resolve(process.env.DNM_DATABASE_PATH ?? join(dataDir, "dnm.sqlite"));
export const gmailTokenPath = resolve(
  process.env.GMAIL_TOKEN_FILE ?? join(dataDir, "gmail-token.json"),
);

export function userDataDir(userId: string): string {
  if (!/^[a-z0-9][a-z0-9:_-]{0,127}$/i.test(userId)) throw new Error("Invalid local user ID");
  return join(dataDir, "users", userId);
}

export function gmailTokenPathForUser(userId: string): string {
  return join(userDataDir(userId), "gmail-token.json");
}

export async function ensurePrivateDataDir(): Promise<void> {
  await mkdir(dataDir, { recursive: true, mode: 0o700 });
  await chmod(dataDir, 0o700);
}

export async function ensurePrivateUserDataDir(userId: string): Promise<string> {
  await ensurePrivateDataDir();
  const directory = userDataDir(userId);
  await mkdir(directory, { recursive: true, mode: 0o700 });
  await chmod(directory, 0o700);
  return directory;
}
