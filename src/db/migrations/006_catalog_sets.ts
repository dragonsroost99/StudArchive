// Migration 006: catalog_sets table for storing set metadata.
export const migration = {
  name: '006_catalog_sets',
  up(tx: any) {
    tx.executeSql(`
      CREATE TABLE IF NOT EXISTS catalog_sets (
        id INTEGER PRIMARY KEY,
        set_key TEXT NOT NULL,
        name TEXT NOT NULL,
        theme TEXT,
        year INTEGER,
        piece_count INTEGER,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );
    `);

    tx.executeSql(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_catalog_sets_set_key
      ON catalog_sets (set_key);
    `);

    tx.executeSql(`
      CREATE INDEX IF NOT EXISTS idx_catalog_sets_name
      ON catalog_sets (name);
    `);
  },
};
