// src/db/migrate.ts
import { db } from './database';
import { migration as m0001 } from './migrations/0001_locations';

type Migration = { name: string; up: (tx: any) => void };
const migrations: Migration[] = [m0001];

export function runMigrations(): Promise<void> {
  return new Promise((resolve, reject) => {
    // Run each migration if not already recorded
    const runNext = (index: number) => {
      if (index >= migrations.length) return resolve();

      const m = migrations[index];

      db.transaction(tx => {
        tx.executeSql(
          'SELECT id FROM migrations WHERE name = ? LIMIT 1;',
          [m.name],
          (_t, res) => {
            if (res.rows.length > 0) {
              // already applied
              runNext(index + 1);
              return;
            }

            // apply migration
            m.up(tx);
            tx.executeSql(
              'INSERT INTO migrations (name, run_at) VALUES (?, ?);',
              [m.name, new Date().toISOString()],
              () => runNext(index + 1)
            );
          }
        );
      }, reject);
    };

    runNext(0);
  });
}
