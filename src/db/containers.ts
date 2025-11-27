// src/db/containers.ts
import { getDb } from './database';

export type Container = {
  id: number;
  name: string;
  room_id: number;
};

export async function ensureContainersTable(): Promise<void> {
  const db = await getDb();
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS containers (
      id      INTEGER PRIMARY KEY NOT NULL,
      name    TEXT NOT NULL,
      room_id INTEGER NOT NULL,
      FOREIGN KEY(room_id) REFERENCES rooms(id) ON DELETE CASCADE
    );
  `);
}

export async function listContainersForRoom(
  roomId: number
): Promise<Container[]> {
  const db = await getDb();
  return db.getAllAsync<Container>(
    `
    SELECT id, name, room_id
    FROM containers
    WHERE room_id = ?
    ORDER BY name ASC;
  `,
    [roomId]
  );
}

export async function createContainer(roomId: number, name: string) {
  const trimmed = name.trim();
  if (!trimmed) return;

  const db = await getDb();
  await db.runAsync(
    `INSERT INTO containers (name, room_id) VALUES (?, ?);`,
    [trimmed, roomId]
  );
}

export async function deleteContainer(id: number) {
  const db = await getDb();
  await db.runAsync(`DELETE FROM containers WHERE id = ?;`, [id]);
}
