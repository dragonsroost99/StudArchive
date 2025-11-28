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
  category: string | null;
  description: string | null;
  value_each: number | null;  // per-unit value
  value_total: number | null; // qty * value_each
  image_uri?: string | null;
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
      category     TEXT,
      description  TEXT,
      value_each   REAL,
      value_total  REAL,
      image_uri    TEXT,
      FOREIGN KEY(container_id) REFERENCES containers(id) ON DELETE CASCADE
    );
  `);

  const columns = await db.getAllAsync<{ name: string }>(`PRAGMA table_info(items);`);
  const hasCategory = columns.some(col => col.name === 'category');
  const hasDescription = columns.some(col => col.name === 'description');
  const hasImageUri = columns.some(col => col.name === 'image_uri');

  if (!hasCategory) {
    await db.execAsync(`ALTER TABLE items ADD COLUMN category TEXT;`);
  }
  if (!hasDescription) {
    await db.execAsync(`ALTER TABLE items ADD COLUMN description TEXT;`);
  }
  if (!hasImageUri) {
    await db.execAsync(`ALTER TABLE items ADD COLUMN image_uri TEXT;`);
  }
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
      category,
      description,
      value_each,
      value_total,
      image_uri
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
  category?: string;
  description?: string;
  valueEach?: number;
  imageUri?: string | null;
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
      (type, name, number, container_id, qty, condition, color, category, description, value_each, value_total, image_uri)
    VALUES
      (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
  `,
    [
      params.type,
      name,
      params.number ?? null,
      params.containerId,
      qty,
      params.condition ?? null,
      params.color ?? null,
      params.category ?? null,
      params.description ?? null,
      valueEach,
      valueTotal,
      params.imageUri ?? null,
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
  category?: string;
  description?: string;
  valueEach?: number;
  imageUri?: string | null;
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
      category = ?,
      description = ?,
      value_each = ?,
      value_total = ?,
      image_uri = ?
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
      params.category ?? null,
      params.description ?? null,
      valueEach,
      valueTotal,
      params.imageUri ?? null,
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
