// Migration 005: catalog_color_labels table for source-specific color naming.
export const migration = {
  name: '005_catalog_color_labels',
  up(tx: any) {
    tx.executeSql(`
      CREATE TABLE IF NOT EXISTS catalog_color_labels (
        id INTEGER PRIMARY KEY,
        color_id INTEGER NOT NULL,
        source TEXT NOT NULL,
        source_id INTEGER,
        name TEXT NOT NULL
      );
    `);

    tx.executeSql(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_catalog_color_labels_source_unique
      ON catalog_color_labels (source, source_id);
    `);

    tx.executeSql(`
      CREATE INDEX IF NOT EXISTS idx_catalog_color_labels_source_name
      ON catalog_color_labels (source, name);
    `);

    tx.executeSql(`
      CREATE INDEX IF NOT EXISTS idx_catalog_color_labels_color
      ON catalog_color_labels (color_id);
    `);
  },
};
