// src/features/rooms.ts
import { db } from '../db/database';

export type Room = { id: number; name: string };

export function createRoom(name: string): Promise<void> {
  return new Promise((resolve, reject) => {
    db.transaction(tx => {
      tx.executeSql(
        'INSERT INTO rooms (name) VALUES (?);',
        [name.trim()],
        () => resolve(),
        (_t, err) => {
          reject(err);
          return true;
        }
      );
    });
  });
}

export function listRooms(): Promise<Room[]> {
  return new Promise((resolve, reject) => {
    db.transaction(tx => {
      tx.executeSql(
        'SELECT id, name FROM rooms ORDER BY name ASC;',
        [],
        (_t, res) => {
          const out: Room[] = [];
          for (let i = 0; i < res.rows.length; i++) {
            out.push(res.rows.item(i));
          }
          resolve(out);
        },
        (_t, err) => {
          reject(err);
          return true;
        }
      );
    });
  });
}

export function deleteRoom(id: number): Promise<void> {
  return new Promise((resolve, reject) => {
    db.transaction(tx => {
      tx.executeSql(
        'DELETE FROM rooms WHERE id = ?;',
        [id],
        () => resolve(),
        (_t, err) => {
          reject(err);
          return true;
        }
      );
    });
  });
}
