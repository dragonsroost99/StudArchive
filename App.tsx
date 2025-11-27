import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ScrollView,
  Modal,
} from 'react-native';

import { Button } from './src/components/Button';
import { Input } from './src/components/Input';
import { initDb } from './src/db/database';
import {
  ensureRoomsTable,
  listRooms,
  createRoom,
  deleteRoom,
  type Room,
} from './src/db/rooms';
import {
  ensureContainersTable,
  listContainersForRoom,
  createContainer,
  deleteContainer,
  type Container,
} from './src/db/containers';
import {
  ensureItemsTable,
  listItemsForContainer,
  createItem,
  deleteItem,
  updateItem,
  type Item,
  type ItemType,
} from './src/db/items';

import { colors } from './src/theme/colors';
import { layout } from './src/theme/layout';
import { typography } from './src/theme/typography';

type ItemConditionKey = 'new' | 'used' | 'mixed' | 'unknown';

export default function App() {
  const [status, setStatus] = useState<'checking' | 'ok' | 'error'>('checking');
  const [message, setMessage] = useState('Initializing database…');

  // Rooms
  const [rooms, setRooms] = useState<Room[]>([]);
  const [newRoomName, setNewRoomName] = useState('Office');
  const [roomsError, setRoomsError] = useState<string | null>(null);
  const [roomsLoading, setRoomsLoading] = useState(false);
  const [selectedRoomId, setSelectedRoomId] = useState<number | null>(null);

  // Containers
  const [containers, setContainers] = useState<Container[]>([]);
  const [containersError, setContainersError] = useState<string | null>(null);
  const [containersLoading, setContainersLoading] = useState(false);
  const [newContainerName, setNewContainerName] = useState('Bin 1');
  const [selectedContainerId, setSelectedContainerId] = useState<number | null>(
    null
  );

  // Items
  const [items, setItems] = useState<Item[]>([]);
  const [itemsError, setItemsError] = useState<string | null>(null);
  const [itemsLoading, setItemsLoading] = useState(false);

  // Item form
  const [newItemType, setNewItemType] = useState<ItemType>('set');
  const [newItemName, setNewItemName] = useState('');
  const [newItemNumber, setNewItemNumber] = useState('');
  const [newItemQty, setNewItemQty] = useState('1');
  const [newItemColor, setNewItemColor] = useState('');
  const [newItemCondition, setNewItemCondition] =
    useState<ItemConditionKey>('unknown');
  const [newItemValueEach, setNewItemValueEach] = useState('');

  // Modals
  const [roomModalVisible, setRoomModalVisible] = useState(false);
  const [containerModalVisible, setContainerModalVisible] = useState(false);
  const [itemModalVisible, setItemModalVisible] = useState(false);
  const [editingItem, setEditingItem] = useState<Item | null>(null);

  // ---------- INIT ----------

  useEffect(() => {
    (async () => {
      try {
        await initDb();
        await ensureRoomsTable();
        await ensureContainersTable();
        await ensureItemsTable();

        await refreshRooms();

        setStatus('ok');
        setMessage('Database initialized ✓ (tables ready)');
      } catch (e: any) {
        console.error(e);
        setStatus('error');
        setMessage('Init error: ' + (e?.message ?? 'unknown'));
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---------- ROOMS ----------

  async function refreshRooms() {
    try {
      setRoomsLoading(true);
      const data = await listRooms();
      setRooms(data);
      setRoomsError(null);

      if (data.length > 0) {
        setSelectedRoomId(prev =>
          prev && data.some(r => r.id === prev) ? prev : data[0].id
        );
      } else {
        setSelectedRoomId(null);
      }
    } catch (e: any) {
      console.error(e);
      setRoomsError(e?.message ?? 'Failed to load rooms');
    } finally {
      setRoomsLoading(false);
    }
  }

  async function handleAddRoom() {
    try {
      if (!newRoomName.trim()) return;
      await createRoom(newRoomName.trim());
      setNewRoomName('Office');
      await refreshRooms();
      setRoomModalVisible(false);
    } catch (e: any) {
      console.error(e);
      setRoomsError(e?.message ?? 'Failed to add room');
    }
  }

  async function handleDeleteRoom(id: number) {
    try {
      await deleteRoom(id);
      await refreshRooms();
    } catch (e: any) {
      console.error(e);
      setRoomsError(e?.message ?? 'Failed to delete room');
    }
  }

  // ---------- CONTAINERS ----------

  async function refreshContainers(roomId: number | null) {
    if (!roomId) {
      setContainers([]);
      setSelectedContainerId(null);
      return;
    }
    try {
      setContainersLoading(true);
      const data = await listContainersForRoom(roomId);
      setContainers(data);
      setContainersError(null);

      if (data.length > 0) {
        setSelectedContainerId(prev =>
          prev && data.some(c => c.id === prev) ? prev : data[0].id
        );
      } else {
        setSelectedContainerId(null);
      }
    } catch (e: any) {
      console.error(e);
      setContainersError(e?.message ?? 'Failed to load containers');
    } finally {
      setContainersLoading(false);
    }
  }

  async function handleAddContainer() {
    try {
      if (!selectedRoomId || !newContainerName.trim()) return;
      await createContainer(selectedRoomId, newContainerName.trim());
      setNewContainerName('Bin 1');
      await refreshContainers(selectedRoomId);
      setContainerModalVisible(false);
    } catch (e: any) {
      console.error(e);
      setContainersError(e?.message ?? 'Failed to add container');
    }
  }

  async function handleDeleteContainer(id: number) {
    try {
      if (!selectedRoomId) return;
      await deleteContainer(id);
      await refreshContainers(selectedRoomId);
    } catch (e: any) {
      console.error(e);
      setContainersError(e?.message ?? 'Failed to delete container');
    }
  }

  useEffect(() => {
    void refreshContainers(selectedRoomId);
  }, [selectedRoomId]);

  // ---------- ITEMS ----------

  async function refreshItems(containerId: number | null) {
    if (!containerId) {
      setItems([]);
      return;
    }
    try {
      setItemsLoading(true);
      const data = await listItemsForContainer(containerId);
      setItems(data);
      setItemsError(null);
    } catch (e: any) {
      console.error(e);
      setItemsError(e?.message ?? 'Failed to load items');
    } finally {
      setItemsLoading(false);
    }
  }

  useEffect(() => {
    void refreshItems(selectedContainerId);
  }, [selectedContainerId]);

  function conditionKeyToLabel(key: ItemConditionKey): string {
    switch (key) {
      case 'new':
        return 'New';
      case 'used':
        return 'Used';
      case 'mixed':
        return 'Mixed';
      default:
        return 'Unknown';
    }
  }

  function labelToConditionKey(label: string | null): ItemConditionKey {
    if (!label) return 'unknown';
    const lower = label.toLowerCase();
    if (lower.startsWith('new')) return 'new';
    if (lower.startsWith('used')) return 'used';
    if (lower.startsWith('mix')) return 'mixed';
    return 'unknown';
  }

  async function handleSaveItem() {
    try {
      if (!selectedContainerId) return;
      if (!newItemName.trim()) return;

      const qty = parseInt(newItemQty || '1', 10);
      const safeQty = Number.isNaN(qty) ? 1 : Math.max(qty, 1);

      const valueEachNum = parseFloat(newItemValueEach || '0');
      const valueEach =
        !Number.isNaN(valueEachNum) && valueEachNum > 0
          ? valueEachNum
          : undefined;

      if (editingItem == null) {
        await createItem({
          containerId: selectedContainerId,
          type: newItemType,
          name: newItemName.trim(),
          number: newItemNumber || undefined,
          qty: safeQty,
          color: newItemColor || undefined,
          condition: conditionKeyToLabel(newItemCondition),
          valueEach,
        });
      } else {
        await updateItem({
          id: editingItem.id,
          containerId: selectedContainerId,
          type: newItemType,
          name: newItemName.trim(),
          number: newItemNumber || undefined,
          qty: safeQty,
          color: newItemColor || undefined,
          condition: conditionKeyToLabel(newItemCondition),
          valueEach,
        });
      }

      // reset form
      setNewItemName('');
      setNewItemNumber('');
      setNewItemQty('1');
      setNewItemColor('');
      setNewItemCondition('unknown');
      setNewItemValueEach('');
      setEditingItem(null);

      await refreshItems(selectedContainerId);
      setItemModalVisible(false);
    } catch (e: any) {
      console.error(e);
      setItemsError(e?.message ?? 'Failed to save item');
    }
  }

  async function handleDeleteItem(id: number) {
    try {
      if (!selectedContainerId) return;
      await deleteItem(id);
      await refreshItems(selectedContainerId);
    } catch (e: any) {
      console.error(e);
      setItemsError(e?.message ?? 'Failed to delete item');
    }
  }

  function openAddItemModal() {
    if (!selectedContainerId) return;
    setEditingItem(null);
    setNewItemType('set');
    setNewItemCondition('unknown');
    setNewItemName('');
    setNewItemNumber('');
    setNewItemColor('');
    setNewItemQty('1');
    setNewItemValueEach('');
    setItemModalVisible(true);
  }

  function openEditItemModal(item: Item) {
    setEditingItem(item);
    setNewItemType(item.type);
    setNewItemName(item.name);
    setNewItemNumber(item.number ?? '');
    setNewItemColor(item.color ?? '');
    setNewItemQty(String(item.qty || 1));
    setNewItemValueEach(
      item.value_each != null ? item.value_each.toString() : ''
    );
    setNewItemCondition(labelToConditionKey(item.condition ?? 'Unknown'));
    setItemModalVisible(true);
  }

  // ---------- SMALL RENDER HELPERS ----------

  function renderTypeChip(type: ItemType, label: string) {
    const active = newItemType === type;
    return (
      <TouchableOpacity
        key={type}
        style={[styles.typeChip, active && styles.typeChipActive]}
        onPress={() => setNewItemType(type)}
      >
        <Text
          style={[
            styles.typeChipText,
            active && styles.typeChipTextActive,
          ]}
        >
          {label}
        </Text>
      </TouchableOpacity>
    );
  }

  function renderConditionChip(key: ItemConditionKey, label: string) {
    const active = newItemCondition === key;
    return (
      <TouchableOpacity
        key={key}
        style={[styles.typeChip, active && styles.typeChipActive]}
        onPress={() => setNewItemCondition(key)}
      >
        <Text
          style={[
            styles.typeChipText,
            active && styles.typeChipTextActive,
          ]}
        >
          {label}
        </Text>
      </TouchableOpacity>
    );
  }

  // ---------- RENDER ----------

  return (
    <>
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        {/* Header */}
        <View style={styles.headerCard}>
          <Text style={styles.appTitle}>StudArchive</Text>
          <Text style={styles.appSubtitle}>Keep your bricks in line</Text>
          <View style={styles.headerDivider} />
          <Text
            style={[
              styles.status,
              status === 'ok'
                ? styles.statusOk
                : status === 'error'
                ? styles.statusError
                : null,
            ]}
          >
            {message}
          </Text>
        </View>

        {/* Rooms */}
        <View style={styles.section}>
          <View style={styles.sectionHeaderRow}>
            <Text style={styles.sectionTitle}>Rooms</Text>
            <Button
              label="Add Room"
              onPress={() => {
                setNewRoomName('Office');
                setRoomModalVisible(true);
              }}
            />
          </View>

          {roomsError ? <Text style={styles.errorText}>{roomsError}</Text> : null}

          {roomsLoading ? (
            <Text style={styles.bodyText}>Loading rooms…</Text>
          ) : rooms.length === 0 ? (
            <Text style={styles.bodyText}>
              No rooms yet — use <Text style={styles.bold}>Add Room</Text> to
              create one.
            </Text>
          ) : (
            <>
              <Text style={styles.subLabel}>Tap to select active room:</Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                style={styles.chipsRow}
              >
                {rooms.map(room => {
                  const isActive = room.id === selectedRoomId;
                  return (
                    <TouchableOpacity
                      key={room.id}
                      style={[
                        styles.roomChip,
                        isActive && styles.roomChipActive,
                      ]}
                      onPress={() => setSelectedRoomId(room.id)}
                      onLongPress={() => handleDeleteRoom(room.id)}
                    >
                      <Text
                        style={[
                          styles.roomChipText,
                          isActive && styles.roomChipTextActive,
                        ]}
                      >
                        {room.name}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            </>
          )}
        </View>

        {/* Containers */}
        <View style={styles.section}>
          <View style={styles.sectionHeaderRow}>
            <Text style={styles.sectionTitle}>Containers</Text>
            <Button
              label="Add Container"
              onPress={() => {
                if (!selectedRoomId) return;
                setNewContainerName('Bin 1');
                setContainerModalVisible(true);
              }}
              disabled={!selectedRoomId}
            />
          </View>

          {selectedRoomId == null ? (
            <Text style={styles.bodyTextMuted}>
              Create and select a room above to add containers.
            </Text>
          ) : (
            <>
              {containersError ? (
                <Text style={styles.errorText}>{containersError}</Text>
              ) : null}

              {containersLoading ? (
                <Text style={styles.bodyText}>Loading containers…</Text>
              ) : containers.length === 0 ? (
                <Text style={styles.bodyText}>
                  No containers yet — use{' '}
                  <Text style={styles.bold}>Add Container</Text>.
                </Text>
              ) : (
                <>
                  <Text style={styles.subLabel}>
                    Tap to select active container:
                  </Text>
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    style={styles.chipsRow}
                  >
                    {containers.map(container => {
                      const isActive =
                        container.id === selectedContainerId;
                      return (
                        <TouchableOpacity
                          key={container.id}
                          style={[
                            styles.containerChip,
                            isActive && styles.containerChipActive,
                          ]}
                          onPress={() =>
                            setSelectedContainerId(container.id)
                          }
                          onLongPress={() =>
                            handleDeleteContainer(container.id)
                          }
                        >
                          <Text
                            style={[
                              styles.containerChipText,
                              isActive && styles.containerChipTextActive,
                            ]}
                          >
                            {container.name}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </ScrollView>
                </>
              )}
            </>
          )}
        </View>

        {/* Items */}
        <View style={styles.section}>
          <View style={styles.sectionHeaderRow}>
            <Text style={styles.sectionTitle}>Items in Container</Text>
            <Button
              label="Add Item"
              onPress={openAddItemModal}
              disabled={!selectedContainerId}
            />
          </View>

          {selectedContainerId == null ? (
            <Text style={styles.bodyTextMuted}>
              Select a container above to add and view items.
            </Text>
          ) : (
            <>
              {itemsError ? (
                <Text style={styles.errorText}>{itemsError}</Text>
              ) : null}

              {itemsLoading ? (
                <Text style={styles.bodyText}>Loading items…</Text>
              ) : items.length === 0 ? (
                <Text style={styles.bodyText}>
                  No items in this container yet — use{' '}
                  <Text style={styles.bold}>Add Item</Text>.
                </Text>
              ) : (
                <FlatList
                scrollEnabled={false}
                data={items}
                keyExtractor={item => item.id.toString()}
                renderItem={({ item }) => {
                  const extras: string[] = [];
                  if (item.color) extras.push(item.color);
                  if (item.condition) extras.push(item.condition);
                  if (item.value_total != null) {
                    extras.push(`$${item.value_total.toFixed(2)}`);
                  }

                  return (
                    <View style={styles.listItem}>
                      <TouchableOpacity
                        style={{ flex: 1 }}
                        onPress={() => openEditItemModal(item)}
                      >
                        <View style={styles.listRowInner}>
                          <View style={styles.typeBadge}>
                            <Text style={styles.typeBadgeText}>
                              {item.type.toUpperCase()}
                            </Text>
                          </View>
                          <Text style={styles.listText}>
                            {item.name}
                            {item.number ? ` (#${item.number})` : ''}
                            {item.qty > 1 ? ` x${item.qty}` : ''}
                            {extras.length > 0 ? ` — ${extras.join(' | ')}` : ''}
                          </Text>
                        </View>
                      </TouchableOpacity>

                      <Button
                        label="Delete"
                        variant="danger"
                        onPress={() => handleDeleteItem(item.id)}
                        style={styles.listDeleteButton}
                      />
                    </View>
                  );
                }}
              />


              )}
            </>
          )}
        </View>
      </ScrollView>

      {/* Room modal */}
      <Modal
        visible={roomModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setRoomModalVisible(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Add Room</Text>
            <Input
             label="Room name"
             value={newRoomName}
              onChangeText={setNewRoomName}
              placeholder="Room name (e.g. Office)"
            />
            <View style={styles.modalButtonRow}>
              <Button
                label="Cancel"
                variant="outline"
                onPress={() => setRoomModalVisible(false)}
              />
              <Button label="Save" onPress={handleAddRoom} />
            </View>
          </View>
        </View>
      </Modal>

      {/* Container modal */}
      <Modal
        visible={containerModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setContainerModalVisible(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Add Container</Text>
            <Input
            label="Container name"
            value={newContainerName}
            onChangeText={setNewContainerName}
            placeholder="Bin name (e.g. Bin 1)"
/>

            <View style={styles.modalButtonRow}>
              <Button
                label="Cancel"
                variant="outline"
                onPress={() => setContainerModalVisible(false)}
              />
            <Button label="Save" onPress={handleAddContainer} />
            </View>
          </View>
        </View>
      </Modal>

      {/* Item modal */}
      <Modal
        visible={itemModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => {
          setItemModalVisible(false);
          setEditingItem(null);
        }}
      >
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalCard, { maxHeight: '85%' }]}>
            <ScrollView
              contentContainerStyle={{ paddingBottom: layout.spacingLg }}
              keyboardShouldPersistTaps="handled"
            >
              <Text style={styles.modalTitle}>
                {editingItem ? 'Edit Item' : 'Add Item'}
              </Text>

              <Text style={styles.subLabel}>Type</Text>
              <View style={styles.typeChipsRow}>
                {renderTypeChip('set', 'Set')}
                {renderTypeChip('part', 'Part')}
                {renderTypeChip('minifig', 'Minifig')}
                {renderTypeChip('moc', 'MOC')}
              </View>

              <Text style={styles.subLabel}>Condition</Text>
              <View style={styles.typeChipsRow}>
                {renderConditionChip('new', 'New')}
                {renderConditionChip('used', 'Used')}
                {renderConditionChip('mixed', 'Mixed')}
                {renderConditionChip('unknown', 'Unknown')}
              </View>

               <Input
                label="Name"
                value={newItemName}
                onChangeText={setNewItemName}
                placeholder="Falcon, 1x2 Plate, etc."
              />

                <Input
                label="Number"
                value={newItemNumber}
                onChangeText={setNewItemNumber}
                placeholder="Set / part number (optional)"
              />
                <Input
                label="Color"
                value={newItemColor}
                onChangeText={setNewItemColor}
                placeholder="Dark Bluish Gray, etc."
              />


                <View style={styles.row}>
                  <Input
                    label="Qty"
                    value={newItemQty}
                    onChangeText={setNewItemQty}
                    placeholder="1"
                    keyboardType="number-pad"
                    style={{ flex: 0.6 }}
                  />
                  <Input
                    label="Value each"
                    value={newItemValueEach}
                    onChangeText={setNewItemValueEach}
                    placeholder="0.00"
                    keyboardType="decimal-pad"
                    style={{ flex: 1 }}
                  />
                </View>


              {itemsError ? (
                <Text style={styles.errorText}>{itemsError}</Text>
              ) : null}

              <View style={styles.modalButtonRow}>
                <Button
                  label="Cancel"
                  variant="outline"
                  onPress={() => {
                    setItemModalVisible(false);
                    setEditingItem(null);
                  }}
                />
                <Button
                  label={editingItem ? 'Save Changes' : 'Save Item'}
                  onPress={handleSaveItem}
                />
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </>
  );
}

// ---------- STYLES ----------

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingTop: 56,
    paddingHorizontal: layout.spacingLg,
    backgroundColor: colors.background,
  },
  scrollContent: {
    paddingBottom: 200,
    flexGrow: 1,
  },

  // Header
  headerCard: {
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    borderRadius: layout.radiusLg,
    padding: layout.spacingLg,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: layout.spacingLg,
    alignItems: 'center',
  },
  appTitle: {
    fontSize: 28,
    fontWeight: '700',
    color: colors.heading,
    textAlign: 'center',
  },
  appSubtitle: {
    fontSize: typography.caption,
    color: colors.textMuted,
    textAlign: 'center',
    marginTop: layout.spacingXs,
    marginBottom: layout.spacingSm,
  },
  headerDivider: {
    width: '60%',
    height: 1,
    backgroundColor: colors.border,
    marginBottom: layout.spacingSm,
  },
  status: {
    fontSize: typography.body,
    textAlign: 'center',
  },
  statusOk: {
    color: '#22C55E',
  },
  statusError: {
    color: colors.danger,
  },

  // Sections
  section: {
    marginTop: layout.spacingSm,
    marginBottom: layout.spacingMd,
    backgroundColor: colors.surface,
    borderRadius: layout.radiusLg,
    padding: layout.spacingMd,
    borderWidth: 1,
    borderColor: colors.border,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: layout.spacingXs,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '600',
    marginTop: layout.spacingXs,
    marginBottom: layout.spacingSm,
    color: colors.heading,
  },

  // Text helpers
  bodyText: {
    fontSize: typography.body,
    color: colors.text,
  },
  bodyTextMuted: {
    fontSize: typography.body,
    color: colors.textMuted,
  },
  bold: {
    fontWeight: '600',
  },
  errorText: {
    fontSize: typography.body,
    color: colors.danger,
    marginTop: layout.spacingXs,
  },
  subLabel: {
    marginTop: layout.spacingXs,
    fontSize: typography.caption,
    color: colors.textMuted,
  },

  // Chips (rooms/containers)
  chipsRow: {
    marginTop: layout.spacingSm,
  },
  roomChip: {
    paddingHorizontal: layout.spacingMd,
    paddingVertical: layout.spacingSm,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.chipBorder,
    marginRight: layout.spacingSm,
    backgroundColor: colors.background,
  },
  roomChipActive: {
    backgroundColor: colors.chipActiveBg,
    borderColor: colors.chipActiveBorder,
  },
  roomChipText: {
    fontSize: typography.chip,
    color: colors.text,
  },
  roomChipTextActive: {
    color: colors.chipActiveText,
    fontWeight: '600',
  },
  containerChip: {
    paddingHorizontal: layout.spacingMd,
    paddingVertical: layout.spacingSm,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.chipBorder,
    marginRight: layout.spacingSm,
    backgroundColor: colors.background,
  },
  containerChipActive: {
    backgroundColor: colors.primarySoft,
    borderColor: colors.primary,
  },
  containerChipText: {
    fontSize: typography.chip,
    color: colors.text,
  },
  containerChipTextActive: {
    color: colors.primary,
    fontWeight: '600',
  },

  // List items
  listItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: layout.spacingXs,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  listRowInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  listText: {
    flex: 1,
    fontSize: typography.body,
    color: colors.text,
  },
  listDeleteButton: {
    marginLeft: layout.spacingSm,
  },

  // Type badge in list
  typeBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: colors.primarySoft,
    borderWidth: 1,
    borderColor: colors.primary,
  },
  typeBadgeText: {
    fontSize: typography.chipSmall,
    color: colors.primary,
    fontWeight: '600',
  },

  // Type / condition chips in modal
  typeChipsRow: {
    flexDirection: 'row',
    marginTop: layout.spacingXs,
    marginBottom: layout.spacingSm,
    flexWrap: 'wrap',
    gap: layout.spacingSm,
  },
  typeChip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.chipBorder,
    backgroundColor: colors.background,
  },
  typeChipActive: {
    backgroundColor: colors.chipActiveBg,
    borderColor: colors.chipActiveBorder,
  },
  typeChipText: {
    fontSize: typography.chipSmall,
    color: colors.text,
  },
  typeChipTextActive: {
    color: colors.chipActiveText,
    fontWeight: '600',
  },

  // Modal
  modalBackdrop: {
    flex: 1,
    backgroundColor: colors.modalBackdrop,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: layout.spacingLg,
  },
  modalCard: {
    width: '100%',
    backgroundColor: colors.surface,
    borderRadius: layout.radiusLg,
    padding: layout.spacingLg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '600',
    marginBottom: layout.spacingSm,
    textAlign: 'center',
    color: colors.heading,
  },
  modalInput: {
    width: '100%',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: layout.radiusMd,
    paddingHorizontal: layout.spacingMd,
    paddingVertical: layout.spacingSm,
    fontSize: typography.body + 1,
    marginBottom: layout.spacingSm,
    backgroundColor: colors.background,
    color: colors.text,
  },
  modalButtonRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: layout.spacingSm,
    gap: layout.spacingSm,
  },

  // Generic row helper
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: layout.spacingSm,
    marginBottom: layout.spacingSm,
  },
});
