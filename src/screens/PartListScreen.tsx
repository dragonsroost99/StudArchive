import React, { useEffect, useState } from 'react';
import {
  FlatList,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { getDb } from '../db/database';
import { colors } from '../theme/colors';
import { layout } from '../theme/layout';
import { typography } from '../theme/typography';

export type ItemRow = {
  id: number;
  name: string;
  color: string | null;
  qty: number | null;
  quantity?: number | null;
  categoryName?: string | null;
};

type PartListScreenProps = {
  onSelectPart?: (item: ItemRow) => void;
};

export default function PartListScreen({ onSelectPart }: PartListScreenProps) {
  const [items, setItems] = useState<ItemRow[]>([]);

  async function loadItems(): Promise<ItemRow[]> {
    const db = await getDb();
    return db.getAllAsync<ItemRow>(`
      SELECT
        id,
        name,
        color,
        qty,
        qty AS quantity,
        category AS categoryName
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

  function renderItem({ item }: { item: ItemRow }) {
    const colorLabel = item.color ?? 'Unknown color';
    const categoryLabel = item.categoryName ?? null;
    const subtitleText = categoryLabel
      ? `${colorLabel} • ${categoryLabel}`
      : colorLabel;
    const qtyValue = item.qty ?? item.quantity ?? '???';
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
            </View>
            <View style={styles.qtyBadge}>
              <Text style={styles.qtyText}>{qtyValue}</Text>
            </View>
          </View>
      </TouchableOpacity>
    );
  }

  return (
    <View style={styles.container}>
      <FlatList
        data={items}
        keyExtractor={item => item.id.toString()}
        renderItem={renderItem}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        contentContainerStyle={styles.listContent}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    padding: layout.spacingMd,
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
