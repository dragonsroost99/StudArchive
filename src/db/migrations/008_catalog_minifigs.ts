// Migration 008: catalog_minifigs table for minifigure metadata.
export const migration = {
  name: '008_catalog_minifigs',
  up(tx: any) {
    tx.executeSql(`
      CREATE TABLE IF NOT EXISTS catalog_minifigs (
        id INTEGER PRIMARY KEY,
        fig_key TEXT NOT NULL,
        name TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );
    `);

    tx.executeSql(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_catalog_minifigs_fig_key
      ON catalog_minifigs (fig_key);
    `);

    tx.executeSql(`
      CREATE INDEX IF NOT EXISTS idx_catalog_minifigs_name
      ON catalog_minifigs (name);
    `);
  },
};
