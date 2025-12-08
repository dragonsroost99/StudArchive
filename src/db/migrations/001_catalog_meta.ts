// Migration 001: catalog_meta table for storing catalog metadata key/value pairs.
export const migration = {
  name: '001_catalog_meta',
  up(tx: any) {
    tx.executeSql(`
      CREATE TABLE IF NOT EXISTS catalog_meta (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
    `);
  },
};
