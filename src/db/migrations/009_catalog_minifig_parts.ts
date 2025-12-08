// Migration 009: catalog_minifig_parts table for minifigure inventories.
export const migration = {
  name: '009_catalog_minifig_parts',
  up(tx: any) {
    tx.executeSql(`
      CREATE TABLE IF NOT EXISTS catalog_minifig_parts (
        id INTEGER PRIMARY KEY,
        minifig_id INTEGER NOT NULL,
        part_id INTEGER NOT NULL,
        color_id INTEGER NOT NULL,
        quantity INTEGER NOT NULL
      );
    `);

    tx.executeSql(`
      CREATE INDEX IF NOT EXISTS idx_catalog_minifig_parts_minifig
      ON catalog_minifig_parts (minifig_id);
    `);

    tx.executeSql(`
      CREATE INDEX IF NOT EXISTS idx_catalog_minifig_parts_part
      ON catalog_minifig_parts (part_id);
    `);
  },
};
