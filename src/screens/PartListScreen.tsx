import React, { useEffect, useMemo, useState } from 'react';
import { Alert, FlatList, Image, Modal, StyleSheet, TouchableOpacity, View } from 'react-native';
import { Input } from '../components/Input';
import { Button } from '../components/Button';
import { getDb } from '../db/database';
import { layout } from '../theme/layout';
import { typography } from '../theme/typography';
import { useTheme, type Theme } from '../theme/ThemeProvider';
import { getThumbnail, normalizeColorId } from '../services/thumbnailStore';
import { ThemedText as Text } from '../components/ThemedText';
import { useAppSettings } from '../settings/settingsStore';
import { getMinifigDisplayId } from '../utils/marketDisplay';
import { importBsxFile, pickBsxFile } from '../services/inventoryImport/importBsxFile';

export type ItemRow = {
  id: number;
  type?: string;
  name: string;
  number?: string | null;
  bricklink_id?: string | null;
  brickowl_id?: string | null;
  rebrickable_id?: string | null;
  color: string | null;
  qty: number | null;
  quantity?: number | null;
  categoryName?: string | null;
  description?: string | null;
  condition?: string | null;
  containerId?: number | null;
  imageUri?: string | null;
};

type PartListScreenProps = {
  onSelectPart?: (item: ItemRow) => void;
  onImportSet?: () => void;
  onCreateMoc?: () => void;
  onAddParts?: () => void;
  onAddMinifig?: () => void;
};

type GroupedRow = {
  key: string;
  representative: ItemRow;
  totalQuantity: number;
  containerIds: Array<number | null>;
};

export default function PartListScreen({
  onSelectPart,
  onImportSet,
  onCreateMoc,
  onAddParts,
  onAddMinifig,
}: PartListScreenProps) {
  const [items, setItems] = useState<ItemRow[]>([]);
  const [searchText, setSearchText] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [categoryPickerVisible, setCategoryPickerVisible] = useState(false);
  const [selectedSubtype, setSelectedSubtype] = useState<
    'All' | 'Part' | 'Minifigure' | 'Set' | 'MOC'
  >('All');
  const [importingBsx, setImportingBsx] = useState(false);
  const [containers, setContainers] = useState<
    { id: number; name: string; roomName?: string | null }[]
  >([]);
  const [thumbnailCache, setThumbnailCache] = useState<Record<string, string>>({});
  const theme = useTheme();
  const { settings } = useAppSettings();
  const marketStandard = settings?.marketStandard ?? 'bricklink';
  const styles = useMemo(() => createStyles(theme), [theme]);
  const buildThumbnailKey = (num?: string | null, color?: string | null) => {
    const trimmedNum = (num ?? '').trim();
    if (!trimmedNum) return '';
    const colorId = normalizeColorId(color);
    return `${trimmedNum}|${colorId}`;
  };

  async function loadItems(): Promise<ItemRow[]> {
    const db = await getDb();
    return db.getAllAsync<ItemRow>(`
      SELECT
        id,
        type,
      name,
      number,
      bricklink_id,
      brickowl_id,
      rebrickable_id,
      color,
      qty,
      qty AS quantity,
      category AS categoryName,
      image_uri AS imageUri,
      description,
      condition,
      container_id AS containerId
    FROM items
    ORDER BY name ASC;
    `);
  }

  useEffect(() => {
    let isMounted = true;
    (async () => {
      try {
        const rows = await loadItems();
        if (isMounted) {
          setItems(rows);
        }
      } catch (error) {
        console.error('Failed to load items', error);
        if (isMounted) {
          setItems([]);
        }
      }
    })();
    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      for (const item of filteredItems) {
        if (cancelled) break;
        const num = (item.number ?? '').trim();
        if (!num) continue;
        const typeKey = (item.type ?? '').toLowerCase();
        if (typeKey === 'set' || typeKey === 'moc') continue;
        const cacheKey = buildThumbnailKey(num, item.color);
        if (!cacheKey) continue;
        if (Object.prototype.hasOwnProperty.call(thumbnailCache, cacheKey)) {
          continue;
        }
        if (item.imageUri && item.imageUri.trim().length > 0) continue;

        try {
          const cached = await getThumbnail(num, item.color);
          if (cancelled) break;
          if (cached !== null) {
            setThumbnailCache(prev => {
              if (Object.prototype.hasOwnProperty.call(prev, cacheKey)) return prev;
              return { ...prev, [cacheKey]: cached };
            });
            continue;
          }
          // No auto-fetch to avoid background API calls; leave placeholder.
        } catch (error) {
          console.warn('[PartList] Thumbnail lookup failed', num, error);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [filteredItems, thumbnailCache]);

  useEffect(() => {
    let isMounted = true;
    (async () => {
      try {
        const db = await getDb();
        const rows = await db.getAllAsync<{
          id: number;
          name: string;
          roomName: string | null;
        }>(
          `
            SELECT
              c.id,
              c.name,
              r.name AS roomName
            FROM containers c
            LEFT JOIN rooms r ON c.room_id = r.id
            ORDER BY c.name ASC;
          `
        );
        if (isMounted) {
          setContainers(rows);
        }
      } catch (e: any) {
        console.error('Failed to load containers', e);
      }
    })();
    return () => {
      isMounted = false;
    };
  }, []);

  const containerLabelMap = useMemo(() => {
    const map = new Map<number, string>();
    containers.forEach(c => {
      const label = c.roomName ? `${c.roomName} - ${c.name}` : c.name;
      map.set(c.id, label);
    });
    return map;
  }, [containers]);

  const subtypeFilters = useMemo(
    () => [
      { label: 'All', value: 'All' as const },
      { label: 'Parts', value: 'Part' as const },
      { label: 'Minifigures', value: 'Minifigure' as const },
      { label: 'Sets', value: 'Set' as const },
      { label: 'MOCs', value: 'MOC' as const },
    ],
    []
  );

  const categoryOptions = useMemo(() => {
    const unique = new Set<string>();
    items.forEach(item => {
      const value = item.categoryName?.trim();
      if (value) {
        unique.add(value);
      }
    });

    const sorted = Array.from(unique).sort();
    return [
      { label: 'All', value: null },
      { label: 'Undefined', value: '__undefined__' },
      ...sorted.map(category => ({ label: category, value: category })),
    ];
  }, [items]);

  const selectedCategoryLabel = useMemo(() => {
    const match = categoryOptions.find(option => option.value === selectedCategory);
    return match?.label ?? 'All';
  }, [categoryOptions, selectedCategory]);



  const filteredItems = useMemo(() => {
    const query = searchText.trim().toLowerCase();
    const subtypeTarget =
      selectedSubtype === 'All'
        ? null
        : selectedSubtype === 'Part'
          ? 'part'
          : selectedSubtype === 'Minifigure'
            ? 'minifig'
            : selectedSubtype === 'Set'
              ? 'set'
              : 'moc';
    return items.filter(item => {
      const itemCategory = item.categoryName?.trim() ?? '';
      const itemSubtype = (item.type ?? '').toLowerCase();
      const matchesSubtype = subtypeTarget ? itemSubtype === subtypeTarget : true;
      const matchesCategory = selectedCategory
        ? selectedCategory === '__undefined__'
          ? itemCategory === ''
          : itemCategory === selectedCategory
        : true;
      const matchesSearch =
        query.length === 0 ||
        (item.name ?? '').toLowerCase().includes(query) ||
        (item.color ?? '').toLowerCase().includes(query) ||
        (item.categoryName ?? '').toLowerCase().includes(query);
      return matchesSubtype && matchesCategory && matchesSearch;
    });
  }, [items, searchText, selectedCategory, selectedSubtype]);

  const groupedItems = useMemo(() => {
    const map = new Map<
      string,
      { representative: ItemRow; totalQuantity: number; containerIds: Set<number | null> }
    >();
    filteredItems.forEach(item => {
      const identityParts = [
        item.type ?? null,
        item.name ?? null,
        item.number ?? null,
        item.color ?? null,
        item.categoryName ?? null,
        item.description ?? null,
        item.condition ?? null,
      ];
      const key = JSON.stringify(identityParts);
      const qtyValue = item.qty ?? item.quantity ?? 0;
      const containerId = item.containerId ?? null;
      const existing = map.get(key);
      if (existing) {
        existing.totalQuantity += qtyValue;
        existing.containerIds.add(containerId);
        const rep = existing.representative;
        // Prefer the item that actually has an image/number/color as the representative
        const shouldSwapRepresentative =
          (!!item.imageUri && !rep.imageUri) || (!!item.number && !rep.number);
        if (shouldSwapRepresentative) {
          existing.representative = item;
        } else {
          if (!rep.imageUri && item.imageUri) rep.imageUri = item.imageUri;
          if (!rep.number && item.number) rep.number = item.number;
          if (!rep.color && item.color) rep.color = item.color;
          if (!rep.categoryName && item.categoryName) {
            rep.categoryName = item.categoryName;
          }
        }
      } else {
        map.set(key, {
          representative: item,
          totalQuantity: qtyValue,
          containerIds: new Set([containerId]),
        });
      }
    });
    return Array.from(map.entries()).map(([key, value]) => ({
      key,
      representative: value.representative,
      totalQuantity: value.totalQuantity,
      containerIds: Array.from(value.containerIds),
    }));
  }, [filteredItems]);

  function renderItem({ item }: { item: GroupedRow }) {
    const representative = item.representative;
    const colorLabel = representative.color ?? 'Unknown color';
    const categoryLabel = representative.categoryName ?? null;
    const subtitleText = categoryLabel
      ? `${colorLabel} - ${categoryLabel}`
      : colorLabel;
    const descriptionText = (representative.description ?? '').trim();
    const directImage = representative.imageUri?.trim();
    const effectiveNumber = (representative.number ?? '').trim();
    const cacheKey = buildThumbnailKey(effectiveNumber, representative.color);
    const cachedThumb = cacheKey ? thumbnailCache[cacheKey] : '';
    const thumbnailUri =
      (directImage && directImage.length > 0 ? directImage : null) ||
      (cachedThumb && cachedThumb.length > 0 ? cachedThumb : null) ||
      null;
    const typeKey = (representative.type ?? '').toLowerCase();
    const isSetOrMoc = typeKey === 'set' || typeKey === 'moc';
    const isMinifig = typeKey === 'minifig';
    const displayNumber =
      isMinifig && effectiveNumber
        ? getMinifigDisplayId(
            {
              rebrickable_id: representative.rebrickable_id ?? effectiveNumber,
              bricklink_id: representative.bricklink_id ?? null,
              brickowl_id: representative.brickowl_id ?? null,
            },
            marketStandard
          )
        : null;
    const placeholderStyle =
      typeKey === 'set'
        ? styles.thumbPlaceholderSet
        : typeKey === 'minifig'
        ? styles.thumbPlaceholderMinifig
        : typeKey === 'moc'
        ? styles.thumbPlaceholderMoc
        : styles.thumbPlaceholderPart;
    const containerCount = item.containerIds.length;
    const onlyContainerId = item.containerIds[0] ?? null;
    const locationLabel =
      containerCount > 1
        ? `In ${containerCount} locations`
        : onlyContainerId == null
          ? 'No container'
          : containerLabelMap.get(onlyContainerId) ?? 'Container';
    const qtyValue = item.totalQuantity;
    const typeBadge = representative.type ? representative.type.toUpperCase() : null;
    return (
      <TouchableOpacity
        style={styles.card}
        onPress={() => {
          if (onSelectPart) {
            onSelectPart(representative);
          } else {
            console.log('Part tapped', representative);
          }
        }}
      >
        <View style={styles.row}>
          <View
            style={[
              styles.thumbWrapper,
              isSetOrMoc && styles.thumbWrapperWide,
            ]}
          >
            {thumbnailUri ? (
              <Image
                source={{ uri: thumbnailUri }}
                style={[
                  styles.thumbImage,
                  isSetOrMoc && styles.thumbImageContain,
                ]}
              />
            ) : (
              <View style={[styles.thumbPlaceholder, placeholderStyle]}>
                <Text style={styles.thumbPlaceholderText}>
                  {(representative.type ?? 'part').slice(0, 1).toUpperCase()}
                </Text>
              </View>
            )}
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.title}>{representative.name}</Text>
            <Text style={styles.subtitle}>{subtitleText}</Text>
            {descriptionText ? (
              <Text style={styles.description}>{descriptionText}</Text>
            ) : null}
            {displayNumber ? (
              <Text style={styles.meta}>Fig ID: {displayNumber}</Text>
            ) : null}
            <Text style={styles.meta}>{locationLabel}</Text>
          </View>
          <View style={styles.qtyBadge}>
            {typeBadge ? <Text style={styles.typeBadge}>{typeBadge}</Text> : null}
            <Text style={styles.qtyText}>{qtyValue}</Text>
          </View>
        </View>
      </TouchableOpacity>
    );
  }

  async function handleImportBsx() {
    try {
      const picked = await pickBsxFile();
      if (!picked) return;
      setImportingBsx(true);
      const db = await getDb();
      const summary = await importBsxFile(db, picked.uri, 'merge');
      const parts = [
        `File: ${summary.fileName ?? 'Unknown'}`,
        `Lots: ${summary.mappedLots}/${summary.totalLots}`,
        `Pieces: ${summary.totalPieces}`,
        summary.unmappedLots > 0
          ? `Unmapped: ${summary.unmappedLots} (kept separate)`
          : 'Unmapped: 0',
        summary.unmappedLots > 0 && summary.mappedLots === 0
          ? 'No lots were imported. Make sure BrickLink part/color IDs exist in crossrefs.'
          : null,
      ].filter((line): line is string => Boolean(line));
      Alert.alert('BSX import finished', parts.join('\n'));
    } catch (error: any) {
      console.error('BSX import failed', error);
      Alert.alert('Import failed', error?.message ?? 'Could not import BSX file.');
    } finally {
      setImportingBsx(false);
    }
  }

  return (
    <View style={styles.container}>
      <FlatList
        data={groupedItems}
        extraData={thumbnailCache}
        keyExtractor={item => item.key}
        renderItem={renderItem}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        contentContainerStyle={styles.listContent}
        ListHeaderComponent={
          <View style={styles.controls}>
            <View style={styles.actionsRow}>
              <Button label="Import Set" onPress={onImportSet} />
              <Button
                label={importingBsx ? 'Importing...' : 'Import BSX'}
                onPress={handleImportBsx}
                disabled={importingBsx}
              />
              <Button label="Create MOC" variant="outline" onPress={onCreateMoc} />
              <Button label="Add Parts" variant="outline" onPress={onAddParts} />
              {selectedSubtype === 'Minifigure' ? (
                <Button
                  label="Add Minifigure"
                  variant="outline"
                  onPress={() => onAddMinifig?.()}
                />
              ) : null}
            </View>
            <View style={styles.tabRow}>
              {subtypeFilters.map(filter => {
                const isActive = filter.value === selectedSubtype;
                return (
                  <TouchableOpacity
                    key={filter.value}
                    style={[styles.tab, isActive && styles.tabActive]}
                    onPress={() => setSelectedSubtype(filter.value)}
                  >
                    <Text style={[styles.tabText, isActive && styles.tabTextActive]}>
                      {filter.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            <Input
              placeholder="Search parts..."
              value={searchText}
              onChangeText={setSearchText}
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="search"
            />
            <TouchableOpacity
              style={styles.selector}
              onPress={() => setCategoryPickerVisible(true)}
            >
              <Text style={styles.selectorLabel}>Category</Text>
              <Text style={styles.selectorValue}>{selectedCategoryLabel}</Text>
            </TouchableOpacity>
            <View style={styles.resultsHeader}>
              <View style={styles.resultsLine} />
              <Text style={styles.resultsLabel}>Results</Text>
              <View style={styles.resultsLine} />
            </View>
          </View>
        }
      />
      <Modal
        visible={categoryPickerVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setCategoryPickerVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <TouchableOpacity
            style={styles.modalBackdrop}
            activeOpacity={1}
            onPress={() => setCategoryPickerVisible(false)}
          />
          <View style={styles.modalCard}>
            {categoryOptions.map(option => {
              const isActive = option.value === selectedCategory;
              return (
                <TouchableOpacity
                  key={`${option.value ?? 'all'}`}
                  style={[styles.optionRow, isActive && styles.optionRowActive]}
                  onPress={() => {
                    setSelectedCategory(option.value);
                    setCategoryPickerVisible(false);
                  }}
                >
                  <Text
                    style={[
                      styles.optionText,
                      isActive && styles.optionTextActive,
                    ]}
                  >
                    {option.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
      </Modal>
    </View>
  );
}

function createStyles(theme: Theme) {
  const { colors } = theme;
  return StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    padding: layout.spacingMd,
  },
  controls: {
    marginBottom: layout.spacingSm,
  },
  actionsRow: {
    flexDirection: 'row',
    gap: layout.spacingSm,
    marginBottom: layout.spacingSm,
  },
  tabRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: layout.spacingSm,
  },
  tab: {
    paddingHorizontal: layout.spacingSm + 4,
    paddingVertical: layout.spacingXs + 2,
    borderRadius: layout.radiusSm,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    marginRight: layout.spacingSm,
    marginBottom: layout.spacingSm,
  },
  tabActive: {
    borderColor: colors.chipActiveBorder,
    backgroundColor: colors.primarySoft,
  },
  tabText: {
    fontSize: typography.chipSmall,
    color: colors.text,
    fontWeight: '600',
  },
  tabTextActive: {
    color: colors.heading,
  },
  selector: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: layout.radiusMd,
    paddingHorizontal: layout.spacingMd,
    paddingVertical: layout.spacingSm,
    backgroundColor: colors.surface,
  },
  selectorLabel: {
    fontSize: typography.caption,
    color: colors.textMuted,
    marginBottom: layout.spacingXs / 2,
  },
  selectorValue: {
    fontSize: typography.body,
    color: colors.text,
    fontWeight: '600',
  },
  resultsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: layout.spacingSm,
    marginBottom: layout.spacingSm,
    gap: layout.spacingSm,
  },
  resultsLine: {
    flex: 1,
    height: 1,
    backgroundColor: colors.border,
  },
  resultsLabel: {
    fontSize: typography.caption,
    color: colors.textMuted,
    fontWeight: '600',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: colors.modalBackdrop,
    justifyContent: 'center',
    alignItems: 'center',
    padding: layout.spacingMd,
  },
  modalBackdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  modalCard: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: colors.surface,
    borderRadius: layout.radiusMd,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: layout.spacingSm,
  },
  optionRow: {
    paddingVertical: layout.spacingSm,
    paddingHorizontal: layout.spacingMd,
  },
  optionRowActive: {
    backgroundColor: colors.primarySoft,
  },
  optionText: {
    fontSize: typography.body,
    color: colors.text,
  },
  optionTextActive: {
    color: colors.heading,
    fontWeight: '700',
  },
  listContent: {
    paddingBottom: layout.spacingXl * 2,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: layout.radiusMd,
    padding: layout.spacingMd,
    borderWidth: 1,
    borderColor: colors.border,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: layout.spacingSm,
  },
  thumbWrapper: {
    width: 56,
    height: 56,
    borderRadius: layout.radiusSm,
    overflow: 'hidden',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
  },
  thumbWrapperWide: {
    width: 96,
    height: undefined,
    aspectRatio: 1.6,
  },
  thumbImage: {
    width: '100%',
    height: '100%',
    resizeMode: 'cover',
  },
  thumbImageContain: {
    resizeMode: 'contain',
  },
  thumbPlaceholder: {
    width: '100%',
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
  },
  thumbPlaceholderText: {
    fontSize: typography.body,
    fontWeight: '700',
    color: colors.text,
  },
  thumbPlaceholderPart: {
    backgroundColor: colors.primarySoft,
  },
  thumbPlaceholderSet: {
    backgroundColor: colors.background,
  },
  thumbPlaceholderMinifig: {
    backgroundColor: colors.border,
  },
  thumbPlaceholderMoc: {
    backgroundColor: colors.background,
    borderStyle: 'dashed',
    borderWidth: 1,
    borderColor: colors.border,
  },
  title: {
    fontSize: typography.body,
    fontWeight: '600',
    color: colors.heading,
  },
  subtitle: {
    marginTop: layout.spacingXs / 2,
    fontSize: typography.caption,
    color: colors.textMuted,
  },
  description: {
    marginTop: layout.spacingXs / 4,
    fontSize: typography.caption,
    color: colors.textSecondary,
  },
  meta: {
    marginTop: layout.spacingXs / 2,
    fontSize: typography.caption,
    color: colors.text,
  },
  typeBadge: {
    fontSize: typography.chipSmall,
    color: colors.primary,
    fontWeight: '700',
    marginBottom: layout.spacingXs / 2,
  },
  qtyBadge: {
    minWidth: 44,
    paddingHorizontal: layout.spacingSm,
    paddingVertical: layout.spacingXs,
    borderRadius: layout.radiusMd,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  qtyText: {
    fontSize: typography.body,
    fontWeight: '700',
    color: colors.text,
  },
  separator: {
    height: layout.spacingSm,
  },
  });
}








