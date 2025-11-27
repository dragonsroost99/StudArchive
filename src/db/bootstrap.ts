// src/db/bootstrap.ts
import { db } from './database';
import { runMigrations } from './migrate';


export function initDb() {
  // Ensure the migrations meta table exists
 db.transaction(tx => {
  tx.executeSql(
    "SELECT name FROM sqlite_master WHERE type='table' AND name IN ('migrations','rooms','areas','containers');",
    [],
    (_tx, result) => {
      if (result.rows.length >= 4) {
        setStatus('ok');
        setMessage('Database initialized ✓ (locations tables ready)');
      } else {
        setStatus('error');
        setMessage('Database init incomplete (locations tables missing)');
      }
    },
    (_tx, err) => {
      setStatus('error');
      setMessage('SQLite error: ' + (err?.message ?? 'unknown'));
      return true;
    }
  );
});
