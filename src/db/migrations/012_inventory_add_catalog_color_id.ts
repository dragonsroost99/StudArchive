// Migration 012: add catalog_color_id to inventory tables for future catalog color linkage.
export const migration = {
  name: '012_inventory_add_catalog_color_id',
  up(tx: any) {
    // Items table used by listing/edit screens
    tx.executeSql(`ALTER TABLE items ADD COLUMN catalog_color_id INTEGER;`);

    // If additional inventory tables are introduced later, extend this migration pattern.
  },
};
