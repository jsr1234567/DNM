import type { Database } from "bun:sqlite";
import { getSetting, setSetting } from "../db/settings.ts";

interface VectorConfig {
  model: string;
  dimensions: number;
}

function blob(vector: readonly number[]): Uint8Array {
  return new Uint8Array(new Float32Array(vector).buffer);
}

export function configureVectorIndex(db: Database, config: VectorConfig): void {
  if (!Number.isInteger(config.dimensions) || config.dimensions <= 0) {
    throw new Error("Embedding dimensions must be a positive integer");
  }
  const existing = getSetting<VectorConfig>(db, "embedding_config");
  if (existing && (existing.model !== config.model || existing.dimensions !== config.dimensions)) {
    throw new Error("Embedding configuration changed; run the explicit vector reindex before writing vectors");
  }
  db.exec(`CREATE VIRTUAL TABLE IF NOT EXISTS chunk_vectors USING vec0(embedding float[${config.dimensions}])`);
  setSetting(db, "embedding_config", config);
}

export function resetVectorIndexForModel(db: Database, config: VectorConfig): void {
  if (!Number.isInteger(config.dimensions) || config.dimensions <= 0) {
    throw new Error("Embedding dimensions must be a positive integer");
  }
  db.transaction(() => {
    db.exec("DROP TABLE IF EXISTS chunk_vectors");
    db.exec("DELETE FROM chunk_embeddings");
    setSetting(db, "embedding_config", config);
    db.exec(`CREATE VIRTUAL TABLE chunk_vectors USING vec0(embedding float[${config.dimensions}])`);
  })();
}

export function storeChunkEmbedding(
  db: Database,
  chunkId: number,
  config: VectorConfig,
  embedding: readonly number[],
): void {
  if (embedding.length !== config.dimensions) throw new Error("Embedding dimension mismatch");
  configureVectorIndex(db, config);
  const bytes = blob(embedding);
  const now = new Date().toISOString();
  db.transaction(() => {
    db.query("DELETE FROM chunk_vectors WHERE rowid = ?").run(chunkId);
    db.query("INSERT INTO chunk_vectors(rowid, embedding) VALUES (?, ?)").run(chunkId, bytes);
    db.query(`
      INSERT INTO chunk_embeddings(chunk_id, model, dimensions, embedding, created_at)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(chunk_id) DO UPDATE SET model = excluded.model,
        dimensions = excluded.dimensions, embedding = excluded.embedding,
        created_at = excluded.created_at
    `).run(chunkId, config.model, config.dimensions, bytes, now);
  })();
}

export function searchChunkVectors(db: Database, embedding: readonly number[], limit = 8): Array<{
  chunkId: number;
  distance: number;
}> {
  const config = getSetting<VectorConfig>(db, "embedding_config");
  if (!config || embedding.length !== config.dimensions) return [];
  const rows = db.query(`
    SELECT rowid AS chunk_id, distance
    FROM chunk_vectors
    WHERE embedding MATCH ?
    ORDER BY distance
    LIMIT ?
  `).all(blob(embedding), Math.max(1, Math.min(25, Math.trunc(limit)))) as Array<{
    chunk_id: number;
    distance: number;
  }>;
  return rows.map((row) => ({ chunkId: row.chunk_id, distance: row.distance }));
}
