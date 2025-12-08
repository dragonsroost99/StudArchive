import React, { useEffect, useMemo, useState } from 'react';
import { Modal, ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';
import { ThemedText as Text } from './ThemedText';
import { Button } from './Button';
import { Input } from './Input';
import { layout } from '../theme/layout';
import { typography } from '../theme/typography';
import { useTheme, type Theme } from '../theme/ThemeProvider';
import { getDb } from '../db/database';
import { listRooms, type Room } from '../db/rooms';
import { createContainer, type Container } from '../db/containers';

type ContainerPickerProps = {
  selectedContainerId: number | null;
  onChange: (id: number | null) => void;
  allowCreateNew?: boolean;
  locationFilterId?: number | null;
  label?: string;
};

type ContainerRow = Container & { roomName?: string | null };

export function ContainerPicker({
  selectedContainerId,
  onChange,
  allowCreateNew = false,
  locationFilterId = null,
  label = 'Container',
}: ContainerPickerProps) {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);

  const [containers, setContainers] = useState<ContainerRow[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [pickerVisible, setPickerVisible] = useState(false);
  const [createVisible, setCreateVisible] = useState(false);
  const [newContainerName, setNewContainerName] = useState('');
  const [newContainerRoomId, setNewContainerRoomId] = useState<number | null>(null);

  useEffect(() => {
    void refreshRooms();
  }, []);

  useEffect(() => {
    void refreshContainers();
  }, [locationFilterId]);

  async function refreshRooms() {
    try {
      const data = await listRooms();
      setRooms(data);
      if (data.length > 0 && newContainerRoomId == null) {
        setNewContainerRoomId(data[0].id);
      }
    } catch (error) {
      console.error('ContainerPicker: failed to load rooms', error);
    }
  }

  async function refreshContainers() {
    try {
      const db = await getDb();
      const rows = await db.getAllAsync<ContainerRow>(
        `
          SELECT c.id, c.name, c.room_id as room_id, r.name as roomName
          FROM containers c
          LEFT JOIN rooms r ON r.id = c.room_id
          WHERE (? IS NULL OR c.room_id = ?)
          ORDER BY r.name ASC, c.name ASC;
        `,
        [locationFilterId, locationFilterId]
      );
      setContainers(rows);
    } catch (error) {
      console.error('ContainerPicker: failed to load containers', error);
    }
  }

  async function handleCreateContainer() {
    const name = newContainerName.trim();
    if (!name) return;
    const roomId = newContainerRoomId ?? rooms[0]?.id ?? null;
    if (roomId == null) return;
    try {
      await createContainer(roomId, name);
      setNewContainerName('');
      setCreateVisible(false);
      await refreshContainers();
      const db = await getDb();
      const rows = await db.getAllAsync<{ id: number }>(
        `SELECT id FROM containers WHERE name = ? AND room_id = ? ORDER BY id DESC LIMIT 1;`,
        [name, roomId]
      );
      const newId = rows[0]?.id ?? null;
      onChange(newId);
      setPickerVisible(false);
    } catch (error) {
      console.error('ContainerPicker: failed to create container', error);
    }
  }

  const selectedLabel = useMemo(() => {
    if (selectedContainerId == null) return 'No container';
    const match = containers.find(c => c.id === selectedContainerId);
    if (!match) return 'No container';
    return match.roomName ? `${match.roomName} · ${match.name}` : match.name;
  }, [containers, selectedContainerId]);

  return (
    <View style={styles.wrapper}>
      <Text style={styles.label}>{label}</Text>
      <TouchableOpacity style={styles.selector} onPress={() => setPickerVisible(true)}>
        <Text style={styles.selectorValue}>{selectedLabel}</Text>
      </TouchableOpacity>

      <Modal
        visible={pickerVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setPickerVisible(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>{label}</Text>
            <ScrollView style={{ maxHeight: 320 }}>
              <TouchableOpacity
                style={styles.optionRow}
                onPress={() => {
                  onChange(null);
                  setPickerVisible(false);
                }}
              >
                <Text style={styles.optionText}>No container</Text>
              </TouchableOpacity>
              {containers.map(option => {
                const isActive = option.id === selectedContainerId;
                const optionLabel = option.roomName
                  ? `${option.roomName} · ${option.name}`
                  : option.name;
                return (
                  <TouchableOpacity
                    key={option.id}
                    style={[styles.optionRow, isActive && styles.optionRowActive]}
                    onPress={() => {
                      onChange(option.id);
                      setPickerVisible(false);
                    }}
                  >
                    <Text style={[styles.optionText, isActive && styles.optionTextActive]}>
                      {optionLabel}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
            {allowCreateNew ? (
              <Button
                label="New container…"
                onPress={() => {
                  setCreateVisible(true);
                }}
                style={{ marginTop: layout.spacingSm }}
              />
            ) : null}
            <Button
              label="Close"
              variant="outline"
              onPress={() => setPickerVisible(false)}
              style={{ marginTop: layout.spacingSm }}
            />
          </View>
        </View>
      </Modal>

      <Modal
        visible={createVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setCreateVisible(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>New Container</Text>
            <Input
              label="Container name"
              value={newContainerName}
              onChangeText={setNewContainerName}
              placeholder="e.g. Bin 1"
            />
            <Text style={styles.selectorLabel}>Location</Text>
            <View style={styles.optionList}>
              {rooms.map(room => {
                const isActive = room.id === (newContainerRoomId ?? rooms[0]?.id ?? null);
                return (
                  <TouchableOpacity
                    key={room.id}
                    style={[styles.optionRow, isActive && styles.optionRowActive]}
                    onPress={() => setNewContainerRoomId(room.id)}
                  >
                    <Text style={[styles.optionText, isActive && styles.optionTextActive]}>
                      {room.name}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            <Button label="Save" onPress={handleCreateContainer} disabled={rooms.length === 0} />
            <Button label="Cancel" variant="outline" onPress={() => setCreateVisible(false)} />
          </View>
        </View>
      </Modal>
    </View>
  );
}

function createStyles(theme: Theme) {
  const { colors } = theme;
  return StyleSheet.create({
    wrapper: {
      marginTop: layout.spacingSm,
      gap: layout.spacingXs / 2,
    },
    label: {
      fontSize: typography.caption,
      color: colors.textMuted,
    },
    selector: {
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: layout.radiusMd,
      paddingHorizontal: layout.spacingMd,
      paddingVertical: layout.spacingSm,
      backgroundColor: colors.surface,
    },
    selectorValue: {
      fontSize: typography.body,
      color: colors.text,
      fontWeight: '600',
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
    optionRow: {
      padding: layout.spacingSm,
      borderRadius: layout.radiusMd,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.background,
      marginBottom: layout.spacingXs,
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
    optionList: {
      gap: layout.spacingXs,
    },
    selectorLabel: {
      fontSize: typography.caption,
      color: colors.textMuted,
      marginTop: layout.spacingSm,
      marginBottom: layout.spacingXs / 2,
    },
  });
}
