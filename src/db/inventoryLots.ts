// Schema helpers for inventory lots, imports, and marketplace cross-references.
// These helpers keep the schema in sync without relying on versioned migrations.
import { getDb } from './database';

async function tableHasColumn(table: string, column: string): Promise<boolean> {
  const db = await getDb();
  const columns = await db.getAllAsync<{ name: string }>(`PRAGMA table_info(${table});`);
  return columns.some(col => col.name === column);
}

export async function ensurePartCrossrefTable(): Promise<void> {
  const db = await getDb();
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS part_crossref (
      id INTEGER PRIMARY KEY,
      canonical_part_id TEXT NOT NULL,
      rebrickable_part_id TEXT,
      bricklink_part_id TEXT,
      brickowl_part_id TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );
  `);
  await db.execAsync(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_part_crossref_canonical
      ON part_crossref (canonical_part_id);
  `);
  await db.execAsync(`
    CREATE INDEX IF NOT EXISTS idx_part_crossref_bl
      ON part_crossref (bricklink_part_id);
  `);
}

export async function ensureColorCrossrefTable(): Promise<void> {
  const db = await getDb();
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS color_crossref (
      id INTEGER PRIMARY KEY,
      canonical_color_id INTEGER NOT NULL,
      rebrickable_color_id INTEGER,
      bricklink_color_id INTEGER,
      brickowl_color_id INTEGER,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );
  `);
  await db.execAsync(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_color_crossref_canonical
      ON color_crossref (canonical_color_id);
  `);
  await db.execAsync(`
    CREATE INDEX IF NOT EXISTS idx_color_crossref_bl
      ON color_crossref (bricklink_color_id);
  `);
}

export async function ensureImportBatchTable(): Promise<void> {
  const db = await getDb();
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS import_batch (
      id INTEGER PRIMARY KEY,
      source TEXT NOT NULL,
      file_name TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      lot_count INTEGER DEFAULT 0,
      piece_count INTEGER DEFAULT 0
    );
  `);
}

export async function ensureInventoryLotTable(): Promise<void> {
  const db = await getDb();
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS inventory_lot (
      id INTEGER PRIMARY KEY,
      canonical_part_id TEXT NOT NULL,
      canonical_color_id INTEGER NOT NULL,
      quantity INTEGER NOT NULL DEFAULT 0,
      condition TEXT DEFAULT 'U',
      source TEXT,
      external_item_id TEXT,
      external_color_id TEXT,
      import_batch_id INTEGER,
      notes TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY(import_batch_id) REFERENCES import_batch(id)
    );
  `);

  // Add any missing columns for older installs.
  const maybeAddColumn = async (name: string, definition: string) => {
    const hasColumn = await tableHasColumn('inventory_lot', name);
    if (!hasColumn) {
      await db.execAsync(`ALTER TABLE inventory_lot ADD COLUMN ${definition};`);
    }
  };

  await maybeAddColumn('source', 'source TEXT');
  await maybeAddColumn('external_item_id', 'external_item_id TEXT');
  await maybeAddColumn('external_color_id', 'external_color_id TEXT');
  await maybeAddColumn('import_batch_id', 'import_batch_id INTEGER');
  await maybeAddColumn('notes', 'notes TEXT');
  await maybeAddColumn('created_at', "created_at TEXT DEFAULT (datetime('now'))");
  await maybeAddColumn('updated_at', "updated_at TEXT DEFAULT (datetime('now'))");

  await db.execAsync(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_inventory_lot_unique_cond
      ON inventory_lot (canonical_part_id, canonical_color_id, condition);
  `);
}

export async function ensureInventoryImportSchema(): Promise<void> {
  await ensurePartCrossrefTable();
  await ensureColorCrossrefTable();
  await ensureImportBatchTable();
  await ensureInventoryLotTable();
}
