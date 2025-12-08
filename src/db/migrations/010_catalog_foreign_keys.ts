// Migration 010: Add foreign key constraints for catalog tables using safe rebuilds.
export const migration = {
  name: '010_catalog_foreign_keys',
  up(tx: any) {
    // Disable FK enforcement during rebuilds
    tx.executeSql(`PRAGMA foreign_keys = OFF;`);

    // catalog_part_ids with FK to catalog_parts
    tx.executeSql(`
      CREATE TABLE IF NOT EXISTS catalog_part_ids_new (
        id INTEGER PRIMARY KEY,
        part_id INTEGER NOT NULL,
        source TEXT NOT NULL,
        source_id TEXT NOT NULL,
        FOREIGN KEY(part_id) REFERENCES catalog_parts(id) ON DELETE CASCADE ON UPDATE CASCADE
      );
    `);
    tx.executeSql(`
      INSERT INTO catalog_part_ids_new (id, part_id, source, source_id)
      SELECT id, part_id, source, source_id FROM catalog_part_ids;
    `);
    tx.executeSql(`DROP TABLE catalog_part_ids;`);
    tx.executeSql(`ALTER TABLE catalog_part_ids_new RENAME TO catalog_part_ids;`);
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

    // catalog_color_labels with FK to catalog_colors
    tx.executeSql(`
      CREATE TABLE IF NOT EXISTS catalog_color_labels_new (
        id INTEGER PRIMARY KEY,
        color_id INTEGER NOT NULL,
        source TEXT NOT NULL,
        source_id INTEGER,
        name TEXT NOT NULL,
        FOREIGN KEY(color_id) REFERENCES catalog_colors(id) ON DELETE CASCADE ON UPDATE CASCADE
      );
    `);
    tx.executeSql(`
      INSERT INTO catalog_color_labels_new (id, color_id, source, source_id, name)
      SELECT id, color_id, source, source_id, name FROM catalog_color_labels;
    `);
    tx.executeSql(`DROP TABLE catalog_color_labels;`);
    tx.executeSql(`ALTER TABLE catalog_color_labels_new RENAME TO catalog_color_labels;`);
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

    // catalog_set_parts with FKs to catalog_sets, catalog_parts, catalog_colors
    tx.executeSql(`
      CREATE TABLE IF NOT EXISTS catalog_set_parts_new (
        id INTEGER PRIMARY KEY,
        set_id INTEGER NOT NULL,
        part_id INTEGER NOT NULL,
        color_id INTEGER NOT NULL,
        quantity INTEGER NOT NULL,
        is_spare INTEGER NOT NULL DEFAULT 0,
        FOREIGN KEY(set_id) REFERENCES catalog_sets(id) ON DELETE CASCADE ON UPDATE CASCADE,
        FOREIGN KEY(part_id) REFERENCES catalog_parts(id) ON DELETE CASCADE ON UPDATE CASCADE,
        FOREIGN KEY(color_id) REFERENCES catalog_colors(id) ON DELETE CASCADE ON UPDATE CASCADE
      );
    `);
    tx.executeSql(`
      INSERT INTO catalog_set_parts_new (id, set_id, part_id, color_id, quantity, is_spare)
      SELECT id, set_id, part_id, color_id, quantity, is_spare FROM catalog_set_parts;
    `);
    tx.executeSql(`DROP TABLE catalog_set_parts;`);
    tx.executeSql(`ALTER TABLE catalog_set_parts_new RENAME TO catalog_set_parts;`);
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

    // catalog_minifig_parts with FKs to catalog_minifigs, catalog_parts, catalog_colors
    tx.executeSql(`
      CREATE TABLE IF NOT EXISTS catalog_minifig_parts_new (
        id INTEGER PRIMARY KEY,
        minifig_id INTEGER NOT NULL,
        part_id INTEGER NOT NULL,
        color_id INTEGER NOT NULL,
        quantity INTEGER NOT NULL,
        FOREIGN KEY(minifig_id) REFERENCES catalog_minifigs(id) ON DELETE CASCADE ON UPDATE CASCADE,
        FOREIGN KEY(part_id) REFERENCES catalog_parts(id) ON DELETE CASCADE ON UPDATE CASCADE,
        FOREIGN KEY(color_id) REFERENCES catalog_colors(id) ON DELETE CASCADE ON UPDATE CASCADE
      );
    `);
    tx.executeSql(`
      INSERT INTO catalog_minifig_parts_new (id, minifig_id, part_id, color_id, quantity)
      SELECT id, minifig_id, part_id, color_id, quantity FROM catalog_minifig_parts;
    `);
    tx.executeSql(`DROP TABLE catalog_minifig_parts;`);
    tx.executeSql(`ALTER TABLE catalog_minifig_parts_new RENAME TO catalog_minifig_parts;`);
    tx.executeSql(`
      CREATE INDEX IF NOT EXISTS idx_catalog_minifig_parts_minifig
      ON catalog_minifig_parts (minifig_id);
    `);
    tx.executeSql(`
      CREATE INDEX IF NOT EXISTS idx_catalog_minifig_parts_part
      ON catalog_minifig_parts (part_id);
    `);

    // Re-enable FK enforcement
    tx.executeSql(`PRAGMA foreign_keys = ON;`);
  },
};
