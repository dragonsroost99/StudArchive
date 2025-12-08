// Migration 003: catalog_part_ids table for mapping external source IDs to catalog parts.
export const migration = {
  name: '003_catalog_part_ids',
  up(tx: any) {
    tx.executeSql(`
      CREATE TABLE IF NOT EXISTS catalog_part_ids (
        id INTEGER PRIMARY KEY,
        part_id INTEGER NOT NULL,
        source TEXT NOT NULL,
        source_id TEXT NOT NULL
      );
    `);

    tx.executeSql(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_catalog_part_ids_source_unique
      ON catalog_part_ids (source, source_id);
    `);

    tx.executeSql(`
      CREATE INDEX IF NOT EXISTS idx_catalog_part_ids_source_lookup
      ON catalog_part_ids (source, source_id);
    `);

    tx.executeSql(`
      CREATE INDEX IF NOT EXISTS idx_catalog_part_ids_part
      ON catalog_part_ids (part_id);
    `);
  },
};
