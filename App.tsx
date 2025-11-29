/**
 * Entry point for the StudArchive mobile app.
 * Initializes the SQLite-backed data model and drives the in-screen navigation flow (rooms -> containers -> items) via local state.
 * Renders the main sections: status/header, room selector, container selector, and item list with CRUD modals.
 */
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
  KeyboardAvoidingView,
  Platform,
  Alert,
} from 'react-native';

import { Button } from './src/components/Button';
import { Input } from './src/components/Input';
import { getDb, initDb } from './src/db/database';
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
import { ensureBuildPartsTable } from './src/db/buildParts';

import { colors } from './src/theme/colors';
import { layout } from './src/theme/layout';
import { typography } from './src/theme/typography';
import AboutScreen from './src/screens/AboutScreen';
import PartDetailScreen, {
  PartDetailParams,
} from './src/screens/PartDetailScreen';
import PartListScreen from './src/screens/PartListScreen';
import EditPartScreen from './src/screens/EditPartScreen';
import ContainerDetailScreen from './src/screens/ContainerDetailScreen';
import ImportSetScreen from './src/screens/ImportSetScreen';
import CreateMocScreen from './src/screens/CreateMocScreen';
import AddPartsScreen from './src/screens/AddPartsScreen';
import { fetchSetMetadataFromRebrickable } from './src/services/inventoryImport/rebrickable';

type ItemConditionKey = 'new' | 'used' | 'mixed' | 'unknown';
type ScreenName =
  | 'home'
  | 'about'
  | 'partDetail'
  | 'partList'
  | 'editPart'
  | 'containerDetail'
  | 'importSet'
  | 'createMoc'
  | 'addParts';

export default function App() {
  const [status, setStatus] = useState<'checking' | 'ok' | 'error'>('checking');
  const [message, setMessage] = useState('Initializing database…');
  const [currentScreen, setCurrentScreen] = useState<ScreenName>('home');
  const [navStack, setNavStack] = useState<ScreenName[]>([]);
  const [partDetailParams, setPartDetailParams] =
    useState<PartDetailParams | null>(null);
  const [editPartParams, setEditPartParams] =
    useState<PartDetailParams | null>(null);
  const [containerDetailParams, setContainerDetailParams] = useState<{
    containerId: number;
    containerName?: string;
  } | null>(null);
  const [partDetailRefreshKey, setPartDetailRefreshKey] = useState(0);

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
  const [containerStats, setContainerStats] = useState<
    Record<number, { itemCount: number; totalQuantity: number }>
  >({});
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
  const [newItemCategory, setNewItemCategory] = useState('');
  const [newItemDescription, setNewItemDescription] = useState('');
  const [newItemImageUri, setNewItemImageUri] = useState('');
  const [newItemCondition, setNewItemCondition] =
    useState<ItemConditionKey>('unknown');
  const [newItemValueEach, setNewItemValueEach] = useState('');
  const [newItemNameTyped, setNewItemNameTyped] = useState(false);
  const [newItemNumberTyped, setNewItemNumberTyped] = useState(false);
  const [newItemColorTyped, setNewItemColorTyped] = useState(false);
  const [newItemCategoryTyped, setNewItemCategoryTyped] = useState(false);
  const [newItemDescriptionTyped, setNewItemDescriptionTyped] = useState(false);
  const [newItemImageUriTyped, setNewItemImageUriTyped] = useState(false);
  const [newItemQtyTyped, setNewItemQtyTyped] = useState(false);
  const [newItemValueEachTyped, setNewItemValueEachTyped] = useState(false);
  const [setMetadataLoading, setSetMetadataLoading] = useState(false);

  // Modals
  const [roomModalVisible, setRoomModalVisible] = useState(false);
  const [containerModalVisible, setContainerModalVisible] = useState(false);
  const [itemModalVisible, setItemModalVisible] = useState(false);
  const [editingItem, setEditingItem] = useState<Item | null>(null);
  const [addModalVisible, setAddModalVisible] = useState(false);
  const [partDetailHeader, setPartDetailHeader] = useState<string>('Details');
  const [containerHeader, setContainerHeader] = useState<string>('Container');

  async function cleanOrphanBuildParts(): Promise<void> {
    const db = await getDb();
    try {
      await db.runAsync(
        `
          DELETE FROM build_parts
          WHERE parent_item_id NOT IN (SELECT id FROM items);
        `
      );
    } catch (error) {
      console.error('Failed to clean orphan build_parts', error);
    }
  }

  function navigateTo(screen: ScreenName) {
    if (screen === currentScreen) return;
    setNavStack(prev => [...prev, currentScreen]);
    setCurrentScreen(screen);
  }

  function goBack() {
    setNavStack(prev => {
      if (!prev.length) return prev;
      const previous = prev[prev.length - 1];
      setCurrentScreen(previous);
      return prev.slice(0, -1);
    });
  }

  async function goHome() {
    setNavStack([]);
    setCurrentScreen('home');
    try {
      await refreshRooms();
      if (selectedRoomId != null) {
        await refreshContainers(selectedRoomId);
      }
      if (selectedContainerId != null) {
        await refreshItems(selectedContainerId);
      }
    } catch (error) {
      console.error('Failed to refresh on home', error);
    }
  }

  useEffect(() => {
    if (currentScreen !== 'home') return;
    (async () => {
      try {
        await refreshRooms();
        if (selectedRoomId != null) {
          await refreshContainers(selectedRoomId);
        }
        if (selectedContainerId != null) {
          await refreshItems(selectedContainerId);
        }
      } catch (error) {
        console.error('Failed to refresh on home (back nav)', error);
      }
    })();
  }, [currentScreen, selectedRoomId, selectedContainerId]);

  // ---------- INIT ----------

  useEffect(() => {
    (async () => {
      try {
        await initDb();
        await ensureRoomsTable();
        await ensureContainersTable();
        await ensureItemsTable();
        await ensureBuildPartsTable();
        await cleanOrphanBuildParts();

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

  async function refreshContainerStats() {
    try {
      const db = await getDb();
      const rows = await db.getAllAsync<{
        container_id: number | null;
        itemCount: number;
        totalQuantity: number | null;
      }>(`
        SELECT
          container_id,
          COUNT(*) AS itemCount,
          SUM(qty) AS totalQuantity
        FROM items
        WHERE container_id IS NOT NULL
        GROUP BY container_id;
      `);
      const map: Record<number, { itemCount: number; totalQuantity: number }> = {};
      rows.forEach(row => {
        if (row.container_id != null) {
          map[row.container_id] = {
            itemCount: row.itemCount ?? 0,
            totalQuantity: row.totalQuantity ?? 0,
          };
        }
      });
      setContainerStats(map);
    } catch (e) {
      console.error('Failed to load container stats', e);
    }
  }

  async function refreshContainers(roomId: number | null) {
    if (!roomId) {
      setContainers([]);
      setSelectedContainerId(null);
      setContainerStats({});
      return;
    }
    try {
      setContainersLoading(true);
      const data = await listContainersForRoom(roomId);
      setContainers(data);
      setContainersError(null);
      await refreshContainerStats();

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

  async function deleteContainerNow(id: number) {
    try {
      if (!selectedRoomId) return;
      await deleteContainer(id);
      await refreshContainers(selectedRoomId);
    } catch (e: any) {
      console.error(e);
        setContainersError(e?.message ?? 'Failed to delete container');
    }
  }

  function confirmDeleteContainer(id: number) {
    Alert.alert(
      'Delete container?',
      'Are you sure you want to delete this container?',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: () => void deleteContainerNow(id) },
      ]
    );
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
      void refreshContainerStats();
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

  function handleFirstType(
    incoming: string,
    currentValue: string,
    hasTyped: boolean,
    markTyped: (value: boolean) => void,
    setter: (value: string) => void
  ) {
    if (!hasTyped) {
      const delta = incoming.startsWith(currentValue)
        ? incoming.slice(currentValue.length)
        : incoming;
      markTyped(true);
      setter(delta);
      return;
    }
    setter(incoming);
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
      const category =
        newItemCategory.trim() !== '' ? newItemCategory.trim() : undefined;
      const description =
        newItemDescription.trim() !== '' ? newItemDescription.trim() : undefined;
      const imageUri =
        newItemImageUri.trim() !== '' ? newItemImageUri.trim() : undefined;

      if (editingItem == null) {
        await createItem({
          containerId: selectedContainerId,
          type: newItemType,
          name: newItemName.trim(),
          number: newItemNumber || undefined,
          qty: safeQty,
          color: newItemColor || undefined,
          condition: conditionKeyToLabel(newItemCondition),
          imageUri,
          category,
          description,
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
          imageUri,
          category,
          description,
          valueEach,
        });
      }

      // reset form
      setNewItemName('');
      setNewItemNumber('');
      setNewItemQty('1');
      setNewItemColor('');
      setNewItemCategory('');
      setNewItemDescription('');
      setNewItemImageUri('');
      setNewItemCondition('unknown');
      setNewItemValueEach('');
      setNewItemNameTyped(false);
      setNewItemNumberTyped(false);
      setNewItemColorTyped(false);
      setNewItemCategoryTyped(false);
      setNewItemDescriptionTyped(false);
      setNewItemImageUriTyped(false);
      setNewItemQtyTyped(false);
      setNewItemValueEachTyped(false);
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
      const db = await getDb();
      await db.execAsync('BEGIN TRANSACTION;');
      await db.runAsync(`DELETE FROM build_parts WHERE parent_item_id = ?;`, [id]);
      await deleteItem(id);
      await db.execAsync('COMMIT;');

      if (selectedContainerId) {
        await refreshItems(selectedContainerId);
      }
      setPartDetailParams(null);
      setEditPartParams(null);

      if (currentScreen === 'editPart') {
        goBack();
        goBack();
      } else if (currentScreen === 'partDetail') {
        goBack();
      }
    } catch (e: any) {
      try {
        await (await getDb()).execAsync('ROLLBACK;');
      } catch {}
      console.error(e);
      setItemsError(e?.message ?? 'Failed to delete item');
    }
  }

  function confirmDeleteItem(id: number) {
    Alert.alert(
      'Delete item?',
      'Are you sure you want to delete this item?',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: () => void handleDeleteItem(id) },
      ]
    );
  }

  function openEditItemModal(item: Item) {
    setEditingItem(item);
    setNewItemType(item.type);
    setNewItemName(item.name);
    setNewItemNumber(item.number ?? '');
    setNewItemColor(item.color ?? '');
    setNewItemCategory(item.category ?? '');
    setNewItemDescription(item.description ?? '');
    setNewItemImageUri(item.image_uri ?? '');
    setNewItemQty(String(item.qty || 1));
    setNewItemValueEach(
      item.value_each != null ? item.value_each.toString() : ''
    );
    setNewItemCondition(labelToConditionKey(item.condition ?? 'Unknown'));
    setNewItemNameTyped(false);
    setNewItemNumberTyped(false);
    setNewItemColorTyped(false);
    setNewItemCategoryTyped(false);
    setNewItemDescriptionTyped(false);
    setNewItemImageUriTyped(false);
    setNewItemQtyTyped(false);
    setNewItemValueEachTyped(false);
    setSetMetadataLoading(false);
    setItemModalVisible(true);
  }

  async function handleFillFromRebrickable() {
    if (newItemType !== 'set') return;
    const candidate = newItemNumber.trim();
    if (!candidate) return;
    setSetMetadataLoading(true);
    try {
      const metadata = await fetchSetMetadataFromRebrickable(candidate);
      if (!metadata) {
        Alert.alert(
          'Could not fetch set details',
          'Check the set number and try again.'
        );
        return;
      }
      setNewItemName(metadata.name ?? newItemName);
      setNewItemNameTyped(true);
      setNewItemNumber(metadata.setNum ?? candidate);
      setNewItemNumberTyped(true);
      if (!newItemImageUri.trim() && metadata.imageUrl) {
        setNewItemImageUri(metadata.imageUrl);
        setNewItemImageUriTyped(true);
      }
    } catch (error) {
      console.error('Fill from Rebrickable failed', error);
      Alert.alert(
        'Could not fetch set details',
        'Check the set number and try again.'
      );
    } finally {
      setSetMetadataLoading(false);
    }
  }

  const canFillFromRebrickable = newItemType === 'set' && newItemNumber.trim().length > 0;

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

  function handleOpenPartDetailFromList(item: {
    id: number;
    name: string;
    color: string | null;
    qty: number | null;
    quantity?: number | null;
  }) {
    setPartDetailParams({
      partId: String(item.id),
      partName: item.name,
      colorName: item.color ?? undefined,
      quantity: item.qty ?? item.quantity ?? undefined,
    });
    navigateTo('partDetail');
  }

  if (currentScreen === 'about') {
    return (
      <View style={styles.aboutWrapper}>
        <View style={styles.aboutHeaderRow}>
          <Text style={styles.headerTitle}>About</Text>
          <View style={styles.headerActionsRow}>
            <Button
              label="Back"
              variant="outline"
              onPress={goBack}
              style={styles.headerButton}
            />
            <Button
              label="Home"
              variant="outline"
              onPress={goHome}
              style={styles.headerButton}
            />
          </View>
        </View>
        <AboutScreen />
      </View>
    );
  }

  if (currentScreen === 'partDetail') {
    const headerTitle = partDetailHeader || partDetailParams?.partName || 'Details';
    return (
      <View style={styles.aboutWrapper}>
        <View style={styles.aboutHeaderRow}>
          <Text style={styles.headerTitle}>{headerTitle}</Text>
          <View style={styles.headerActionsRow}>
            <Button
              label="Back"
              variant="outline"
              onPress={goBack}
              style={styles.headerButton}
            />
            <Button
              label="Home"
              variant="outline"
              onPress={goHome}
              style={styles.headerButton}
            />
          </View>
        </View>
        <PartDetailScreen
          params={partDetailParams ?? undefined}
          refreshKey={partDetailRefreshKey}
          onEditPress={params => {
            setEditPartParams(params);
            navigateTo('editPart');
          }}
          onTitleChange={title => setPartDetailHeader(title)}
          onNavigateToDetail={params => {
            setPartDetailParams(params);
            navigateTo('partDetail');
          }}
        />
      </View>
    );
  }

  if (currentScreen === 'partList') {
    return (
      <View style={styles.aboutWrapper}>
        <View style={styles.aboutHeaderRow}>
          <Text style={styles.headerTitle}>Collection</Text>
          <View style={styles.headerActionsRow}>
            <Button
              label="Back"
              variant="outline"
              onPress={goBack}
              style={styles.headerButton}
            />
            <Button
              label="Home"
              variant="outline"
              onPress={goHome}
              style={styles.headerButton}
            />
          </View>
        </View>
        <PartListScreen
          onSelectPart={item => handleOpenPartDetailFromList(item)}
          onImportSet={() => navigateTo('importSet')}
          onCreateMoc={() => navigateTo('createMoc')}
          onAddParts={() => navigateTo('addParts')}
        />
      </View>
    );
  }

  if (currentScreen === 'containerDetail') {
    const headerTitle = containerHeader || containerDetailParams?.containerName || 'Container';
    return (
      <View style={styles.aboutWrapper}>
        <View style={styles.aboutHeaderRow}>
          <Text style={styles.headerTitle}>{headerTitle}</Text>
          <View style={styles.headerActionsRow}>
            <Button
              label="Back"
              variant="outline"
              onPress={goBack}
              style={styles.headerButton}
            />
            <Button
              label="Home"
              variant="outline"
              onPress={goHome}
              style={styles.headerButton}
            />
          </View>
        </View>
        <ContainerDetailScreen
          params={
            containerDetailParams ?? undefined
          }
          onSelectItem={item => handleOpenPartDetailFromList(item)}
          onTitleChange={title => setContainerHeader(title)}
        />
      </View>
    );
  }

  if (currentScreen === 'importSet') {
    return (
      <View style={styles.aboutWrapper}>
        <View style={styles.aboutHeaderRow}>
          <Text style={styles.headerTitle}>Import Set</Text>
          <View style={styles.headerActionsRow}>
            <Button
              label="Back"
              variant="outline"
              onPress={goBack}
              style={styles.headerButton}
            />
            <Button
              label="Home"
              variant="outline"
              onPress={goHome}
              style={styles.headerButton}
            />
          </View>
        </View>
        <ImportSetScreen
          onImported={newId => {
            setPartDetailParams({ partId: String(newId) });
            setPartDetailRefreshKey(key => key + 1);
            navigateTo('partDetail');
          }}
        />
      </View>
    );
  }

  if (currentScreen === 'createMoc') {
    return (
      <View style={styles.aboutWrapper}>
        <View style={styles.aboutHeaderRow}>
          <Text style={styles.headerTitle}>Create MOC</Text>
          <View style={styles.headerActionsRow}>
            <Button
              label="Back"
              variant="outline"
              onPress={goBack}
              style={styles.headerButton}
            />
            <Button
              label="Home"
              variant="outline"
              onPress={goHome}
              style={styles.headerButton}
            />
          </View>
        </View>
        <CreateMocScreen
          onCreated={newId => {
            setPartDetailParams({ partId: String(newId) });
            setPartDetailRefreshKey(key => key + 1);
            navigateTo('partDetail');
          }}
        />
      </View>
    );
  }

  if (currentScreen === 'addParts') {
    return (
      <View style={styles.aboutWrapper}>
        <View style={styles.aboutHeaderRow}>
          <Text style={styles.headerTitle}>Add Parts</Text>
          <View style={styles.headerActionsRow}>
            <Button
              label="Back"
              variant="outline"
              onPress={goBack}
              style={styles.headerButton}
            />
            <Button
              label="Home"
              variant="outline"
              onPress={goHome}
              style={styles.headerButton}
            />
          </View>
        </View>
        <AddPartsScreen
          onAdded={newId => {
            setPartDetailParams({ partId: String(newId) });
            setPartDetailRefreshKey(key => key + 1);
            navigateTo('partDetail');
          }}
        />
      </View>
    );
  }

  if (currentScreen === 'editPart') {
    return (
      <View style={styles.aboutWrapper}>
        <View style={styles.aboutHeaderRow}>
          <Text style={styles.headerTitle}>Edit Item</Text>
          <View style={styles.headerActionsRow}>
            <Button
              label="Back"
              variant="outline"
              onPress={goBack}
              style={styles.headerButton}
            />
            <Button
              label="Home"
              variant="outline"
              onPress={goHome}
              style={styles.headerButton}
            />
          </View>
        </View>
        <EditPartScreen
          params={editPartParams ?? partDetailParams ?? undefined}
          onSaved={updated => {
            const resolvedId =
              updated?.id ||
              (editPartParams?.partId
                ? Number(editPartParams.partId)
                : partDetailParams?.partId
                ? Number(partDetailParams.partId)
                : 0);
            const resolvedPartId =
              resolvedId && !Number.isNaN(resolvedId)
                ? String(resolvedId)
                : editPartParams?.partId ?? partDetailParams?.partId ?? '';
            if (!resolvedPartId) {
              goBack();
              setEditPartParams(null);
              return;
            }
            setPartDetailParams({
              partId: resolvedPartId,
              partName: updated?.name ?? partDetailParams?.partName,
              colorName: updated?.color ?? partDetailParams?.colorName,
              quantity: updated?.qty ?? partDetailParams?.quantity,
            });
            setPartDetailRefreshKey(key => key + 1);
            goBack();
            setEditPartParams(null);
          }}
          onDelete={id => {
            confirmDeleteItem(id);
          }}
        />
      </View>
    );
  }

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
          <Button
            label="About"
            variant="outline"
            onPress={() => navigateTo('about')}
            style={styles.aboutButton}
          />
          <Button
            label="ADD ITEM"
            onPress={() => setAddModalVisible(true)}
            style={styles.aboutButton}
          />
          <Button
            label="My Collection"
            variant="outline"
            onPress={() => {
              setPartDetailParams(null);
              navigateTo('partList');
            }}
            style={styles.aboutButton}
          />
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
                      const stats = containerStats[container.id];
                      const statsLabel = stats
                        ? `${stats.itemCount} items • ${stats.totalQuantity} pieces`
                        : '0 items • 0 pieces';
                      return (
                    <TouchableOpacity
                      key={container.id}
                      style={[
                        styles.containerChip,
                        isActive && styles.containerChipActive,
                      ]}
                      onPress={() => {
                        setSelectedContainerId(container.id);
                        setContainerDetailParams({
                          containerId: container.id,
                          containerName: container.name,
                        });
                        navigateTo('containerDetail');
                      }}
                      onLongPress={() =>
                        confirmDeleteContainer(container.id)
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
                          <Text
                            style={[
                              styles.containerChipSubText,
                              isActive && styles.containerChipSubTextActive,
                            ]}
                          >
                            {stats ? statsLabel : 'No items yet'}
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
                <Text style={styles.bodyText}>No items in this container yet.</Text>
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
                        onPress={() => handleOpenPartDetailFromList(item)}
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

                    </View>
                  );
                }}
              />


              )}
            </>
          )}
        </View>
      </ScrollView>

      <Modal
        visible={addModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setAddModalVisible(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Add to Collection</Text>
            <View style={styles.actionsColumn}>
              <Button
                label="Import Set"
                onPress={() => {
                  setAddModalVisible(false);
                  navigateTo('importSet');
                }}
              />
              <Button
                label="Create MOC"
                variant="outline"
                onPress={() => {
                  setAddModalVisible(false);
                  navigateTo('createMoc');
                }}
              />
              <Button
                label="Add Parts"
                variant="outline"
                onPress={() => {
                  setAddModalVisible(false);
                  navigateTo('addParts');
                }}
              />
              <Button
                label="Cancel"
                variant="outline"
                onPress={() => setAddModalVisible(false)}
              />
            </View>
          </View>
        </View>
      </Modal>

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
            <View style={[styles.modalCard, styles.modalCardTall]}>
              <KeyboardAvoidingView
                style={{ flex: 1 }}
                behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
              >
                <ScrollView
                  style={styles.modalScroll}
                  contentContainerStyle={styles.modalScrollContent}
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
                  onChangeText={text =>
                    handleFirstType(
                      text,
                      newItemName,
                      newItemNameTyped,
                      setNewItemNameTyped,
                      setNewItemName
                    )
                  }
                  placeholder="Falcon, 1x2 Plate, etc."
                />

                  <View style={styles.inlineRow}>
                    <Input
                      label="Number"
                      value={newItemNumber}
                      onChangeText={text =>
                        handleFirstType(
                          text,
                          newItemNumber,
                          newItemNumberTyped,
                          setNewItemNumberTyped,
                          setNewItemNumber
                        )
                      }
                      placeholder="Set / part number (optional)"
                      style={{ flex: 1 }}
                    />
                    {canFillFromRebrickable ? (
                      <Button
                        label={setMetadataLoading ? 'Filling...' : 'Fill from Rebrickable'}
                        variant="outline"
                        onPress={handleFillFromRebrickable}
                        disabled={setMetadataLoading}
                        style={styles.fillButton}
                      />
                    ) : null}
                  </View>
                  <Input
                  label="Color"
                  value={newItemColor}
                  onChangeText={text =>
                    handleFirstType(
                      text,
                      newItemColor,
                      newItemColorTyped,
                      setNewItemColorTyped,
                      setNewItemColor
                    )
                  }
                  placeholder="Dark Bluish Gray, etc."
                />
                <Input
                  label="Category"
                  value={newItemCategory}
                  onChangeText={text =>
                    handleFirstType(
                      text,
                      newItemCategory,
                      newItemCategoryTyped,
                      setNewItemCategoryTyped,
                      setNewItemCategory
                    )
                  }
                  placeholder="Category (optional)"
                />
                <Input
                  label="Description"
                  value={newItemDescription}
                  onChangeText={text =>
                    handleFirstType(
                      text,
                      newItemDescription,
                      newItemDescriptionTyped,
                      setNewItemDescriptionTyped,
                      setNewItemDescription
                    )
                  }
                  placeholder="Description (optional)"
                  multiline
                  numberOfLines={3}
                  style={{ minHeight: 90 }}
                />
                <Input
                  label="Image URL"
                  value={newItemImageUri}
                  onChangeText={text =>
                    handleFirstType(
                      text,
                      newItemImageUri,
                      newItemImageUriTyped,
                      setNewItemImageUriTyped,
                      setNewItemImageUri
                    )
                  }
                  placeholder="https://example.com/image.jpg (optional)"
                  autoCapitalize="none"
                  autoCorrect={false}
                />


                  <View style={styles.row}>
                    <Input
                      label="Qty"
                      value={newItemQty}
                      onChangeText={text =>
                        handleFirstType(
                          text.replace(/\D+/g, ''),
                          newItemQty,
                          newItemQtyTyped,
                          setNewItemQtyTyped,
                          setNewItemQty
                        )
                      }
                      placeholder="1"
                      keyboardType="number-pad"
                      inputMode="numeric"
                      style={{ flex: 0.6 }}
                    />
                    <Input
                      label="Value each"
                      value={newItemValueEach}
                      onChangeText={text =>
                        handleFirstType(
                          text,
                          newItemValueEach,
                          newItemValueEachTyped,
                          setNewItemValueEachTyped,
                          setNewItemValueEach
                        )
                      }
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
            </KeyboardAvoidingView>
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
    borderRadius: layout.radiusMd,
    borderWidth: 1,
    borderColor: colors.border,
    marginRight: layout.spacingSm,
    backgroundColor: colors.background,
    minWidth: 160,
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
  containerChipSubText: {
    fontSize: typography.caption,
    color: colors.textMuted,
    marginTop: 2,
  },
  containerChipSubTextActive: {
    color: colors.heading,
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
  modalCardTall: {
    maxHeight: '85%',
    alignSelf: 'stretch',
    flex: 1,
  },
  modalScroll: {
    flex: 1,
  },
  modalScrollContent: {
    paddingBottom: layout.spacingLg,
    flexGrow: 1,
  },
  actionsColumn: {
    gap: layout.spacingSm,
  },
  inlineRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: layout.spacingSm,
  },
  fillButton: {
    alignSelf: 'flex-end',
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
  aboutWrapper: {
    flex: 1,
    backgroundColor: colors.background,
  },
  aboutHeaderRow: {
    paddingTop: 56,
    paddingHorizontal: layout.spacingLg,
    gap: layout.spacingSm,
    paddingBottom: layout.spacingMd,
  },
  headerButton: {
    flex: 1,
  },
  headerTitle: {
    textAlign: 'center',
    fontSize: typography.title,
    fontWeight: '700',
    color: colors.heading,
  },
  headerActionsRow: {
    flexDirection: 'row',
    gap: layout.spacingSm,
    alignItems: 'center',
  },
  aboutButton: {
    marginTop: layout.spacingSm,
  },
});

