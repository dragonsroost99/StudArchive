import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { XMLParser } from 'fast-xml-parser';
import type { SQLiteDatabase } from 'expo-sqlite';
import { ensureInventoryImportSchema } from '../../db/inventoryLots';

export interface BsxItem {
  itemType: string;
  itemId: string;      // BrickLink ID
  colorId: string;     // BrickLink Color ID
  quantity: number;
  condition?: 'N' | 'U';
  comments?: string;
  remarks?: string;
}

export interface ImportSummary {
  batchId: number;
  fileName: string | null;
  totalLots: number;
  totalPieces: number;
  mappedLots: number;
  unmappedLots: number;
  unmappedItems: BsxItem[];
}

type MappedItem = {
  bsx: BsxItem;
  canonicalPartId?: string;
  canonicalColorId?: number;
};

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '',
  allowBooleanAttributes: true,
});

function normalizeCondition(raw: any): 'N' | 'U' | undefined {
  const value = (raw ?? '').toString().trim().toUpperCase();
  if (value === 'N') return 'N';
  if (value === 'U') return 'U';
  return undefined;
}

function valueToString(raw: any): string {
  if (raw == null) return '';
  if (typeof raw === 'object' && '#text' in raw) {
    return String((raw as any)['#text'] ?? '').trim();
  }
  return String(raw ?? '').trim();
}

function normalizeString(raw: any): string {
  return valueToString(raw);
}

function parseQuantity(raw: any): number {
  const parsed = Number.parseInt((raw ?? '').toString(), 10);
  if (Number.isFinite(parsed) && parsed > 0) return parsed;
  return 0;
}

function extractItemsFromParsedXml(parsed: any): any[] {
  const candidates = [
    parsed?.Inventory?.Item,
    parsed?.Inventory?.Items?.Item,
    parsed?.Items?.Item,
    parsed?.BrickStore?.Inventory?.Item,
    parsed?.BrickStore?.Items?.Item,
    parsed?.BrickStoreXML?.Inventory?.Item,
    parsed?.BrickStoreXML?.Items?.Item,
  ];
  for (const candidate of candidates) {
    if (Array.isArray(candidate)) return candidate;
    if (candidate) return [candidate];
  }
  return [];
}

function parseBsxItems(xml: string): BsxItem[] {
  const parsed = parser.parse(xml);
  const rawItems = extractItemsFromParsedXml(parsed);
  return rawItems
    .map((item: any) => {
      const lower = Object.entries(item ?? {}).reduce<Record<string, any>>((acc, [key, value]) => {
        acc[key.toLowerCase()] = valueToString(value);
        return acc;
      }, {});

      const itemType = normalizeString(lower.itemtypeid ?? lower.itemtype ?? lower.type ?? '');
      const itemId = normalizeString(lower.itemid ?? lower.item ?? '');
      const colorId = normalizeString(lower.colorid ?? lower.color ?? '');
      const quantity = parseQuantity(lower.qty ?? lower.quantity ?? lower.qt ?? lower.q ?? lower.qtty);
      if (!itemId || !colorId || quantity <= 0) return null;
      return {
        itemType,
        itemId,
        colorId,
        quantity,
        condition: normalizeCondition(lower.condition ?? lower.cond),
        comments: normalizeString(lower.comments ?? ''),
        remarks: normalizeString(lower.remarks ?? ''),
      } as BsxItem;
    })
    .filter(Boolean) as BsxItem[];
}

function deriveFileName(uri: string): string | null {
  const withoutQuery = uri.split(/[?#]/)[0];
  const parts = withoutQuery.split(/[\\/]/);
  const last = parts[parts.length - 1];
  return last || null;
}

async function loadCrossrefMaps(db: SQLiteDatabase): Promise<{
  partMap: Map<string, string>;
  colorMap: Map<string, number>;
}> {
  const partRows = await db.getAllAsync<{
    canonical_part_id: string;
    bricklink_part_id: string | null;
  }>(`
    SELECT canonical_part_id, bricklink_part_id
    FROM part_crossref
    WHERE bricklink_part_id IS NOT NULL;
  `);
  const colorRows = await db.getAllAsync<{
    canonical_color_id: number;
    bricklink_color_id: number | null;
  }>(`
    SELECT canonical_color_id, bricklink_color_id
    FROM color_crossref
    WHERE bricklink_color_id IS NOT NULL;
  `);

  const partMap = new Map<string, string>();
  for (const row of partRows) {
    const bl = normalizeString(row.bricklink_part_id);
    if (bl) partMap.set(bl, row.canonical_part_id);
  }
  const colorMap = new Map<string, number>();
  for (const row of colorRows) {
    const bl = row.bricklink_color_id;
    if (bl !== null && bl !== undefined) {
      colorMap.set(String(bl), row.canonical_color_id);
    }
  }
  return { partMap, colorMap };
}

function mapItemsToCanonical(
  items: BsxItem[],
  partMap: Map<string, string>,
  colorMap: Map<string, number>
): { mapped: MappedItem[]; unmapped: BsxItem[] } {
  const mapped: MappedItem[] = [];
  const unmapped: BsxItem[] = [];

  for (const bsx of items) {
    const rawPartId = normalizeString(bsx.itemId);
    const rawColorId = normalizeString(bsx.colorId);
    const canonicalPartId = (partMap.get(rawPartId) ?? rawPartId) || undefined;
    const mappedColor = colorMap.get(rawColorId);
    const fallbackColor = Number.parseInt(rawColorId, 10);
    const canonicalColorId =
      mappedColor !== undefined
        ? mappedColor
        : Number.isFinite(fallbackColor)
          ? fallbackColor
          : undefined;

    if (canonicalPartId && canonicalColorId !== undefined) {
      mapped.push({ bsx, canonicalPartId, canonicalColorId });
    } else {
      unmapped.push(bsx);
    }
  }
  return { mapped, unmapped };
}

function combineNotes(comments?: string, remarks?: string): string {
  const parts = [comments, remarks].map(part => normalizeString(part ?? '')).filter(Boolean);
  return parts.join('\n');
}

async function ensureImportSchema(): Promise<void> {
  await ensureInventoryImportSchema();
}

export async function pickBsxFile(): Promise<{ uri: string; name: string | null } | null> {
  const result = await DocumentPicker.getDocumentAsync({
    type: ['application/xml', 'text/xml', '*/*'],
    copyToCacheDirectory: true,
  });
  if (result.canceled) return null;
  const asset = result.assets?.[0];
  if (!asset) return null;
  return { uri: asset.uri, name: asset.name ?? deriveFileName(asset.uri) };
}

export async function importBsxFile(
  db: SQLiteDatabase,
  fileUri: string,
  mode: 'add' | 'merge'
): Promise<ImportSummary> {
  await ensureImportSchema();

  const xml = await FileSystem.readAsStringAsync(fileUri);
  const fileName = deriveFileName(fileUri);
  const bsxItems = parseBsxItems(xml);
  if (bsxItems.length === 0) {
    throw new Error('No items found in the BSX file. Please verify the file contents.');
  }

  const totalLots = bsxItems.length;
  const totalPieces = bsxItems.reduce((acc, item) => acc + item.quantity, 0);

  const { partMap, colorMap } = await loadCrossrefMaps(db);
  const { mapped, unmapped } = mapItemsToCanonical(bsxItems, partMap, colorMap);

  let batchId = 0;
  let mappedPieces = 0;

  // Combine duplicate lots within the same import batch to avoid UNIQUE conflicts.
  const aggregated = new Map<
    string,
    {
      canonicalPartId: string;
      canonicalColorId: number;
      condition: 'N' | 'U';
      quantity: number;
      notes: string | null;
    }
  >();
  for (const entry of mapped) {
    const condition = entry.bsx.condition ?? 'U';
    const key = `${entry.canonicalPartId}|${entry.canonicalColorId}|${condition}`;
    const existing = aggregated.get(key);
    const notes = combineNotes(entry.bsx.comments, entry.bsx.remarks);
    if (existing) {
      aggregated.set(key, {
        ...existing,
        quantity: existing.quantity + entry.bsx.quantity,
        notes: existing.notes
          ? notes
            ? `${existing.notes}\n${notes}`
            : existing.notes
          : notes ?? null,
      });
    } else {
      aggregated.set(key, {
        canonicalPartId: entry.canonicalPartId!,
        canonicalColorId: entry.canonicalColorId!,
        condition,
        quantity: entry.bsx.quantity,
        notes: notes || null,
      });
    }
  }
  for (const value of aggregated.values()) {
    mappedPieces += value.quantity;
  }

  await db.withExclusiveTransactionAsync(async tx => {
    const batchResult = await tx.runAsync(
      `
        INSERT INTO import_batch (source, file_name, lot_count, piece_count)
        VALUES (?, ?, 0, 0);
      `,
      'brickstore',
      fileName ?? null
    );
    batchId = Number(batchResult.lastInsertRowId ?? 0);

    const now = new Date().toISOString();
    const existingMap: Map<string, { id: number; quantity: number; notes: string | null }> =
      new Map();

    if (mode === 'merge' && aggregated.size > 0) {
      const existingRows = await tx.getAllAsync<{
        id: number;
        canonical_part_id: string;
        canonical_color_id: number;
        condition: string | null;
        quantity: number;
        notes: string | null;
      }>(`
        SELECT id, canonical_part_id, canonical_color_id, condition, quantity, notes
        FROM inventory_lot;
      `);
      for (const row of existingRows) {
        const condition = normalizeString(row.condition ?? '') || 'U';
        const key = `${row.canonical_part_id}|${row.canonical_color_id}|${condition}`;
        existingMap.set(key, { id: row.id, quantity: row.quantity ?? 0, notes: row.notes ?? null });
      }
    }

    for (const entry of aggregated.values()) {
      const { canonicalPartId, canonicalColorId, condition, quantity, notes } = entry;
      const key = `${canonicalPartId}|${canonicalColorId}|${condition}`;
      if (mode === 'merge') {
        const existing = existingMap.get(key);
        if (existing) {
          const newQty = (existing.quantity ?? 0) + quantity;
          const combinedNotes = notes
            ? (existing.notes ? `${existing.notes}\n${notes}` : notes)
            : existing.notes ?? null;
          await tx.runAsync(
            `
              UPDATE inventory_lot
              SET quantity = ?, notes = ?, updated_at = ?
              WHERE id = ?;
            `,
            newQty,
            combinedNotes,
            now,
            existing.id
          );
          continue;
        }
      }

      await tx.runAsync(
        `
          INSERT INTO inventory_lot
            (canonical_part_id, canonical_color_id, quantity, condition, source, external_item_id, external_color_id, import_batch_id, notes, created_at, updated_at)
          VALUES
            (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(canonical_part_id, canonical_color_id, condition) DO UPDATE SET
            quantity = inventory_lot.quantity + excluded.quantity,
            notes = CASE
              WHEN (excluded.notes IS NULL OR excluded.notes = '') THEN inventory_lot.notes
              WHEN (inventory_lot.notes IS NULL OR inventory_lot.notes = '') THEN excluded.notes
              ELSE inventory_lot.notes || char(10) || excluded.notes
            END,
            updated_at = excluded.updated_at,
            import_batch_id = excluded.import_batch_id;
        `,
        canonicalPartId,
        canonicalColorId,
        quantity,
        condition,
        'brickstore',
        null,
        null,
        batchId || null,
        notes || null,
        now,
        now
      );
    }

    await tx.runAsync(
      `
        UPDATE import_batch
        SET lot_count = ?, piece_count = ?
        WHERE id = ?;
      `,
      mapped.length,
      mappedPieces,
      batchId
    );
  });

  return {
    batchId,
    fileName,
    totalLots,
    totalPieces,
    mappedLots: mapped.length,
    unmappedLots: unmapped.length,
    unmappedItems: unmapped,
  };
}
