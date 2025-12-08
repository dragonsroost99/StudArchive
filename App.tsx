/**
 * Entry point for the StudArchive mobile app.
 * Initializes the SQLite-backed data model and drives the in-screen navigation flow.
 * Renders the main sections and delegates collection/storage management to dedicated screens.
 */
import React, { useEffect, useState, useMemo } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  Modal,
} from 'react-native';

import { Button } from './src/components/Button';
import { getDb, initDb } from './src/db/database';
import { runMigrations } from './src/db/migrate';
import {
  ensureRoomsTable,
} from './src/db/rooms';
import {
  ensureContainersTable,
} from './src/db/containers';
import {
  ensureItemsTable,
  deleteItem,
} from './src/db/items';
import { ensureBuildPartsTable } from './src/db/buildParts';
import { ensureInventoryImportSchema } from './src/db/inventoryLots';

import { colors as baseColors } from './src/theme/colors';
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
import AddMinifigScreen from './src/screens/AddMinifigScreen';
import BuildComponentDetailScreen from './src/screens/BuildComponentDetailScreen';
import SettingsScreen from './src/screens/SettingsScreen';
import LocationsScreen from './src/screens/LocationsScreen';
import { ThemeProvider, useTheme, type Theme } from './src/theme/ThemeProvider';
import { ThemedText as Text } from './src/components/ThemedText';
import { Alert } from 'react-native';

type ScreenName =
  | 'home'
  | 'about'
  | 'partDetail'
  | 'partList'
  | 'editPart'
  | 'containerDetail'
  | 'importSet'
  | 'createMoc'
  | 'addParts'
  | 'addMinifig'
  | 'locations'
  | 'buildComponentDetail'
  | 'settings';

export default function App() {
  return (
    <ThemeProvider>
      <AppContent />
    </ThemeProvider>
  );
}

function AppContent() {
  const [status, setStatus] = useState<'checking' | 'ok' | 'error'>('checking');
  const [message, setMessage] = useState('Initializing database…');
  const [currentScreen, setCurrentScreen] = useState<ScreenName>('home');
  const [navStack, setNavStack] = useState<ScreenName[]>([]);
  const [partDetailParams, setPartDetailParams] =
    useState<PartDetailParams | null>(null);
  const [editPartParams, setEditPartParams] =
    useState<PartDetailParams | null>(null);
  const [buildComponentDetailParams, setBuildComponentDetailParams] = useState<{
    buildPartId: number;
    parentItemId: number;
  } | null>(null);
  const [containerDetailParams, setContainerDetailParams] = useState<{
    containerId: number;
    containerName?: string;
  } | null>(null);
  const [partDetailRefreshKey, setPartDetailRefreshKey] = useState(0);
  const [lastLocationsRoomId, setLastLocationsRoomId] = useState<number | null>(null);
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);

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

  function goHome() {
    setNavStack([]);
    setCurrentScreen('home');
  }

  // ---------- INIT ----------

  useEffect(() => {
    (async () => {
      try {
        await initDb();
        await runMigrations();
        await ensureRoomsTable();
        await ensureContainersTable();
        await ensureItemsTable();
        await ensureBuildPartsTable();
        await ensureInventoryImportSchema();
        await cleanOrphanBuildParts();

        setStatus('ok');
        setMessage('Database initialized (tables ready)');
      } catch (e: any) {
        console.error(e);
        setStatus('error');
        setMessage('Init error: ' + (e?.message ?? 'unknown'));
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleDeleteItem(id: number) {
    try {
      const db = await getDb();
      await db.execAsync('BEGIN TRANSACTION;');
      await db.runAsync(`DELETE FROM build_parts WHERE parent_item_id = ?;`, [id]);
      await deleteItem(id);
      await db.execAsync('COMMIT;');

      setPartDetailParams(null);
      setEditPartParams(null);
      setPartDetailRefreshKey(key => key + 1);
      setNavStack([]);
      setCurrentScreen('partList');
    } catch (e: any) {
      try {
        await (await getDb()).execAsync('ROLLBACK;');
      } catch {}
      console.error(e);
      setMessage(e?.message ?? 'Failed to delete item');
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
          onNavigateToBuildComponent={({ buildPartId, parentItemId }) => {
            setBuildComponentDetailParams({ buildPartId, parentItemId });
            navigateTo('buildComponentDetail');
          }}
        />
      </View>
    );
  }

  if (currentScreen === 'buildComponentDetail') {
    return (
      <View style={styles.aboutWrapper}>
        <View style={styles.aboutHeaderRow}>
          <Text style={styles.headerTitle}>Component Detail</Text>
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
        <BuildComponentDetailScreen
          params={buildComponentDetailParams ?? undefined}
          onClose={goBack}
          onHome={goHome}
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
          onAddMinifig={() => navigateTo('addMinifig')}
        />
      </View>
    );
  }

  if (currentScreen === 'locations') {
    return (
      <View style={styles.aboutWrapper}>
        <View style={styles.aboutHeaderRow}>
          <Text style={styles.headerTitle}>Storage & Locations</Text>
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
        <LocationsScreen
          onClose={goBack}
          clearStoredSelection={lastLocationsRoomId == null}
          initialRoomId={lastLocationsRoomId}
          onSelectRoom={setLastLocationsRoomId}
          onNavigateToContainer={(containerId, containerName) => {
            setContainerDetailParams({ containerId, containerName });
            navigateTo('containerDetail');
          }}
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

  if (currentScreen === 'addMinifig') {
    return (
      <View style={styles.aboutWrapper}>
        <View style={styles.aboutHeaderRow}>
          <Text style={styles.headerTitle}>Add Minifigure</Text>
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
        <AddMinifigScreen
          onAdded={() => {
            setPartDetailRefreshKey(key => key + 1);
            setCurrentScreen('partList');
          }}
        />
      </View>
    );
  }

  if (currentScreen === 'settings') {
    return (
      <View style={styles.aboutWrapper}>
        <View style={styles.aboutHeaderRow}>
          <Text style={styles.headerTitle}>Settings</Text>
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
        <SettingsScreen />
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
        style={[styles.container, { backgroundColor: theme.colors.background }]}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        {/* Header */}
        <View
          style={[
            styles.headerCard,
            { backgroundColor: theme.colors.surface, borderColor: theme.colors.border },
          ]}
        >
          <Text style={[styles.appTitle, { color: theme.colors.text }]}>StudArchive</Text>
          <Text style={[styles.appSubtitle, { color: theme.colors.textSecondary }]}>
            Keep your bricks in line
          </Text>
          <View style={styles.headerDivider} />
          <Text
            style={[
              styles.status,
              status === 'ok'
                ? styles.statusOk
                : status === 'error'
                ? styles.statusError
                : null,
              { color: theme.colors.text },
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
            label="Storage & Locations"
            variant="outline"
            onPress={() => {
              setLastLocationsRoomId(null);
              navigateTo('locations');
            }}
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
          <Button
            label="Settings"
            variant="outline"
            onPress={() => navigateTo('settings')}
            style={styles.aboutButton}
          />
        </View>

        <View
          style={[
            styles.infoCard,
            { backgroundColor: theme.colors.surface, borderColor: theme.colors.border },
          ]}
        >
          <Text style={styles.sectionTitle}>Storage & Locations</Text>
          <Text style={styles.bodyTextMuted}>
            Manage rooms and containers in one place.
          </Text>
          <Button
            label="Open"
            onPress={() => navigateTo('locations')}
            style={styles.aboutButton}
          />
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
                label="Add Minifigure"
                variant="outline"
                onPress={() => {
                  setAddModalVisible(false);
                  navigateTo('addMinifig');
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

    </>
  );
}

// ---------- STYLES ----------

function createStyles(theme: Theme) {
  const colors = {
    ...baseColors,
    background: theme.colors.background,
    surface: theme.colors.surface,
    border: theme.colors.border,
    text: theme.colors.text,
    textMuted: theme.colors.textMuted,
    textSecondary: theme.colors.textSecondary,
    heading: theme.colors.text,
    danger: theme.colors.danger,
    accent: theme.colors.accent,
    primary: (baseColors as any).primary ?? theme.colors.accent,
    primarySoft:
      (baseColors as any).primarySoft ??
      (baseColors as any).surfaceAlt ??
      theme.colors.surfaceAlt ??
      theme.colors.surface,
    chipActiveBg:
      (baseColors as any).chipActiveBg ??
      theme.colors.surfaceAlt ??
      theme.colors.surface,
    chipActiveBorder: (baseColors as any).chipActiveBorder ?? theme.colors.accent,
    chipActiveText: (baseColors as any).chipActiveText ?? theme.colors.text,
    chipBorder: (baseColors as any).chipBorder ?? theme.colors.border,
    modalBackdrop:
      (baseColors as any).modalBackdrop ??
      (theme.mode === 'dark' ? '#000000CC' : '#00000055'),
  };

  return StyleSheet.create({
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
    color: colors.accent,
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
  infoCard: {
    marginTop: layout.spacingSm,
    marginBottom: layout.spacingLg,
    backgroundColor: colors.surface,
    borderRadius: layout.radiusLg,
    padding: layout.spacingLg,
    borderWidth: 1,
    borderColor: colors.border,
    gap: layout.spacingSm,
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
}




