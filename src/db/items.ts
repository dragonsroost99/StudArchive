// src/db/items.ts
import { getDb } from './database';

export type ItemType = 'set' | 'part' | 'minifig' | 'moc';

export type Item = {
  id: number;
  type: ItemType;
  name: string;
  number: string | null;
  bricklink_id?: string | null;
  brickowl_id?: string | null;
  rebrickable_id?: string | null;
  catalog_color_id?: number | null;
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

export type LoosePartRow = {
  number: string | null;
  color: string | null;
  qty: number | null;
};

export async function ensureItemsTable(): Promise<void> {
  const db = await getDb();
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS items (
      id           INTEGER PRIMARY KEY NOT NULL,
      type         TEXT NOT NULL,
      name         TEXT NOT NULL,
      number       TEXT,
      bricklink_id TEXT,
      brickowl_id  TEXT,
      rebrickable_id TEXT,
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
  const hasBricklinkId = columns.some(col => col.name === 'bricklink_id');
  const hasBrickowlId = columns.some(col => col.name === 'brickowl_id');
  const hasRebrickableId = columns.some(col => col.name === 'rebrickable_id');
  const hasCatalogColorId = columns.some(col => col.name === 'catalog_color_id');

  if (!hasCategory) {
    await db.execAsync(`ALTER TABLE items ADD COLUMN category TEXT;`);
  }
  if (!hasDescription) {
    await db.execAsync(`ALTER TABLE items ADD COLUMN description TEXT;`);
  }
  if (!hasImageUri) {
    await db.execAsync(`ALTER TABLE items ADD COLUMN image_uri TEXT;`);
  }
  if (!hasBricklinkId) {
    await db.execAsync(`ALTER TABLE items ADD COLUMN bricklink_id TEXT;`);
  }
  if (!hasBrickowlId) {
    await db.execAsync(`ALTER TABLE items ADD COLUMN brickowl_id TEXT;`);
  }
  if (!hasRebrickableId) {
    await db.execAsync(`ALTER TABLE items ADD COLUMN rebrickable_id TEXT;`);
  }
  if (!hasCatalogColorId) {
    await db.execAsync(`ALTER TABLE items ADD COLUMN catalog_color_id INTEGER;`);
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
      bricklink_id,
      brickowl_id,
      rebrickable_id,
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
  bricklinkId?: string | null;
  brickowlId?: string | null;
  rebrickableId?: string | null;
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
      (type, name, number, bricklink_id, brickowl_id, rebrickable_id, container_id, qty, condition, color, category, description, value_each, value_total, image_uri)
    VALUES
      (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
  `,
    [
      params.type,
      name,
      params.number ?? null,
      params.bricklinkId ?? null,
      params.brickowlId ?? null,
      params.rebrickableId ?? null,
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
  bricklinkId?: string | null;
  brickowlId?: string | null;
  rebrickableId?: string | null;
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
      bricklink_id = ?,
      brickowl_id = ?,
      rebrickable_id = ?,
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
      params.bricklinkId ?? null,
      params.brickowlId ?? null,
      params.rebrickableId ?? null,
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

export async function listLooseParts(): Promise<LoosePartRow[]> {
  const db = await getDb();
  return db.getAllAsync<LoosePartRow>(`
    SELECT
      number,
      color,
      qty
    FROM items
    WHERE type = 'part'
      AND number IS NOT NULL
    ORDER BY number ASC;
  `);
}
