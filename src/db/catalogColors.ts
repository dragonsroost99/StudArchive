import { getDb } from './database';

export async function resolveCatalogColorByRebrickableId(
  rebrickableColorId: number
): Promise<{
  colorId: number;
  name: string;
  rgbHex?: string | null;
} | null> {
  const db = await getDb();
  const row = await db.getFirstAsync<{
    id: number;
    generic_name: string;
    rgb_hex: string | null;
  }>(
    `
      SELECT c.id, c.generic_name, c.rgb_hex
      FROM catalog_color_labels l
      INNER JOIN catalog_colors c ON c.id = l.color_id
      WHERE l.source = 'REBRICKABLE' AND l.source_id = ?
      LIMIT 1;
    `,
    rebrickableColorId
  );

  if (!row) return null;
  return {
    colorId: row.id,
    name: row.generic_name,
    rgbHex: row.rgb_hex,
  };
}

export async function resolveCatalogColorById(
  catalogColorId: number
): Promise<{
  colorId: number;
  name: string;
  rgbHex?: string | null;
} | null> {
  const db = await getDb();
  const row = await db.getFirstAsync<{
    id: number;
    generic_name: string;
    rgb_hex: string | null;
  }>(
    `
      SELECT id, generic_name, rgb_hex
      FROM catalog_colors
      WHERE id = ?
      LIMIT 1;
    `,
    catalogColorId
  );
  if (!row) return null;
  return {
    colorId: row.id,
    name: row.generic_name,
    rgbHex: row.rgb_hex,
  };
}
