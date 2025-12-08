// Migration 002: catalog_parts table for storing BrickLink catalog parts metadata.
export const migration = {
  name: '002_catalog_parts',
  up(tx: any) {
    tx.executeSql(`
      CREATE TABLE IF NOT EXISTS catalog_parts (
        id INTEGER PRIMARY KEY,
        shape_key TEXT NOT NULL,
        name_generic TEXT NOT NULL,
        category_id INTEGER,
        is_minifig_part INTEGER NOT NULL DEFAULT 0,
        is_printed INTEGER NOT NULL DEFAULT 0,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );
    `);

    tx.executeSql(`
      CREATE INDEX IF NOT EXISTS idx_catalog_parts_shape_key
      ON catalog_parts (shape_key);
    `);

    tx.executeSql(`
      CREATE INDEX IF NOT EXISTS idx_catalog_parts_name_generic
      ON catalog_parts (name_generic);
    `);
  },
};
