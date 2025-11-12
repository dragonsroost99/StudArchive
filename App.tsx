import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { openDatabaseAsync } from 'expo-sqlite'; // ← SDK 54 async API

export default function App() {
  const [status, setStatus] = useState<'checking' | 'ok' | 'error'>('checking');
  const [message, setMessage] = useState('Initializing database…');

  useEffect(() => {
    (async () => {
      try {
        const db = await openDatabaseAsync('legoCollection.db');

        // create table
        await db.execAsync(`
          CREATE TABLE IF NOT EXISTS migrations (
            id INTEGER PRIMARY KEY NOT NULL,
            name TEXT NOT NULL,
            run_at TEXT NOT NULL
          );
        `);

        // verify table exists
        const row = await db.getFirstAsync<{ name: string }>(
          "SELECT name FROM sqlite_master WHERE type='table' AND name='migrations';"
        );

        if (row) {
          setStatus('ok');
          setMessage('Database initialized ✓ (migrations table found)');
        } else {
          setStatus('error');
          setMessage('Database not initialized (migrations table missing)');
        }
      } catch (e: any) {
        setStatus('error');
        setMessage(`Init error: ${e?.message ?? 'unknown'}`);
      }
    })();
  }, []);

  return (
    <View style={styles.container}>
      <Text style={styles.title}>LEGO Collection Tracker</Text>
      <Text
        style={[
          styles.status,
          status === 'ok' ? styles.ok : status === 'error' ? styles.error : null,
        ]}
      >
        {message}
      </Text>
      <Text style={styles.helper}>
        If you don’t see “initialized ✓”, try closing and reopening Expo Go to reload.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#fff' },
  title: { fontSize: 22, fontWeight: 'bold', marginBottom: 12 },
  status: { fontSize: 16, textAlign: 'center', marginBottom: 8 },
  ok: { color: 'green' },
  error: { color: 'red' },
  helper: { fontSize: 14, color: '#555', textAlign: 'center', paddingHorizontal: 20 },
});
