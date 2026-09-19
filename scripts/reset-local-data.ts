import { rm, unlink } from "node:fs/promises";
import { resolve } from "node:path";
import { dataDir, databasePath, gmailTokenPath } from "../src/config.ts";

if (!process.argv.includes("--yes")) {
  throw new Error("Destructive reset refused. Re-run with --yes after stopping the app and imports.");
}

const paths = [
  databasePath,
  `${databasePath}-wal`,
  `${databasePath}-shm`,
  gmailTokenPath,
  resolve(".gmail-token.json"),
];
for (const path of paths) await unlink(path).catch((error: NodeJS.ErrnoException) => {
  if (error.code !== "ENOENT") throw error;
});
await rm(resolve(dataDir, "users"), { recursive: true, force: true });

console.log("Removed the local database, indexes, chat history, memories, and Gmail token files.");
console.log("Revoke Google access separately from https://myaccount.google.com/permissions if desired.");
