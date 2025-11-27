// src/features/rooms.ts
import { getDb } from '../db/database';

export type Room = { id: number; name: string };

export async function createRoom(name: string): Promise<void> {
  const db = await getDb();
  await db.runAsync('INSERT INTO rooms (name) VALUES (?);', [name.trim()]);
}

export async function listRooms(): Promise<Room[]> {
  const db = await getDb();
  return db.getAllAsync<Room>('SELECT id, name FROM rooms ORDER BY name ASC;');
}

export async function deleteRoom(id: number): Promise<void> {
  const db = await getDb();
  await db.runAsync('DELETE FROM rooms WHERE id = ?;', [id]);
}
