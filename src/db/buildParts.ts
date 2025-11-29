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
      component_color      TEXT,
      component_category   TEXT,
      component_description TEXT,
      component_condition  TEXT,
      quantity             INTEGER NOT NULL DEFAULT 1,
      is_spare             INTEGER NOT NULL DEFAULT 0,
      FOREIGN KEY(parent_item_id) REFERENCES items(id) ON DELETE CASCADE
    );
  `);

  // Add missing columns for older installs
  const columns = await db.getAllAsync<{ name: string }>(`PRAGMA table_info(build_parts);`);
  const hasDescription = columns.some(col => col.name === 'component_description');
  if (!hasDescription) {
    await db.execAsync(`ALTER TABLE build_parts ADD COLUMN component_description TEXT;`);
  }
}
