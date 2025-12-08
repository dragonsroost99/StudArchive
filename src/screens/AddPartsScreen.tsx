// Main part search UI (local-first).
import React, { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Pressable,
  TouchableOpacity,
  Image,
  Modal,
  View,
} from 'react-native';
import { Input } from '../components/Input';
import { Button } from '../components/Button';
import { getDb } from '../db/database';
import { searchCatalogWithFallback } from '../db/catalogSearch';
import { layout } from '../theme/layout';
import { typography } from '../theme/typography';
import { Keyboard } from 'react-native';
import { useTheme, type Theme } from '../theme/ThemeProvider';
import { ThemedText as Text } from '../components/ThemedText';
import { ContainerPicker } from '../components/ContainerPicker';
import { useAppSettings } from '../settings/settingsStore';
import { fetchAndCacheThumbnail } from '../services/thumbnailStore';
import {
  fetchPartColorsFromRebrickable,
  type RebrickablePartColor,
} from '../services/inventoryImport/rebrickable';
import { ensureRoomsTable } from '../db/rooms';
import { ensureContainersTable } from '../db/containers';
import { upsertCatalogColorFromRebrickable } from '../db/catalogUpsert';

type AddPartsScreenProps = {
  onAdded?: (itemId: number) => void;
};

export default function AddPartsScreen({ onAdded }: AddPartsScreenProps) {
  const [name, setName] = useState('');
  const [number, setNumber] = useState('');
  const [color, setColor] = useState('');
  const [category, setCategory] = useState('');
  const [description, setDescription] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [selectedContainerId, setSelectedContainerId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<
    Array<{
      partId: number;
      shapeKey: string;
      genericName: string;
      platformId?: string | null;
      imageUri?: string | null;
    }>
  >([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [partColors, setPartColors] = useState<RebrickablePartColor[]>([]);
  const [selectedColorId, setSelectedColorId] = useState<number | null>(null);
  const [colorLoading, setColorLoading] = useState(false);
  const [lastColorLookupPart, setLastColorLookupPart] = useState<string | null>(null);
  const [colorModalVisible, setColorModalVisible] = useState(false);
  const [lastSelectedShapeKey, setLastSelectedShapeKey] = useState<string | null>(null);
  const [imageUri, setImageUri] = useState<string>('');
  const [fallbackContainerId, setFallbackContainerId] = useState<number | null>(null);
  const theme = useTheme();
  const { settings } = useAppSettings();
  const styles = useMemo(() => createStyles(theme), [theme]);

  async function handleSave() {
    const trimmedName = name.trim();
    if (!trimmedName) {
      Alert.alert('Name required', 'Enter a part name to continue.');
      return;
    }
    const containerId =
      selectedContainerId ??
      fallbackContainerId ??
      (await getOrCreateUndefinedContainer());
    setFallbackContainerId(containerId);
    const parsedQty = parseInt(quantity, 10);
    const qtyValue = Number.isNaN(parsedQty) || parsedQty < 1 ? 1 : parsedQty;
    setSaving(true);
    try {
      const db = await getDb();
      let catalogColorId: number | null = null;
      if (selectedColorId) {
        const matchedColor = partColors.find(c => c.colorId === selectedColorId);
        if (matchedColor) {
          try {
            catalogColorId = await upsertCatalogColorFromRebrickable({
              id: matchedColor.colorId,
              name: matchedColor.name,
            });
          } catch (error) {
            console.warn('[AddParts] catalog color upsert failed', matchedColor.colorId, error);
          }
        }
      }
      await db.runAsync(
            `
              INSERT INTO items
                (type, name, number, container_id, qty, condition, color, category, description, value_each, value_total, image_uri, catalog_color_id)
            VALUES
            (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
        `,
        [
          'part',
          trimmedName,
          number.trim() || null,
          containerId,
          qtyValue,
          null,
          color.trim() || null,
          category.trim() || null,
          description.trim() || null,
          null,
          null,
          imageUri.trim() || null,
          catalogColorId,
        ]
      );

      const idRows = await db.getAllAsync<{ id: number }>(
        `SELECT last_insert_rowid() AS id;`
      );
      const newItemId = idRows[0]?.id;
      if (!newItemId) {
        throw new Error('Failed to create part');
      }

      setName('');
      setNumber('');
      setColor('');
      setCategory('');
      setDescription('');
      setQuantity('1');
      if (onAdded) {
        onAdded(newItemId);
      }
    } catch (error) {
      console.error('Add part failed', error);
      Alert.alert('Save failed', 'Could not add this part. Please try again.');
    } finally {
      setSaving(false);
    }
  }

  async function getOrCreateUndefinedContainer(): Promise<number> {
    const db = await getDb();
    await ensureRoomsTable();
    await ensureContainersTable();
    const roomName = 'Undefined';
    const containerName = 'Undefined';
    await db.runAsync(
      `INSERT OR IGNORE INTO rooms (name) VALUES (?);`,
      roomName
    );
    const roomRow = await db.getFirstAsync<{ id: number }>(
      `SELECT id FROM rooms WHERE name = ? LIMIT 1;`,
      roomName
    );
    const roomId = roomRow?.id ?? null;
    await db.runAsync(
      `INSERT OR IGNORE INTO containers (name, room_id) VALUES (?, ?);`,
      containerName,
      roomId
    );
    const containerRow = await db.getFirstAsync<{ id: number }>(
      `SELECT id FROM containers WHERE name = ? AND room_id = ? LIMIT 1;`,
      containerName,
      roomId
    );
    if (!containerRow?.id) {
      throw new Error('Failed to create Undefined container');
    }
    return containerRow.id;
  }

  async function handleSearch() {
    const query = searchQuery.trim();
    if (!query) {
      setSearchResults([]);
      setSearchError(null);
      return;
    }
    setSearchLoading(true);
    setSearchError(null);
    try {
      const preferredSource =
        (settings?.marketStandard ?? 'BRICKLINK').toString().toUpperCase() as
          | 'BRICKLINK'
          | 'REBRICKABLE'
          | 'BRICKOWL';
      const baseResults = await searchCatalogWithFallback(query, preferredSource);
      const resultsWithThumbs = await Promise.all(
        baseResults.map(async r => {
          try {
            const thumb = await fetchAndCacheThumbnail(r.shapeKey, null);
            return { ...r, imageUri: thumb || undefined };
          } catch {
            return { ...r, imageUri: undefined };
          }
        })
      );
      const results = resultsWithThumbs;
      setSearchResults(results);
      setPartColors([]);
      setSelectedColorId(null);
      setLastColorLookupPart(null);
      if (results.length === 0) {
        setSearchError('No parts found locally or on Rebrickable.');
      }
    } catch (error) {
      console.error('Part search failed', error);
      setSearchError('Search failed. Please try again.');
    } finally {
      setSearchLoading(false);
    }
  }

  // Backfill thumbnails for results that don't have one yet
  useEffect(() => {
    let cancelled = false;
    const fillThumbs = async () => {
      const missing = searchResults.filter(r => !r.imageUri);
      if (!missing.length) return;
      const updates: Array<{ shapeKey: string; imageUri: string | null }> = [];
      for (const r of missing) {
        try {
          const thumb = await fetchAndCacheThumbnail(r.shapeKey, null);
          updates.push({ shapeKey: r.shapeKey, imageUri: thumb ?? '' });
        } catch {
          updates.push({ shapeKey: r.shapeKey, imageUri: '' });
        }
      }
      if (cancelled) return;
      setSearchResults(prev =>
        prev.map(item => {
          const found = updates.find(u => u.shapeKey === item.shapeKey);
          if (!found) return item;
          return { ...item, imageUri: found.imageUri ?? '' };
        })
      );
    };
    void fillThumbs();
    return () => {
      cancelled = true;
    };
  }, [searchResults]);

  async function loadPartColors(partNum: string) {
    const trimmed = partNum.trim();
    if (!trimmed) {
      setPartColors([]);
      setSelectedColorId(null);
      setLastColorLookupPart(null);
      return;
    }
    if (trimmed === lastColorLookupPart && partColors.length > 0) {
      return;
    }
    setPartColors([]);
    setSelectedColorId(null);
    setColorLoading(true);
    try {
      const colors = await fetchPartColorsFromRebrickable(trimmed);
      setPartColors(colors);
      setLastColorLookupPart(trimmed);
      if (colors.length === 1) {
        const only = colors[0];
        setSelectedColorId(only.colorId);
        setColor(only.name);
      }
    } catch (error) {
      console.warn('[AddParts] Failed to fetch part colors', { partNum: trimmed }, error);
      setPartColors([]);
      setSelectedColorId(null);
      setLastColorLookupPart(null);
    } finally {
      setColorLoading(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={layout.spacingXl * 3}
    >
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
      >
        <View style={styles.card}>
          <Text style={styles.title}>Part Search</Text>
          <Text style={styles.subtitle}>
            Look up LEGO parts by number or description, then auto-fill the form below.
          </Text>
          <Input
            label="Part number or description"
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholder="e.g. 3001 or brick 2x4"
          />
          <Button
            label={searchLoading ? 'Searching...' : 'Search parts'}
            onPress={handleSearch}
            disabled={searchLoading}
            style={styles.searchButton}
          />
          {searchError ? <Text style={styles.errorText}>{searchError}</Text> : null}
          {searchResults.length > 0 ? (
            <View style={styles.searchResults}>
              {searchResults.map(result => (
                <Pressable
                  key={`${result.partId}-${result.shapeKey}`}
                  style={styles.searchResultRow}
                  onPress={async () => {
                    const resolvedNumber = result.platformId ?? result.shapeKey;
                    setNumber(resolvedNumber);
                    setName(result.genericName);
                    setSearchQuery(resolvedNumber);
                    setSearchResults([]);
                    let thumbUri = result.imageUri?.trim() ?? '';
                    if (!thumbUri) {
                      try {
                        thumbUri = (await fetchAndCacheThumbnail(result.shapeKey, null)) ?? '';
                      } catch {
                        thumbUri = '';
                      }
                    }
                    setImageUri(thumbUri);
                    setLastSelectedShapeKey(result.shapeKey);
                    Keyboard.dismiss();
                    await loadPartColors(result.shapeKey);
                  }}
                >
              {result.imageUri?.trim() ? (
                <Image source={{ uri: result.imageUri.trim() }} style={styles.searchResultImage} />
              ) : (
                <View style={styles.searchResultPlaceholder}>
                  <Text style={styles.searchResultPlaceholderText}>No image</Text>
                </View>
              )}
                  <View style={{ flex: 1 }}>
                    <Text style={styles.searchResultTitle}>{result.genericName}</Text>
                    {result.platformId ? (
                      <Text style={styles.searchResultSubtitle}>#{result.platformId}</Text>
                    ) : (
                      <Text style={styles.searchResultSubtitle}>Shape: {result.shapeKey}</Text>
                    )}
                  </View>
                </Pressable>
              ))}
            </View>
          ) : null}
        </View>

        <View style={styles.card}>
          <Text style={styles.title}>Add Parts</Text>
          <Text style={styles.subtitle}>
            Add individual parts to your inventory. Choose a container or leave unassigned.
          </Text>

          <Input
            label="Part name"
            value={name}
            onChangeText={setName}
            placeholder="1x2 Plate"
          />
          <Input
            label="Part number (optional)"
            value={number}
            onChangeText={setNumber}
            placeholder="e.g. 3023"
          />
          <Input
            label="Color"
            value={color}
            onChangeText={setColor}
           onFocus={async () => {
             const key = lastSelectedShapeKey ?? number;
             if (!partColors.length && key.trim()) {
               await loadPartColors(key);
             }
             setColorModalVisible(true);
           }}
            placeholder="Dark Bluish Gray, etc."
          />
          <Button
            label={colorLoading ? 'Loading colors...' : 'Choose color'}
            variant="outline"
            disabled={colorLoading || (!lastSelectedShapeKey && !number.trim())}
            onPress={async () => {
              const key = lastSelectedShapeKey ?? number;
              if (key.trim()) {
                await loadPartColors(key);
              }
              setColorModalVisible(true);
            }}
          />
          <Input
            label="Category (optional)"
            value={category}
            onChangeText={setCategory}
            placeholder="Plates"
          />
          <Input
            label="Quantity"
            value={quantity}
            onChangeText={text => setQuantity(text.replace(/\D+/g, ''))}
            keyboardType="number-pad"
            inputMode="numeric"
            placeholder="1"
          />

          <ContainerPicker
            label="Container"
            selectedContainerId={selectedContainerId}
            onChange={setSelectedContainerId}
            allowCreateNew
          />

          <Button
            label={saving ? 'Saving...' : 'Add Part'}
            onPress={handleSave}
            disabled={saving}
          />
          <View style={{ height: layout.spacingXl }} />
        </View>
      </ScrollView>

      <Modal
        visible={colorModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setColorModalVisible(false)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setColorModalVisible(false)}
        >
          <View style={styles.modalCard}>
            <Text style={styles.sectionTitle}>Select Color</Text>
            {colorLoading ? (
              <Text style={styles.metaMuted}>Loading colors…</Text>
            ) : null}
            {partColors.length === 0 && !colorLoading ? (
              <Text style={styles.metaMuted}>No colors yet. Try searching or enter manually.</Text>
            ) : null}
            {partColors.map(option => {
              const isActive = option.colorId === selectedColorId;
              return (
                <TouchableOpacity
                  key={option.colorId}
                  style={[styles.optionRow, isActive && styles.optionRowActive]}
                  onPress={async () => {
                    setSelectedColorId(option.colorId);
                    setColor(option.name);
                    try {
                      const thumb = await fetchAndCacheThumbnail(
                        lastSelectedShapeKey ?? number,
                        option.colorId
                      );
                      setImageUri(thumb ?? '');
                    } catch {
                      // ignore thumbnail errors
                    }
                    setColorModalVisible(false);
                  }}
                >
                  <Text style={[styles.optionText, isActive && styles.optionTextActive]}>
                    {option.name}
                  </Text>
                </TouchableOpacity>
              );
            })}
            <Button label="Close" variant="outline" onPress={() => setColorModalVisible(false)} />
          </View>
        </TouchableOpacity>
      </Modal>
    </KeyboardAvoidingView>
  );
}

function createStyles(theme: Theme) {
  const { colors } = theme;
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    modalOverlay: {
      flex: 1,
      backgroundColor: '#00000066',
      justifyContent: 'center',
      padding: layout.spacingLg,
    },
    modalCard: {
      backgroundColor: colors.surface,
      borderRadius: layout.radiusLg,
      padding: layout.spacingLg,
      borderWidth: 1,
      borderColor: colors.border,
      gap: layout.spacingSm,
    },
    content: {
      padding: layout.spacingLg,
      paddingBottom: layout.spacingXl * 2,
      flexGrow: 1,
    },
    card: {
      backgroundColor: colors.surface,
      borderRadius: layout.radiusLg,
      padding: layout.spacingLg,
      borderWidth: 1,
      borderColor: colors.border,
      gap: layout.spacingSm,
    },
    title: {
      fontSize: typography.title,
      fontWeight: '700',
      color: colors.text,
    },
    subtitle: {
      fontSize: typography.body,
      color: colors.textSecondary,
      lineHeight: typography.body + 4,
    },
    sectionTitle: {
      fontSize: typography.sectionTitle,
      fontWeight: '700',
      color: colors.text,
    },
    searchButton: {
      marginTop: layout.spacingSm,
    },
    searchResults: {
      marginTop: layout.spacingSm,
      gap: layout.spacingSm,
    },
    searchResultRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: layout.spacingSm,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: layout.radiusMd,
      padding: layout.spacingSm,
      backgroundColor: colors.surfaceAlt ?? colors.surface,
    },
    searchResultImage: {
      width: 48,
      height: 48,
      borderRadius: layout.radiusSm,
      backgroundColor: colors.background,
    },
    searchResultPlaceholder: {
      width: 48,
      height: 48,
      borderRadius: layout.radiusSm,
      backgroundColor: colors.background,
      alignItems: 'center',
      justifyContent: 'center',
    },
    searchResultPlaceholderText: {
      fontSize: typography.caption,
      color: colors.textSecondary,
    },
    searchResultTitle: {
      fontSize: typography.body,
      color: colors.text,
      fontWeight: '600',
    },
    searchResultSubtitle: {
      fontSize: typography.caption,
      color: colors.textSecondary,
    },
    inlineRow: {
      marginTop: layout.spacingSm,
      gap: layout.spacingSm,
    },
    metaMuted: {
      fontSize: typography.caption,
      color: colors.textSecondary,
      marginTop: layout.spacingXs,
    },
    selector: {
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: layout.radiusMd,
      paddingHorizontal: layout.spacingMd,
      paddingVertical: layout.spacingSm,
      backgroundColor: colors.surface,
      gap: layout.spacingSm,
    },
    selectorLabel: {
      fontSize: typography.caption,
      color: colors.textSecondary,
    },
    optionList: {
      gap: layout.spacingXs,
    },
    optionRow: {
      paddingVertical: layout.spacingSm,
      paddingHorizontal: layout.spacingSm,
      borderRadius: layout.radiusSm,
    },
    optionRowActive: {
      backgroundColor: colors.surfaceAlt ?? colors.surface,
    },
    optionText: {
      fontSize: typography.body,
      color: colors.text,
    },
    optionTextActive: {
      color: colors.text,
      fontWeight: '700',
    },
  });
}




