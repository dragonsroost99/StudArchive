// Migration 011: Seed default catalog metadata entries.
export const migration = {
  name: '011_catalog_meta_seed',
  up(tx: any) {
    tx.executeSql(
      `
        INSERT OR REPLACE INTO catalog_meta (key, value)
        VALUES
          ('catalog_schema_version', '1'),
          ('rebrickable_last_sync', '1970-01-01T00:00:00Z'),
          ('bricklink_last_sync', '1970-01-01T00:00:00Z'),
          ('brickowl_last_sync', '1970-01-01T00:00:00Z');
      `
    );
  },
  down(tx: any) {
    tx.executeSql(
      `
        DELETE FROM catalog_meta
        WHERE key IN (
          'catalog_schema_version',
          'rebrickable_last_sync',
          'bricklink_last_sync',
          'brickowl_last_sync'
        );
      `
    );
  },
};
