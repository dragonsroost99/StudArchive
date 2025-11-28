import React, { useEffect, useMemo, useState } from 'react';
import {
  FlatList,
  Modal,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Input } from '../components/Input';
import { getDb } from '../db/database';
import { colors } from '../theme/colors';
import { layout } from '../theme/layout';
import { typography } from '../theme/typography';

export type ItemRow = {
  id: number;
  type?: string;
  name: string;
  color: string | null;
  qty: number | null;
  quantity?: number | null;
  categoryName?: string | null;
  containerId?: number | null;
};

type PartListScreenProps = {
  onSelectPart?: (item: ItemRow) => void;
};

export default function PartListScreen({ onSelectPart }: PartListScreenProps) {
  const [items, setItems] = useState<ItemRow[]>([]);
  const [searchText, setSearchText] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [categoryPickerVisible, setCategoryPickerVisible] = useState(false);
  const [selectedSubtype, setSelectedSubtype] = useState<
    'All' | 'Part' | 'Minifigure' | 'Set' | 'MOC'
  >('All');
  const [containers, setContainers] = useState<
    { id: number; name: string; roomName?: string | null }[]
  >([]);

  async function loadItems(): Promise<ItemRow[]> {
    const db = await getDb();
    return db.getAllAsync<ItemRow>(`
      SELECT
        id,
        type,
        name,
        color,
        qty,
        qty AS quantity,
        category AS categoryName,
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
      const label = c.roomName ? `${c.roomName} · ${c.name}` : c.name;
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

  function renderItem({ item }: { item: ItemRow }) {
    const colorLabel = item.color ?? 'Unknown color';
    const categoryLabel = item.categoryName ?? null;
    const subtitleText = categoryLabel
      ? `${colorLabel} · ${categoryLabel}`
      : colorLabel;
    const locationLabel = item.containerId
      ? containerLabelMap.get(item.containerId) ?? 'Container'
      : 'No container';
    const qtyValue = item.qty ?? item.quantity ?? '???';
    const typeBadge = item.type ? item.type.toUpperCase() : null;
    return (
      <TouchableOpacity
        style={styles.card}
        onPress={() => {
          if (onSelectPart) {
            onSelectPart(item);
          } else {
            console.log('Part tapped', item);
          }
        }}
      >
        <View style={styles.row}>
          <View style={{ flex: 1 }}>
            <Text style={styles.title}>{item.name}</Text>
            <Text style={styles.subtitle}>{subtitleText}</Text>
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

  return (
    <View style={styles.container}>
      <FlatList
        data={filteredItems}
        keyExtractor={item => item.id.toString()}
        renderItem={renderItem}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        contentContainerStyle={styles.listContent}
        ListHeaderComponent={
          <View style={styles.controls}>
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

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    padding: layout.spacingMd,
  },
  controls: {
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
    paddingBottom: layout.spacingLg,
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


