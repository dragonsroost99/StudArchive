import { getDb } from './database';

export interface RebrickablePartPayload {
  id: string;
  name: string;
}

async function ensureCatalogCore(db: Awaited<ReturnType<typeof getDb>>): Promise<void> {
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
    CREATE UNIQUE INDEX IF NOT EXISTS idx_catalog_part_ids_source_unique
    ON catalog_part_ids (source, source_id);
  `);
  await db.execAsync(`
    CREATE INDEX IF NOT EXISTS idx_catalog_part_ids_source_lookup
    ON catalog_part_ids (source, source_id);
  `);
  await db.execAsync(`
    CREATE INDEX IF NOT EXISTS idx_catalog_part_ids_part
    ON catalog_part_ids (part_id);
  `);
}

export async function upsertCatalogPartFromRebrickable(
  payload: RebrickablePartPayload
): Promise<number> {
  const db = await getDb();
  await ensureCatalogCore(db);
  const now = Date.now();

  let partId = 0;

  await db.withExclusiveTransactionAsync(async txn => {
    const existing = await txn.getFirstAsync<{ id: number; name_generic: string }>(
      `
        SELECT id, name_generic
        FROM catalog_parts
        WHERE shape_key = ?
        LIMIT 1;
      `,
      payload.id
    );

    if (existing) {
      partId = existing.id;
      if ((existing.name_generic ?? '') !== payload.name) {
        await txn.runAsync(
          `
            UPDATE catalog_parts
            SET name_generic = ?, updated_at = ?
            WHERE id = ?;
          `,
          payload.name,
          now,
          partId
        );
      } else {
        await txn.runAsync(
          `
            UPDATE catalog_parts
            SET updated_at = ?
            WHERE id = ?;
          `,
          now,
          partId
        );
      }
    } else {
      const insertRes = await txn.runAsync(
        `
          INSERT INTO catalog_parts (
            shape_key,
            name_generic,
            category_id,
            is_minifig_part,
            is_printed,
            created_at,
            updated_at
          )
          VALUES (?, ?, NULL, 0, 0, ?, ?);
        `,
        payload.id,
        payload.name,
        now,
        now
      );
      partId = Number(insertRes.lastInsertRowId ?? 0);
    }

    await txn.runAsync(
      `
        INSERT INTO catalog_part_ids (part_id, source, source_id)
        VALUES (?, 'REBRICKABLE', ?)
        ON CONFLICT(source, source_id) DO UPDATE SET
          part_id = excluded.part_id;
      `,
      partId,
      payload.id
    );
  });

  return partId;
}

export interface RebrickableColorPayload {
  id: number;
  name: string;
  rgb?: string;
  is_trans?: boolean;
}

export async function upsertCatalogColorFromRebrickable(
  payload: RebrickableColorPayload
): Promise<number> {
  const db = await getDb();
  const now = Date.now();

  let colorId = 0;
  await db.withExclusiveTransactionAsync(async txn => {
    const existingLabel = await txn.getFirstAsync<{
      color_id: number;
    }>(
      `
        SELECT color_id
        FROM catalog_color_labels
        WHERE source = 'REBRICKABLE' AND source_id = ?
        LIMIT 1;
      `,
      payload.id
    );

    if (existingLabel?.color_id) {
      colorId = existingLabel.color_id;
      const existingColor = await txn.getFirstAsync<{ generic_name: string | null; rgb_hex: string | null }>(
        `SELECT generic_name, rgb_hex FROM catalog_colors WHERE id = ? LIMIT 1;`,
        colorId
      );
      if (existingColor) {
        const needsName = !existingColor.generic_name || existingColor.generic_name.trim().length === 0;
        const needsRgb = payload.rgb && payload.rgb !== existingColor.rgb_hex;
        if (needsName || needsRgb) {
          await txn.runAsync(
            `
              UPDATE catalog_colors
              SET generic_name = COALESCE(?, generic_name),
                  rgb_hex = COALESCE(?, rgb_hex),
                  updated_at = ?
              WHERE id = ?;
            `,
            needsName ? payload.name : null,
            needsRgb ? payload.rgb : null,
            now,
            colorId
          );
        } else {
          await txn.runAsync(
            `UPDATE catalog_colors SET updated_at = ? WHERE id = ?;`,
            now,
            colorId
          );
        }
      }
      return;
    }

    const insertRes = await txn.runAsync(
      `
        INSERT INTO catalog_colors (
          generic_name,
          rgb_hex,
          luma,
          created_at,
          updated_at
        )
        VALUES (?, ?, NULL, ?, ?);
      `,
      payload.name,
      payload.rgb ?? null,
      now,
      now
    );
    colorId = Number(insertRes.lastInsertRowId ?? 0);

    await txn.runAsync(
      `
        INSERT INTO catalog_color_labels (color_id, source, source_id, name)
        VALUES (?, 'REBRICKABLE', ?, ?);
      `,
      colorId,
      payload.id,
      payload.name
    );
  });

  return colorId;
}
