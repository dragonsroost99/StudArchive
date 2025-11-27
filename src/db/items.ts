// src/db/items.ts
import { getDb } from './database';

export type ItemType = 'set' | 'part' | 'minifig' | 'moc';

export type Item = {
  id: number;
  type: ItemType;
  name: string;
  number: string | null;
  container_id: number;
  qty: number;
  condition: string | null;   // e.g. "New", "Used", "Mixed"
  color: string | null;       // e.g. "Dark Bluish Gray"
  value_each: number | null;  // per-unit value
  value_total: number | null; // qty * value_each
};

export async function ensureItemsTable(): Promise<void> {
  const db = await getDb();
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS items (
      id           INTEGER PRIMARY KEY NOT NULL,
      type         TEXT NOT NULL,
      name         TEXT NOT NULL,
      number       TEXT,
      container_id INTEGER NOT NULL,
      qty          INTEGER NOT NULL DEFAULT 1,
      condition    TEXT,
      color        TEXT,
      value_each   REAL,
      value_total  REAL,
      FOREIGN KEY(container_id) REFERENCES containers(id) ON DELETE CASCADE
    );
  `);
}

export async function listItemsForContainer(
  containerId: number
): Promise<Item[]> {
  const db = await getDb();
  return db.getAllAsync<Item>(
    `
    SELECT
      id,
      type,
      name,
      number,
      container_id,
      qty,
      condition,
      color,
      value_each,
      value_total
    FROM items
    WHERE container_id = ?
    ORDER BY type ASC, name ASC;
  `,
    [containerId]
  );
}

export async function createItem(params: {
  containerId: number;
  type: ItemType;
  name: string;
  number?: string;
  qty?: number;
  condition?: string;
  color?: string;
  valueEach?: number;
}): Promise<void> {
  const db = await getDb();
  const name = params.name.trim();
  if (!name) return;

  const qty = params.qty ?? 1;

  let valueEach: number | null = null;
  if (typeof params.valueEach === 'number' && !Number.isNaN(params.valueEach)) {
    valueEach = params.valueEach;
  }

  const valueTotal =
    valueEach != null ? valueEach * qty : null;

  await db.runAsync(
    `
    INSERT INTO items
      (type, name, number, container_id, qty, condition, color, value_each, value_total)
    VALUES
      (?, ?, ?, ?, ?, ?, ?, ?, ?);
  `,
    [
      params.type,
      name,
      params.number ?? null,
      params.containerId,
      qty,
      params.condition ?? null,
      params.color ?? null,
      valueEach,
      valueTotal,
    ]
  );
}

export async function updateItem(params: {
  id: number;
  containerId: number;
  type: ItemType;
  name: string;
  number?: string;
  qty?: number;
  condition?: string;
  color?: string;
  valueEach?: number;
}): Promise<void> {
  const db = await getDb();
  const name = params.name.trim();
  if (!name) return;

  const qty = params.qty ?? 1;

  let valueEach: number | null = null;
  if (typeof params.valueEach === 'number' && !Number.isNaN(params.valueEach)) {
    valueEach = params.valueEach;
  }

  const valueTotal =
    valueEach != null ? valueEach * qty : null;

  await db.runAsync(
    `
    UPDATE items
    SET
      type = ?,
      name = ?,
      number = ?,
      container_id = ?,
      qty = ?,
      condition = ?,
      color = ?,
      value_each = ?,
      value_total = ?
    WHERE id = ?;
  `,
    [
      params.type,
      name,
      params.number ?? null,
      params.containerId,
      qty,
      params.condition ?? null,
      params.color ?? null,
      valueEach,
      valueTotal,
      params.id,
    ]
  );
}


export async function deleteItem(id: number): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `
    DELETE FROM items
    WHERE id = ?;
  `,
    [id]
  );
}
