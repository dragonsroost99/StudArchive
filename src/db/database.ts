// src/db/database.ts
import { openDatabaseAsync } from 'expo-sqlite/next';

export type DB = SQLite.WebSQLDatabase;

let _db: DB | null = null;

export async function getDb() {
  return await openDatabaseAsync('legoCollection.db');
}