import { closeDatabase, openDatabase } from "../src/db/index.ts";
import { rebuildEmailFts } from "../src/email/archive.ts";
import { rebuildMemoryFts } from "../src/memory/index.ts";

const db = await openDatabase();
try {
  const emailChunks = rebuildEmailFts(db);
  const memories = rebuildMemoryFts(db);
  console.log(`Rebuilt keyword indexes: ${emailChunks} email chunks, ${memories} active memories.`);
} finally {
  closeDatabase(db);
}
