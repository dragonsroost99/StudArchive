// Local catalog search utility (offline).
import { getDb } from './database';
import { searchPartsOnRebrickable, type RebrickablePartSearchResult } from '../services/inventoryImport/rebrickable';
import { upsertCatalogPartFromRebrickable } from './catalogUpsert';

export type CatalogSource = 'BRICKLINK' | 'REBRICKABLE' | 'BRICKOWL';

export async function searchCatalog(
  query: string,
  preferredSource: CatalogSource
): Promise<
  Array<{
    partId: number;
    shapeKey: string;
    genericName: string;
    platformId?: string | null;
  }>
> {
  const trimmed = query.trim();
  if (!trimmed) return [];

  const db = await getDb();
  await ensureCatalogTables(db);
  const idLike = /^[a-zA-Z0-9]+$/.test(trimmed);

  if (idLike) {
    const rows = await db.getAllAsync<{
      partId: number;
      shapeKey: string;
      genericName: string;
      platformId: string | null;
    }>(
      `
        SELECT
          p.id AS partId,
          p.shape_key AS shapeKey,
          p.name_generic AS genericName,
          pi.source_id AS platformId
        FROM catalog_parts p
        LEFT JOIN catalog_part_ids pi
          ON pi.part_id = p.id
         AND pi.source = ?
        WHERE p.shape_key LIKE ?
        ORDER BY p.shape_key ASC
        LIMIT 50;
      `,
      preferredSource,
      `${trimmed}%`
    );
    return rows;
  }

  const rows = await db.getAllAsync<{
    partId: number;
    shapeKey: string;
    genericName: string;
    platformId: string | null;
  }>(
    `
      SELECT
        p.id AS partId,
        p.shape_key AS shapeKey,
        p.name_generic AS genericName,
        pi.source_id AS platformId
      FROM catalog_parts p
      LEFT JOIN catalog_part_ids pi
        ON pi.part_id = p.id
       AND pi.source = ?
      WHERE p.name_generic LIKE ?
         OR p.shape_key LIKE ?
      ORDER BY p.name_generic ASC
      LIMIT 50;
    `,
    preferredSource,
    `%${trimmed}%`,
    `%${trimmed}%`
  );
  return rows;
}

export async function searchCatalogWithFallback(
  query: string,
  preferredSource: CatalogSource
): Promise<
  Array<{
    partId: number;
    shapeKey: string;
    genericName: string;
    platformId?: string | null;
  }>
> {
  const trimmed = query.trim();
  if (!trimmed) return [];

  const local = await searchCatalog(trimmed, preferredSource);
  if (local.length > 0) return local;

  // Fallback to Rebrickable only
  let remoteResults: RebrickablePartSearchResult[] = [];
  try {
    remoteResults = await searchPartsOnRebrickable(trimmed);
  } catch (error) {
    console.warn('[catalogSearch] Rebrickable fallback failed', trimmed, error);
    throw error;
  }

  if (!Array.isArray(remoteResults) || remoteResults.length === 0) {
    return [];
  }

  for (const part of remoteResults) {
    await upsertCatalogPartFromRebrickable({
      id: part.partNum,
      name: part.name,
    });
  }

  console.log('[catalogSearch] Fallback hydrated parts', remoteResults.length);
  return searchCatalog(trimmed, preferredSource);
}

const ensureOnce: { current: Promise<void> | null } = { current: null };
async function ensureCatalogTables(db: Awaited<ReturnType<typeof getDb>>): Promise<void> {
  if (ensureOnce.current) return ensureOnce.current;
  ensureOnce.current = (async () => {
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS catalog_parts (
        id INTEGER PRIMARY KEY,
        shape_key TEXT NOT NULL,
        name_generic TEXT NOT NULL,
        category_id INTEGER,
        is_minifig_part INTEGER NOT NULL DEFAULT 0,
        is_printed INTEGER NOT NULL DEFAULT 0,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );
    `);
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS catalog_part_ids (
        id INTEGER PRIMARY KEY,
        part_id INTEGER NOT NULL,
        source TEXT NOT NULL,
        source_id TEXT NOT NULL
      );
    `);
    await db.execAsync(`
      CREATE INDEX IF NOT EXISTS idx_catalog_part_ids_source_lookup
      ON catalog_part_ids (source, source_id);
    `);
    await db.execAsync(`
      CREATE INDEX IF NOT EXISTS idx_catalog_part_ids_part
      ON catalog_part_ids (part_id);
    `);
  })();
  return ensureOnce.current;
}
