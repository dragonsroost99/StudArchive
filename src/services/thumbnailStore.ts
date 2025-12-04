import { getDb } from '../db/database';
import { fetchComponentImage } from './inventoryImport/rebrickable';

const ensurePromise: { current: Promise<void> | null } = { current: null };
const inFlight = new Map<string, Promise<string>>();
let fetchChain: Promise<void> = Promise.resolve();
let cooldownUntil = 0;

function buildKey(designID: string, colorID: number): string {
  return `${designID.trim()}|${colorID}`;
}

function enqueueFetch<T>(task: () => Promise<T>): Promise<T> {
  const run = fetchChain.then(task, task);
  fetchChain = run.then(
    () => undefined,
    () => undefined
  );
  return run;
}

export function normalizeColorId(colorID?: number | string | null): number {
  if (typeof colorID === 'number' && Number.isFinite(colorID)) {
    return Math.round(colorID);
  }
  const asString = (colorID ?? '').toString().trim();
  if (!asString) return -1;
  const parsed = Number(asString);
  if (Number.isFinite(parsed)) {
    return Math.round(parsed);
  }
  let hash = 0;
  for (let i = 0; i < asString.length; i += 1) {
    hash = (hash * 31 + asString.charCodeAt(i)) | 0;
  }
  return Math.abs(hash) || -1;
}

async function ensureTable(): Promise<void> {
  if (ensurePromise.current) {
    return ensurePromise.current;
  }
  ensurePromise.current = (async () => {
    const db = await getDb();
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS part_thumbnails (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        designID TEXT NOT NULL,
        colorID INTEGER NOT NULL,
        imageUrl TEXT,
        fetchedAt INTEGER NOT NULL,
        UNIQUE (designID, colorID)
      );
    `);
    await db.execAsync(`
      CREATE INDEX IF NOT EXISTS idx_part_thumbnails_lookup
      ON part_thumbnails (designID, colorID);
    `);
  })();
  return ensurePromise.current;
}

export async function getThumbnail(
  designID: string,
  colorID?: number | string | null
): Promise<string | null> {
  const trimmedId = designID?.trim();
  if (!trimmedId) return null;
  await ensureTable();
  const db = await getDb();
  const normalizedColorId = normalizeColorId(colorID);
  const rows = await db.getAllAsync<{ imageUrl: string | null }>(
    `
      SELECT imageUrl
      FROM part_thumbnails
      WHERE designID = ? AND colorID = ?
      LIMIT 1;
    `,
    [trimmedId, normalizedColorId]
  );
  const record = rows[0];
  if (record === undefined) return null;
  return record.imageUrl ?? '';
}

export async function fetchAndCacheThumbnail(
  designID: string,
  colorID?: number | string | null
): Promise<string> {
  const trimmedId = designID?.trim();
  if (!trimmedId) return '';
  const normalizedColorId = normalizeColorId(colorID);
  const key = buildKey(trimmedId, normalizedColorId);

  const existing = await getThumbnail(trimmedId, normalizedColorId);
  if (existing !== null) {
    return existing;
  }

  if (inFlight.has(key)) {
    return inFlight.get(key)!;
  }

  const promise = enqueueFetch(async () => {
    try {
      await ensureTable();
      if (Date.now() < cooldownUntil) {
        return '';
      }
      const subtype = trimmedId.toLowerCase().startsWith('fig') ? 'minifig' : 'part';
      const fetched = await fetchComponentImage(trimmedId, subtype);
      const imageUrl = fetched ?? '';
      if (fetched === null) {
        cooldownUntil = Date.now() + 60_000; // back off after a blocked/forbidden response
      }
      const db = await getDb();
      await db.runAsync(
        `
          INSERT INTO part_thumbnails (designID, colorID, imageUrl, fetchedAt)
          VALUES (?, ?, ?, ?)
          ON CONFLICT(designID, colorID) DO UPDATE SET
            imageUrl = excluded.imageUrl,
            fetchedAt = excluded.fetchedAt;
        `,
        [trimmedId, normalizedColorId, imageUrl, Date.now()]
      );
      return imageUrl;
    } catch (error) {
      console.warn('[thumbnailStore] Failed to fetch thumbnail', trimmedId, error);
      try {
        const db = await getDb();
        await db.runAsync(
          `
            INSERT INTO part_thumbnails (designID, colorID, imageUrl, fetchedAt)
            VALUES (?, ?, ?, ?)
            ON CONFLICT(designID, colorID) DO UPDATE SET
              imageUrl = excluded.imageUrl,
              fetchedAt = excluded.fetchedAt;
          `,
          [trimmedId, normalizedColorId, '', Date.now()]
        );
      } catch (insertError) {
        console.warn('[thumbnailStore] Failed to cache empty thumbnail', insertError);
      }
      return '';
    } finally {
      inFlight.delete(key);
    }
  })();

  inFlight.set(key, promise);
  return promise;
}
