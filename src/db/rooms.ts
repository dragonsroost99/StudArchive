// src/db/rooms.ts
import { getDb } from './database';

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
  const db = await getDb();
  return db.getAllAsync<Room>(`
    SELECT id, name
    FROM rooms
    ORDER BY name ASC;
  `);
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
