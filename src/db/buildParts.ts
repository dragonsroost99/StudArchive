// src/db/buildParts.ts
import { getDb } from './database';

/**
 * build_parts table tracks the intended inventory for a build (Set or MOC).
 * Uses the same identity fields as items for easier comparison later.
 */
export async function ensureBuildPartsTable(): Promise<void> {
  const db = await getDb();
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS build_parts (
      id                   INTEGER PRIMARY KEY NOT NULL,
      parent_item_id       INTEGER NOT NULL,
      component_subtype    TEXT NOT NULL,          -- e.g., part, minifig, set, moc
      component_name       TEXT,
      component_number     TEXT,
      component_bricklink_id TEXT,
      component_brickowl_id  TEXT,
      component_rebrickable_id TEXT,
      catalog_part_id      INTEGER,
      catalog_color_id     INTEGER,
      component_color      TEXT,
      component_category   TEXT,
      component_description TEXT,
      component_condition  TEXT,
      quantity             INTEGER NOT NULL DEFAULT 1,
      is_spare             INTEGER NOT NULL DEFAULT 0,
      image_uri            TEXT,
      FOREIGN KEY(parent_item_id) REFERENCES items(id) ON DELETE CASCADE
    );
  `);

  // Add missing columns for older installs
  const columns = await db.getAllAsync<{ name: string }>(`PRAGMA table_info(build_parts);`);
  const hasDescription = columns.some(col => col.name === 'component_description');
  const hasImageUri = columns.some(col => col.name === 'image_uri');
  const hasBricklink = columns.some(col => col.name === 'component_bricklink_id');
  const hasBrickowl = columns.some(col => col.name === 'component_brickowl_id');
  const hasRebrickable = columns.some(col => col.name === 'component_rebrickable_id');
  const hasCatalogPartId = columns.some(col => col.name === 'catalog_part_id');
  const hasCatalogColorId = columns.some(col => col.name === 'catalog_color_id');
  if (!hasDescription) {
    await db.execAsync(`ALTER TABLE build_parts ADD COLUMN component_description TEXT;`);
  }
  if (!hasImageUri) {
    await db.execAsync(`ALTER TABLE build_parts ADD COLUMN image_uri TEXT;`);
  }
  if (!hasBricklink) {
    await db.execAsync(`ALTER TABLE build_parts ADD COLUMN component_bricklink_id TEXT;`);
  }
  if (!hasBrickowl) {
    await db.execAsync(`ALTER TABLE build_parts ADD COLUMN component_brickowl_id TEXT;`);
  }
  if (!hasRebrickable) {
    await db.execAsync(`ALTER TABLE build_parts ADD COLUMN component_rebrickable_id TEXT;`);
  }
  if (!hasCatalogPartId) {
    await db.execAsync(`ALTER TABLE build_parts ADD COLUMN catalog_part_id INTEGER;`);
  }
  if (!hasCatalogColorId) {
    await db.execAsync(`ALTER TABLE build_parts ADD COLUMN catalog_color_id INTEGER;`);
  }
}
