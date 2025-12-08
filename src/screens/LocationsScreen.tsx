import React, { useEffect, useMemo, useState } from 'react';
import { Modal, ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';
import { ThemedText as Text } from '../components/ThemedText';
import { Button } from '../components/Button';
import { Input } from '../components/Input';
import { layout } from '../theme/layout';
import { typography } from '../theme/typography';
import { useTheme, type Theme } from '../theme/ThemeProvider';
import { getDb } from '../db/database';
import { type Room, listRooms, createRoom, deleteRoom } from '../db/rooms';
import {
  listContainersForRoom,
  createContainer,
  deleteContainer,
  type Container,
} from '../db/containers';

type LocationsScreenProps = {
  onClose?: () => void;
  onNavigateToContainer?: (containerId: number, containerName?: string) => void;
  initialRoomId?: number | null;
  onSelectRoom?: (roomId: number | null) => void;
};

type ContainerWithRoom = Container & { roomName?: string | null };

let lastSelectedRoomId: number | null = null;

export default function LocationsScreen({
  onClose,
  onNavigateToContainer,
  initialRoomId,
  onSelectRoom,
  clearStoredSelection = false,
}: LocationsScreenProps) {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);

  if (clearStoredSelection) {
    lastSelectedRoomId = null;
  }

  const [rooms, setRooms] = useState<Room[]>([]);
  const [containers, setContainers] = useState<ContainerWithRoom[]>([]);
  const [selectedRoomId, setSelectedRoomId] = useState<number | null>(
    initialRoomId ?? (clearStoredSelection ? null : lastSelectedRoomId)
  );
  const [roomsLoading, setRoomsLoading] = useState(false);
  const [containersLoading, setContainersLoading] = useState(false);
  const [roomModalVisible, setRoomModalVisible] = useState(false);
  const [containerModalVisible, setContainerModalVisible] = useState(false);
  const [newRoomName, setNewRoomName] = useState('');
  const [newRoomDescription, setNewRoomDescription] = useState('');
  const [newContainerName, setNewContainerName] = useState('');
  const [newContainerRoomId, setNewContainerRoomId] = useState<number | null>(null);

  useEffect(() => {
    void refreshRooms();
  }, []);

  useEffect(() => {
    void refreshContainers(selectedRoomId);
  }, [selectedRoomId]);

  async function refreshRooms() {
    try {
      setRoomsLoading(true);
      const data = await listRooms();
      setRooms(data);
      if (data.length > 0 && !selectedRoomId) {
        const nextId = initialRoomId ?? (clearStoredSelection ? null : lastSelectedRoomId) ?? data[0].id;
        setSelectedRoomId(nextId);
        lastSelectedRoomId = nextId;
        onSelectRoom?.(nextId);
      }
    } catch (error) {
      console.error('Failed to load rooms', error);
    } finally {
      setRoomsLoading(false);
    }
  }

  async function refreshContainers(roomId: number | null) {
    try {
      setContainersLoading(true);
      const db = await getDb();
      if (roomId == null) {
        const rows = await db.getAllAsync<ContainerWithRoom>(`
          SELECT c.id, c.name, c.room_id as room_id, r.name as roomName
          FROM containers c
          LEFT JOIN rooms r ON r.id = c.room_id
          ORDER BY r.name ASC, c.name ASC;
        `);
        setContainers(rows);
      } else {
        const rows = await listContainersForRoom(roomId);
        setContainers(rows as ContainerWithRoom[]);
      }
    } catch (error) {
      console.error('Failed to load containers', error);
    } finally {
      setContainersLoading(false);
    }
  }

  async function handleCreateRoom() {
    const name = newRoomName.trim();
    if (!name) return;
    try {
      await createRoom(name);
      setNewRoomName('');
      setNewRoomDescription('');
      setRoomModalVisible(false);
      await refreshRooms();
    } catch (error) {
      console.error('Create room failed', error);
    }
  }

  async function handleDeleteRoom(roomId: number) {
    try {
      await deleteRoom(roomId);
      if (selectedRoomId === roomId) {
        setSelectedRoomId(null);
        lastSelectedRoomId = null;
        onSelectRoom?.(null);
      }
      await refreshRooms();
      await refreshContainers(selectedRoomId);
    } catch (error) {
      console.error('Delete room failed', error);
    }
  }

  async function handleCreateContainer() {
    const name = newContainerName.trim();
    if (!name) return;
    const roomId = newContainerRoomId ?? selectedRoomId;
    if (roomId == null) return;
    try {
      await createContainer(roomId, name);
      setNewContainerName('');
      setNewContainerRoomId(roomId);
      setContainerModalVisible(false);
      await refreshContainers(selectedRoomId);
    } catch (error) {
      console.error('Create container failed', error);
    }
  }

  async function handleDeleteContainer(containerId: number) {
    try {
      await deleteContainer(containerId);
      await refreshContainers(selectedRoomId);
    } catch (error) {
      console.error('Delete container failed', error);
    }
  }

  function renderRooms() {
    if (roomsLoading) {
      return <Text style={styles.meta}>Loading locations…</Text>;
    }
    if (rooms.length === 0) {
      return <Text style={styles.meta}>No locations yet.</Text>;
    }
    return rooms.map(room => {
      const isActive = room.id === selectedRoomId;
      return (
        <TouchableOpacity
          key={room.id}
          style={[styles.roomRow, isActive && styles.roomRowActive]}
          onPress={() => {
            setSelectedRoomId(room.id);
            lastSelectedRoomId = room.id;
            onSelectRoom?.(room.id);
          }}
          onLongPress={() => handleDeleteRoom(room.id)}
        >
          <Text style={[styles.roomName, isActive && styles.roomNameActive]}>{room.name}</Text>
        </TouchableOpacity>
      );
    });
  }

  function renderContainers() {
    if (containersLoading) {
      return <Text style={styles.meta}>Loading containers…</Text>;
    }
    if (containers.length === 0) {
      return <Text style={styles.meta}>No containers yet.</Text>;
    }
    return containers.map(container => {
      const roomLabel = container.roomName ? `${container.roomName} · ${container.name}` : container.name;
      return (
        <TouchableOpacity
          key={container.id}
          style={styles.containerRow}
          onPress={() => onNavigateToContainer?.(container.id, container.name)}
          onLongPress={() => handleDeleteContainer(container.id)}
        >
          <Text style={styles.containerName}>{roomLabel}</Text>
        </TouchableOpacity>
      );
    });
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.headerRow}>
        <Text style={styles.title}>Storage & Locations</Text>
        {onClose ? (
          <Button label="Back" variant="outline" onPress={onClose} />
        ) : null}
      </View>

      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Locations</Text>
          <Button label="Add Location" onPress={() => setRoomModalVisible(true)} />
        </View>
        <View style={styles.list}>{renderRooms()}</View>
      </View>

      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Containers</Text>
          <Button
            label="Add Container"
            onPress={() => {
              setNewContainerRoomId(selectedRoomId);
              setContainerModalVisible(true);
            }}
            disabled={rooms.length === 0}
          />
        </View>
        <View style={styles.list}>{renderContainers()}</View>
      </View>

      <Modal
        visible={roomModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setRoomModalVisible(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Add Location</Text>
            <Input
              label="Location name"
              value={newRoomName}
              onChangeText={setNewRoomName}
              placeholder="e.g. Basement"
            />
            <Button label="Save" onPress={handleCreateRoom} />
            <Button label="Cancel" variant="outline" onPress={() => setRoomModalVisible(false)} />
          </View>
        </View>
      </Modal>

      <Modal
        visible={containerModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setContainerModalVisible(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Add Container</Text>
            <Input
              label="Container name"
              value={newContainerName}
              onChangeText={setNewContainerName}
              placeholder="e.g. Bin 1"
            />
            <Text style={styles.selectorLabel}>Location</Text>
            <View style={styles.optionList}>
              {rooms.map(room => {
                const isActive = room.id === (newContainerRoomId ?? selectedRoomId);
                return (
                  <TouchableOpacity
                    key={room.id}
                    style={[styles.optionRow, isActive && styles.optionRowActive]}
                    onPress={() => setNewContainerRoomId(room.id)}
                  >
                    <Text style={[styles.optionText, isActive && styles.optionTextActive]}>{room.name}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            <Button label="Save" onPress={handleCreateContainer} disabled={rooms.length === 0} />
            <Button label="Cancel" variant="outline" onPress={() => setContainerModalVisible(false)} />
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

function createStyles(theme: Theme) {
  const { colors } = theme;
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    content: {
      padding: layout.spacingLg,
      paddingBottom: layout.spacingXl * 2,
      gap: layout.spacingLg,
    },
    headerRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
    },
    title: {
      fontSize: typography.sectionTitle,
      fontWeight: '700',
      color: colors.heading,
    },
    section: {
      backgroundColor: colors.surface,
      borderRadius: layout.radiusLg,
      padding: layout.spacingMd,
      borderWidth: 1,
      borderColor: colors.border,
      gap: layout.spacingSm,
    },
    sectionHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
    },
    sectionTitle: {
      fontSize: typography.title,
      fontWeight: '600',
      color: colors.heading,
    },
    list: {
      gap: layout.spacingXs,
    },
    roomRow: {
      padding: layout.spacingSm,
      borderRadius: layout.radiusMd,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.background,
    },
    roomRowActive: {
      borderColor: colors.accent,
      backgroundColor: colors.surfaceAlt ?? colors.surface,
    },
    roomName: {
      fontSize: typography.body,
      color: colors.text,
    },
    roomNameActive: {
      color: colors.heading,
      fontWeight: '700',
    },
    containerRow: {
      padding: layout.spacingSm,
      borderRadius: layout.radiusMd,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.background,
    },
    containerName: {
      fontSize: typography.body,
      color: colors.text,
    },
    modalBackdrop: {
      flex: 1,
      backgroundColor: colors.modalBackdrop,
      justifyContent: 'center',
      alignItems: 'center',
      padding: layout.spacingLg,
    },
    modalCard: {
      width: '100%',
      maxWidth: 420,
      backgroundColor: colors.surface,
      borderRadius: layout.radiusLg,
      padding: layout.spacingLg,
      borderWidth: 1,
      borderColor: colors.border,
      gap: layout.spacingSm,
    },
    modalTitle: {
      fontSize: typography.sectionTitle,
      fontWeight: '700',
      color: colors.heading,
      textAlign: 'center',
    },
    selectorLabel: {
      fontSize: typography.caption,
      color: colors.textMuted,
      marginTop: layout.spacingXs,
      marginBottom: layout.spacingXs / 2,
    },
    optionList: {
      gap: layout.spacingXs,
    },
    optionRow: {
      padding: layout.spacingSm,
      borderRadius: layout.radiusMd,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.background,
    },
    optionRowActive: {
      borderColor: colors.accent,
      backgroundColor: colors.surfaceAlt ?? colors.surface,
    },
    optionText: {
      fontSize: typography.body,
      color: colors.text,
    },
    optionTextActive: {
      color: colors.heading,
      fontWeight: '700',
    },
    meta: {
      fontSize: typography.caption,
      color: colors.textMuted,
    },
  });
}


