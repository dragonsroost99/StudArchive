// Migration 007: catalog_set_parts table for set inventories.
export const migration = {
  name: '007_catalog_set_parts',
  up(tx: any) {
    tx.executeSql(`
      CREATE TABLE IF NOT EXISTS catalog_set_parts (
        id INTEGER PRIMARY KEY,
        set_id INTEGER NOT NULL,
        part_id INTEGER NOT NULL,
        color_id INTEGER NOT NULL,
        quantity INTEGER NOT NULL,
        is_spare INTEGER NOT NULL DEFAULT 0
      );
    `);

    tx.executeSql(`
      CREATE INDEX IF NOT EXISTS idx_catalog_set_parts_set
      ON catalog_set_parts (set_id);
    `);

    tx.executeSql(`
      CREATE INDEX IF NOT EXISTS idx_catalog_set_parts_part
      ON catalog_set_parts (part_id);
    `);

    tx.executeSql(`
      CREATE INDEX IF NOT EXISTS idx_catalog_set_parts_color
      ON catalog_set_parts (color_id);
    `);
  },
};
