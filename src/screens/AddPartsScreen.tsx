import React, { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  Image,
  Pressable,
  TouchableOpacity,
  View,
} from 'react-native';
import { Input } from '../components/Input';
import { Button } from '../components/Button';
import { getDb } from '../db/database';
import { layout } from '../theme/layout';
import { typography } from '../theme/typography';
import {
  searchPartsOnRebrickable,
  type RebrickablePartSearchResult,
  fetchPartColorsFromRebrickable,
  type RebrickablePartColor,
} from '../services/inventoryImport/rebrickable';
import { Keyboard } from 'react-native';
import { useTheme, type Theme } from '../theme/ThemeProvider';

type AddPartsScreenProps = {
  onAdded?: (itemId: number) => void;
};

type ContainerRow = { id: number; name: string; roomName?: string | null };

export default function AddPartsScreen({ onAdded }: AddPartsScreenProps) {
  const [name, setName] = useState('');
  const [number, setNumber] = useState('');
  const [color, setColor] = useState('');
  const [category, setCategory] = useState('');
  const [description, setDescription] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [containers, setContainers] = useState<ContainerRow[]>([]);
  const [selectedContainerId, setSelectedContainerId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<RebrickablePartSearchResult[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [partColors, setPartColors] = useState<RebrickablePartColor[]>([]);
  const [selectedColorId, setSelectedColorId] = useState<number | null>(null);
  const [colorLoading, setColorLoading] = useState(false);
  const [lastColorLookupPart, setLastColorLookupPart] = useState<string | null>(null);
  const [imageUri, setImageUri] = useState<string>('');
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);

  useEffect(() => {
    let isMounted = true;
    (async () => {
      try {
        const db = await getDb();
        const rows = await db.getAllAsync<ContainerRow>(
          `
            SELECT c.id, c.name, r.name AS roomName
            FROM containers c
            LEFT JOIN rooms r ON r.id = c.room_id
            ORDER BY r.name ASC, c.name ASC;
          `
        );
        if (isMounted) {
          setContainers(rows);
        }
      } catch (error) {
        console.error('Failed to load containers', error);
      }
    })();
    return () => {
      isMounted = false;
    };
  }, []);

  const containerOptions = useMemo(() => {
    return [
      { id: -1, name: 'No container', roomName: null },
      ...containers,
    ];
  }, [containers]);

  async function handleSave() {
    const trimmedName = name.trim();
    if (!trimmedName) {
      Alert.alert('Name required', 'Enter a part name to continue.');
      return;
    }
    const parsedQty = parseInt(quantity, 10);
    const qtyValue = Number.isNaN(parsedQty) || parsedQty < 1 ? 1 : parsedQty;
    async function resolveContainerId(): Promise<number> {
      if (selectedContainerId != null && selectedContainerId !== -1) {
        return selectedContainerId;
      }
      const db = await getDb();
      // Ensure a default "Unassigned" room exists
      const roomRows = await db.getAllAsync<{ id: number }>(
        `SELECT id FROM rooms WHERE name = ? LIMIT 1;`,
        ['Unassigned']
      );
      let roomId = roomRows[0]?.id ?? null;
      if (!roomId) {
        await db.runAsync(`INSERT INTO rooms (name) VALUES (?);`, ['Unassigned']);
        const newRoom = await db.getAllAsync<{ id: number }>(
          `SELECT id FROM rooms WHERE name = ? ORDER BY id DESC LIMIT 1;`,
          ['Unassigned']
        );
        roomId = newRoom[0]?.id ?? null;
      }
      if (!roomId) {
        throw new Error('Unable to create default room for unassigned parts.');
      }
      const containerRows = await db.getAllAsync<{ id: number }>(
        `SELECT id FROM containers WHERE name = ? AND room_id = ? LIMIT 1;`,
        ['No container', roomId]
      );
      let containerId = containerRows[0]?.id ?? null;
      if (!containerId) {
        await db.runAsync(
          `INSERT INTO containers (name, room_id) VALUES (?, ?);`,
          ['No container', roomId]
        );
        const newContainer = await db.getAllAsync<{ id: number }>(
          `SELECT id FROM containers WHERE name = ? AND room_id = ? ORDER BY id DESC LIMIT 1;`,
          ['No container', roomId]
        );
        containerId = newContainer[0]?.id ?? null;
      }
      if (!containerId) {
        throw new Error('Unable to create default container for unassigned parts.');
      }
      return containerId;
    }
    setSaving(true);
    try {
      const db = await getDb();
      const resolvedContainerId = await resolveContainerId();
      await db.runAsync(
        `
          INSERT INTO items
            (type, name, number, container_id, qty, condition, color, category, description, value_each, value_total, image_uri)
          VALUES
            (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
        `,
        [
          'part',
          trimmedName,
          number.trim() || null,
          resolvedContainerId,
          qtyValue,
          null,
          color.trim() || null,
          category.trim() || null,
          description.trim() || null,
          null,
          null,
          imageUri.trim() || null,
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

  async function handleSearch() {
    const query = searchQuery.trim();
    if (!query) return;
    setSearchLoading(true);
    setSearchError(null);
    try {
      const results = await searchPartsOnRebrickable(query);
      setSearchResults(results);
      if (results.length === 0) {
        setSearchError('No parts found. Check the number or try a different description.');
      }
    } catch (error) {
      console.error('Part search failed', error);
      setSearchError("The Archivists couldn't reach Rebrickable. Please try again.");
    } finally {
      setSearchLoading(false);
    }
  }

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
    // Clear existing choices while loading new ones
    setPartColors([]);
    setSelectedColorId(null);
    setColorLoading(true);
    try {
      console.log('[AddParts] Fetching colors for partNum', trimmed);
      const colors = await fetchPartColorsFromRebrickable(trimmed);
      setPartColors(colors);
      setLastColorLookupPart(trimmed);
      if (colors.length === 1) {
        const only = colors[0];
        setSelectedColorId(only.colorId);
        setColor(only.name);
      }
    } catch (error) {
      console.warn('Failed to fetch part colors', error);
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
            label={searchLoading ? 'Searching...' : 'Search Rebrickable'}
            onPress={handleSearch}
            disabled={searchLoading}
            style={styles.searchButton}
          />
          {searchError ? <Text style={styles.errorText}>{searchError}</Text> : null}
          {searchResults.length > 0 ? (
            <View style={styles.searchResults}>
              {searchResults.map(result => (
                <Pressable
                  key={`${result.partNum}-${result.name}`}
                  style={styles.searchResultRow}
                  onPress={async () => {
                    setNumber(result.partNum);
                    setName(result.name);
                    setSearchQuery(result.partNum);
                    setSearchResults([]);
                    setImageUri(result.imageUrl ?? '');
                    Keyboard.dismiss();
                    console.log('[AddParts] Selected part for colors', {
                      partNum: result.partNum,
                      name: result.name,
                    });
                    await loadPartColors(result.partNum);
                  }}
                >
                  {result.imageUrl ? (
                    <Image source={{ uri: result.imageUrl }} style={styles.searchResultImage} />
                  ) : (
                    <View style={styles.searchResultPlaceholder}>
                      <Text style={styles.searchResultPlaceholderText}>No image</Text>
                    </View>
                  )}
                  <View style={{ flex: 1 }}>
                    <Text style={styles.searchResultTitle}>{result.name}</Text>
                    <Text style={styles.searchResultSubtitle}>#{result.partNum}</Text>
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
          {partColors.length > 0 ? (
            <View style={styles.selector}>
              <Text style={styles.selectorLabel}>Colors from Rebrickable</Text>
              {colorLoading ? (
                <Text style={styles.metaMuted}>Loading colors…</Text>
              ) : null}
              <View style={styles.optionList}>
                {partColors.map(option => {
                  const isActive = option.colorId === selectedColorId;
                  return (
                    <TouchableOpacity
                      key={option.colorId}
                      style={[styles.optionRow, isActive && styles.optionRowActive]}
                      onPress={() => {
                        setSelectedColorId(option.colorId);
                        setColor(option.name);
                        if (option.imageUrl) {
                          setImageUri(option.imageUrl);
                        }
                        setPartColors([]);
                      }}
                    >
                      <Text
                        style={[styles.optionText, isActive && styles.optionTextActive]}
                      >
                        {option.name}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          ) : null}
          <Input
            label="Color"
            value={color}
            onChangeText={setColor}
            placeholder="Dark Bluish Gray, etc."
          />
          {lastColorLookupPart &&
          !colorLoading &&
          partColors.length === 0 &&
          selectedColorId === null ? (
            <>
              <Text style={styles.metaMuted}>
                No Rebrickable colors returned. Enter a color manually.
              </Text>
              <Text style={styles.metaMuted}>
                Check logs for [Rebrickable]/[AddParts] messages if this seems wrong.
              </Text>
            </>
          ) : null}
          {colorLoading ? (
            <Text style={styles.metaMuted}>Loading colors…</Text>
          ) : null}
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

          <View style={styles.selector}>
            <Text style={styles.selectorLabel}>Container</Text>
            <View style={styles.optionList}>
              {containerOptions.map(option => {
                const isActive =
                  option.id === selectedContainerId ||
                  (option.id === -1 && selectedContainerId === null);
                return (
                  <TouchableOpacity
                    key={option.id}
                    style={[styles.optionRow, isActive && styles.optionRowActive]}
                    onPress={() =>
                      setSelectedContainerId(option.id === -1 ? null : option.id)
                    }
                  >
                    <Text
                      style={[styles.optionText, isActive && styles.optionTextActive]}
                    >
                      {option.roomName ? `${option.roomName} - ${option.name}` : option.name}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>

          <Button
            label={saving ? 'Saving...' : 'Add Part'}
            onPress={handleSave}
            disabled={saving}
          />
          <View style={{ height: layout.spacingXl }} />
        </View>
      </ScrollView>
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


