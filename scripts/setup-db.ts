import { closeDatabase, loadVectorExtension, openDatabase } from "../src/db/index.ts";

const db = await openDatabase();
try {
  const vector = loadVectorExtension(db);
  console.log("SQLite database initialized.");
  if (vector.available) {
    console.log(`sqlite-vec available (${vector.version}).`);
  } else {
    console.warn(`sqlite-vec unavailable; FTS5 keyword search remains enabled: ${vector.reason}`);
  }
} finally {
  closeDatabase(db);
}
