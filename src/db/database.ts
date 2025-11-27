// src/db/database.ts
import { openDatabaseAsync, type SQLiteDatabase } from 'expo-sqlite';

let dbPromise: Promise<SQLiteDatabase> | null = null;

/**
 * Get a shared async database instance.
 * Note: Using v2 db name so we can evolve schema without complex migrations.
 */
export function getDb(): Promise<SQLiteDatabase> {
  if (!dbPromise) {
    dbPromise = openDatabaseAsync('legoCollection_v2.db'); // 👈 new DB file
  }
  return dbPromise;
}

/**
 * Run basic migrations (migrations table only for now).
 */
export async function initDb(): Promise<void> {
  const db = await getDb();

  // Create migrations table if it doesn't exist
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS migrations (
      id      INTEGER PRIMARY KEY NOT NULL,
      name    TEXT NOT NULL,
      run_at  TEXT NOT NULL
    );
  `);
}
