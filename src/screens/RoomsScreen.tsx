// src/screens/RoomsScreen.tsx
import React, { useEffect, useState } from 'react';
import { StyleSheet, View, Text, TextInput, Button, FlatList, TouchableOpacity, StyleSheet } from 'react-native';
import { createRoom, listRooms, deleteRoom, type Room } from '../features/rooms';

export default function RoomsScreen() {
  const [rooms, setRooms] = useState<Room[]>([]);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function refresh() {
    const data = await listRooms();
    setRooms(data);
  }

  useEffect(() => {
    refresh();
  }, []);

  async function handleAdd() {
    if (!name.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await createRoom(name);
      setName('');
      await refresh();
    } catch (e: any) {
      setError(e?.message ?? 'Failed to add room');
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete(id: number) {
    setBusy(true);
    setError(null);
    try {
      await deleteRoom(id);
      await refresh();
    } catch (e: any) {
      setError(e?.message ?? 'Failed to delete room');
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={styles.wrap}>
      <Text style={styles.h2}>Rooms</Text>

      <View style={styles.row}>
        <TextInput
          style={styles.input}
          placeholder="e.g., Office, Garage"
          value={name}
          onChangeText={setName}
        />
        <Button title={busy ? 'Adding…' : 'Add'} onPress={handleAdd} disabled={busy} />
      </View>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <FlatList
        data={rooms}
        keyExtractor={(item) => String(item.id)}
        ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
        renderItem={({ item }) => (
          <View style={styles.card}>
            <Text style={styles.roomName}>{item.name}</Text>
            <TouchableOpacity onPress={() => handleDelete(item.id)} style={styles.deleteBtn}>
              <Text style={{ color: 'white', fontWeight: '700' }}>Delete</Text>
            </TouchableOpacity>
          </View>
        )}
        ListEmptyComponent={<Text style={{ opacity: 0.6 }}>No rooms yet — add one above.</Text>}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { width: '100%', gap: 12, marginTop: 24 },
  h2: { fontSize: 18, fontWeight: '700' },
  row: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  input: { flex: 1, borderWidth: 1, borderColor: '#ccc', borderRadius: 6, padding: 10 },
  error: { color: '#b00020' },
  card: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 12, borderWidth: 1, borderColor: '#e0e0e0', borderRadius: 8 },
  roomName: { fontSize: 16 },
  deleteBtn: { backgroundColor: '#c62828', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 6 },
  

});
