// src/db/rooms.ts
import { getDb, resetDb } from './database';

export type Room = {
  id: number;
  name: string;
};

export async function ensureRoomsTable(): Promise<void> {
  const db = await getDb();
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS rooms (
      id   INTEGER PRIMARY KEY NOT NULL,
      name TEXT NOT NULL UNIQUE
    );
  `);
}

export async function listRooms(): Promise<Room[]> {
  let attempt = 0;
  while (attempt < 2) {
    try {
      const db = await getDb();
      return await db.getAllAsync<Room>(`
        SELECT id, name
        FROM rooms
        ORDER BY name ASC;
      `);
    } catch (error: any) {
      attempt += 1;
      const message = String(error?.message ?? error ?? '');
      console.warn('[Rooms] listRooms failed', message);
      const transient =
        message.includes('shared object') ||
        message.includes('prepareAsync') ||
        message.includes('NativeDatabase');
      if (attempt >= 2 || !transient) {
        throw error;
      }
      resetDb();
    }
  }
  return [];
}

export async function createRoom(name: string): Promise<void> {
  const trimmed = name.trim();
  if (!trimmed) return;

  const db = await getDb();
  await db.runAsync(
    `INSERT INTO rooms (name) VALUES (?);`,
    [trimmed]
  );
}

export async function deleteRoom(id: number): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `DELETE FROM rooms WHERE id = ?;`,
    [id]
  );
}
