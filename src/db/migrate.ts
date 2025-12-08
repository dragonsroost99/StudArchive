// src/db/migrate.ts
import { getDb } from './database';
import { migration as m0001 } from './migrations/0001_locations';
import { migration as m001 } from './migrations/001_catalog_meta';
import { migration as m002 } from './migrations/002_catalog_parts';
import { migration as m003 } from './migrations/003_catalog_part_ids';
import { migration as m004 } from './migrations/004_catalog_colors';
import { migration as m005 } from './migrations/005_catalog_color_labels';
import { migration as m006 } from './migrations/006_catalog_sets';
import { migration as m007 } from './migrations/007_catalog_set_parts';
import { migration as m008 } from './migrations/008_catalog_minifigs';
import { migration as m009 } from './migrations/009_catalog_minifig_parts';
import { migration as m010 } from './migrations/010_catalog_foreign_keys';
import { migration as m011 } from './migrations/011_catalog_meta_seed';
import { migration as m012 } from './migrations/012_inventory_add_catalog_color_id';

type Migration = { name: string; up: (tx: any) => void };
const migrations: Migration[] = [
  m0001,
  m001,
  m002,
  m003,
  m004,
  m005,
  m006,
  m007,
  m008,
  m009,
  m010,
  m011,
  m012,
];

export function runMigrations(): Promise<void> {
  return new Promise((resolve, reject) => {
    const runSequentially = async () => {
      const db = await getDb();
      // Ensure migrations table exists before processing.
      await db.execAsync(`
        CREATE TABLE IF NOT EXISTS migrations (
          id      INTEGER PRIMARY KEY NOT NULL,
          name    TEXT NOT NULL,
          run_at  TEXT NOT NULL
        );
      `);
      for (const m of migrations) {
        const existing = await db.getAllAsync<{ id: number }>(
          'SELECT id FROM migrations WHERE name = ? LIMIT 1;',
          [m.name]
        );
        if (existing.length > 0) {
          continue;
        }

        await db.withExclusiveTransactionAsync(async txn => {
          const pending: Promise<unknown>[] = [];
          const tx = {
            executeSql(
              sql: string,
              params: any[] = [],
              success?: (_tx: any, res: any) => void,
              error?: (_tx: any, err: any) => boolean | void
            ) {
              const promise = txn
                .runAsync(sql, params)
                .then(res => {
                  success?.(tx, res);
                  return res;
                })
                .catch(err => {
                  const shouldThrow = error?.(tx, err);
                  if (shouldThrow) {
                    throw err;
                  }
                  return undefined;
                });
              pending.push(promise);
            },
          };

          m.up(tx);
          await Promise.all(pending);
          await txn.runAsync('INSERT INTO migrations (name, run_at) VALUES (?, ?);', [
            m.name,
            new Date().toISOString(),
          ]);
        });
      }
    };

    runSequentially().then(() => resolve()).catch(reject);
  });
}
