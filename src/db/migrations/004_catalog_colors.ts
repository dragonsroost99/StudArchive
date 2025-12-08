// Migration 004: catalog_colors table for storing color metadata.
export const migration = {
  name: '004_catalog_colors',
  up(tx: any) {
    tx.executeSql(`
      CREATE TABLE IF NOT EXISTS catalog_colors (
        id INTEGER PRIMARY KEY,
        generic_name TEXT NOT NULL,
        rgb_hex TEXT,
        luma REAL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );
    `);

    tx.executeSql(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_catalog_colors_generic_name
      ON catalog_colors (generic_name);
    `);
  },
};
