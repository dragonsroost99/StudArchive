import React, { useEffect, useMemo, useState } from 'react';
import {
  FlatList,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Button } from '../components/Button';
import { Input } from '../components/Input';
import { getDb } from '../db/database';
import { layout } from '../theme/layout';
import { typography } from '../theme/typography';
import { useTheme, type Theme } from '../theme/ThemeProvider';

type ContainerDetailParams = {
  containerId: number;
  containerName?: string;
};

type ContainerDetailScreenProps = {
  route?: { params?: ContainerDetailParams };
  params?: ContainerDetailParams;
  onSelectItem?: (item: ItemRow) => void;
  onTitleChange?: (title: string) => void;
};

type ItemRow = {
  id: number;
  name: string;
  number?: string | null;
  color: string | null;
  qty: number | null;
  quantity?: number | null;
  categoryName?: string | null;
  type?: string | null;
  description?: string | null;
  condition?: string | null;
};

export default function ContainerDetailScreen({
  route,
  params,
  onSelectItem,
  onTitleChange,
}: ContainerDetailScreenProps) {
  const resolvedParams = route?.params ?? params;
  const containerId = resolvedParams?.containerId;
  const containerName = resolvedParams?.containerName;

  const [items, setItems] = useState<ItemRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [containers, setContainers] = useState<
    { id: number; name: string }[]
  >([]);
  const [moveModalVisible, setMoveModalVisible] = useState(false);
  const [movingItem, setMovingItem] = useState<ItemRow | null>(null);
  const [destinationContainerId, setDestinationContainerId] = useState<
    number | null
  >(null);
  const [moveQty, setMoveQty] = useState('');
  const [moveError, setMoveError] = useState<string | null>(null);
  const [savingMove, setSavingMove] = useState(false);
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);

  useEffect(() => {
    if (!containerId) {
      setError('Missing container id');
      setLoading(false);
      return;
    }
    let isMounted = true;
    (async () => {
      try {
        const db = await getDb();
        const rows = await db.getAllAsync<ItemRow>(
          `
            SELECT
              id,
              name,
              number,
              color,
              qty,
              qty AS quantity,
              category AS categoryName,
              type,
              description,
              condition
            FROM items
            WHERE container_id = ?
            ORDER BY name ASC;
          `,
          [containerId]
        );
        if (isMounted) {
          setItems(rows);
          setError(null);
        }
      } catch (e: any) {
        console.error('Failed to load container items', e);
        if (isMounted) {
          setError(e?.message ?? 'Failed to load items');
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    })();
    return () => {
      isMounted = false;
    };
  }, [containerId]);

  useEffect(() => {
    let isMounted = true;
    (async () => {
      try {
        const db = await getDb();
        const rows = await db.getAllAsync<{ id: number; name: string }>(
          `
            SELECT id, name
            FROM containers
            ORDER BY name ASC;
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

  const containerLabel = useMemo(() => {
    if (destinationContainerId == null) return 'No container';
    const match = containers.find(c => c.id === destinationContainerId);
    return match ? match.name : 'No container';
  }, [containers, destinationContainerId]);

  const headerTitle = useMemo(() => {
    if (!containerName) return 'Container Items';
    return containerName;
  }, [containerName]);

  useEffect(() => {
    const title = headerTitle || 'Container';
    onTitleChange?.(title);
  }, [headerTitle, onTitleChange]);

  function openMoveModal(item: ItemRow) {
    const defaultQty = item.qty ?? item.quantity ?? 1;
    setMovingItem(item);
    setDestinationContainerId(containerId ?? null);
    setMoveQty(String(defaultQty));
    setMoveError(null);
    setMoveModalVisible(true);
  }

  async function refreshItems() {
    if (!containerId) return;
    try {
      setLoading(true);
      const db = await getDb();
      const rows = await db.getAllAsync<ItemRow>(
        `
          SELECT
            id,
            name,
            number,
            color,
            qty,
            qty AS quantity,
            category AS categoryName,
            type,
            description,
            condition
          FROM items
          WHERE container_id = ?
          ORDER BY name ASC;
        `,
        [containerId]
      );
      setItems(rows);
      setError(null);
    } catch (e: any) {
      console.error('Failed to refresh items', e);
      setError(e?.message ?? 'Failed to load items');
    } finally {
      setLoading(false);
    }
  }

  async function handleSubmitMove() {
    if (!movingItem) return;
    const currentQty = movingItem.qty ?? movingItem.quantity ?? 0;
    const parsedQty = parseInt(moveQty, 10);
    if (Number.isNaN(parsedQty) || parsedQty < 1 || parsedQty > currentQty) {
      setMoveError(`Enter a quantity between 1 and ${currentQty}`);
      return;
    }
    const moveAmount = parsedQty;
    setSavingMove(true);
    setMoveError(null);
    try {
      const db = await getDb();
      await db.execAsync('BEGIN TRANSACTION;');
      if (moveAmount === currentQty) {
        await db.runAsync(
          `UPDATE items SET container_id = ? WHERE id = ?;`,
          [destinationContainerId, movingItem.id]
        );
      } else {
        const remaining = currentQty - moveAmount;
        await db.runAsync(
          `UPDATE items SET qty = ? WHERE id = ?;`,
          [remaining, movingItem.id]
        );

        const destClause =
          destinationContainerId == null
            ? 'container_id IS NULL'
            : 'container_id = ?';

        const matchSql = `
          SELECT id, qty
          FROM items
          WHERE ${destClause}
            AND type = ?
            AND name = ?
            AND ((number IS NULL AND ? IS NULL) OR number = ?)
            AND ((color IS NULL AND ? IS NULL) OR color = ?)
            AND ((category IS NULL AND ? IS NULL) OR category = ?)
            AND ((description IS NULL AND ? IS NULL) OR description = ?)
            AND ((condition IS NULL AND ? IS NULL) OR condition = ?)
          LIMIT 1;
        `;
        const params: any[] =
          destinationContainerId == null
            ? []
            : [destinationContainerId];
        params.push(
          movingItem.type ?? null,
          movingItem.name ?? null,
          movingItem.number ?? null,
          movingItem.number ?? null,
          movingItem.color ?? null,
          movingItem.color ?? null,
          movingItem.categoryName ?? null,
          movingItem.categoryName ?? null,
          movingItem.description ?? null,
          movingItem.description ?? null,
          movingItem.condition ?? null,
          movingItem.condition ?? null
        );

        const existing = await db.getAllAsync<{ id: number; qty: number }>(
          matchSql,
          params
        );
        const match = existing[0];

        if (match) {
          await db.runAsync(
            `UPDATE items SET qty = ? WHERE id = ?;`,
            [ (match.qty ?? 0) + moveAmount, match.id ]
          );
        } else {
          const valueEach = null;
          const valueTotal = null;
          await db.runAsync(
            `
              INSERT INTO items
                (type, name, number, container_id, qty, condition, color, category, description, value_each, value_total)
              VALUES
                (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
            `,
            [
              movingItem.type ?? 'part',
              movingItem.name ?? '',
              movingItem.number ?? null,
              destinationContainerId,
              moveAmount,
              movingItem.condition ?? null,
              movingItem.color ?? null,
              movingItem.categoryName ?? null,
              movingItem.description ?? null,
              valueEach,
              valueTotal,
            ]
          );
        }
      }
      await db.execAsync('COMMIT;');
      setMoveModalVisible(false);
      setMovingItem(null);
      await refreshItems();
    } catch (e: any) {
      console.error('Failed to move item', e);
      setMoveError(e?.message ?? 'Failed to move item');
      await (await getDb()).execAsync('ROLLBACK;');
    } finally {
      setSavingMove(false);
    }
  }

  function renderItem({ item }: { item: ItemRow }) {
    const colorLabel = item.color ?? 'Unknown color';
    const categoryLabel = item.categoryName ?? null;
    const subtitleText = categoryLabel
      ? `${colorLabel} • ${categoryLabel}`
      : colorLabel;
    const qtyValue = item.qty ?? item.quantity ?? '???';
    const typeBadge = item.type ? item.type.toUpperCase() : null;
    return (
      <View style={styles.card}>
        <TouchableOpacity
          style={{ flex: 1 }}
          onPress={() => onSelectItem?.(item)}
        >
          <View style={styles.row}>
            <View style={{ flex: 1 }}>
              <Text style={styles.title}>{item.name}</Text>
              <Text style={styles.subtitle}>{subtitleText}</Text>
            </View>
            <View style={styles.qtyBadge}>
              {typeBadge ? <Text style={styles.typeBadge}>{typeBadge}</Text> : null}
              <Text style={styles.qtyText}>{qtyValue}</Text>
            </View>
          </View>
        </TouchableOpacity>
        <View style={styles.cardActions}>
          <Button
            label="Move"
            variant="outline"
            onPress={() => openMoveModal(item)}
            style={styles.moveButton}
          />
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.screenTitle}>{headerTitle}</Text>
      {loading ? (
        <Text style={styles.bodyText}>Loading items…</Text>
      ) : error ? (
        <Text style={styles.errorText}>{error}</Text>
      ) : items.length === 0 ? (
        <Text style={styles.bodyTextMuted}>No items in this container yet.</Text>
      ) : (
        <FlatList
          data={items}
          keyExtractor={item => item.id.toString()}
          renderItem={renderItem}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
          contentContainerStyle={styles.listContent}
        />
      )}
      <Modal
        visible={moveModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setMoveModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <TouchableOpacity
            style={styles.modalBackdrop}
            activeOpacity={1}
            onPress={() => setMoveModalVisible(false)}
          />
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Move item</Text>
            <View style={styles.selector}>
              <Text style={styles.selectorLabel}>Destination container</Text>
              <TouchableOpacity
                style={styles.selectorValueRow}
                onPress={() => {}}
              >
                <Text style={styles.selectorValue}>{containerLabel}</Text>
              </TouchableOpacity>
            </View>
            <ScrollView
              style={styles.containerList}
              contentContainerStyle={styles.containerListContent}
            >
              <TouchableOpacity
                style={[
                  styles.optionRow,
                  destinationContainerId == null && styles.optionRowActive,
                ]}
                onPress={() => setDestinationContainerId(null)}
              >
                <Text
                  style={[
                    styles.optionText,
                    destinationContainerId == null && styles.optionTextActive,
                  ]}
                >
                  No container
                </Text>
              </TouchableOpacity>
              {containers.map(option => {
                const isActive = option.id === destinationContainerId;
                return (
                  <TouchableOpacity
                    key={option.id}
                    style={[styles.optionRow, isActive && styles.optionRowActive]}
                    onPress={() => setDestinationContainerId(option.id)}
                  >
                    <Text
                      style={[
                        styles.optionText,
                        isActive && styles.optionTextActive,
                      ]}
                    >
                      {option.name}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
            <Input
              label="How many do you want to move?"
              value={moveQty}
              onChangeText={text => setMoveQty(text.replace(/\D+/g, ''))}
              keyboardType="number-pad"
              inputMode="numeric"
              placeholder="Quantity"
            />
            {moveError ? <Text style={styles.errorText}>{moveError}</Text> : null}
            <View style={styles.modalButtonRow}>
              <Button
                label="Cancel"
                variant="outline"
                onPress={() => setMoveModalVisible(false)}
                disabled={savingMove}
              />
              <Button
                label={savingMove ? 'Moving...' : 'Move'}
                onPress={handleSubmitMove}
                disabled={savingMove}
              />
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

function createStyles(theme: Theme) {
  const { colors } = theme;
  const overlayColor = theme.mode === 'dark' ? '#000000CC' : '#00000055';
  const softSurface = colors.surfaceAlt ?? colors.surface;
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
      padding: layout.spacingLg,
    },
    screenTitle: {
      fontSize: typography.sectionTitle,
      fontWeight: '700',
      color: colors.text,
      marginBottom: layout.spacingSm,
    },
    bodyText: {
      fontSize: typography.body,
      color: colors.text,
    },
    bodyTextMuted: {
      fontSize: typography.body,
      color: colors.textSecondary,
    },
    errorText: {
      fontSize: typography.body,
      color: colors.danger,
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
    title: {
      fontSize: typography.body,
      fontWeight: '600',
      color: colors.text,
    },
    subtitle: {
      marginTop: layout.spacingXs / 2,
      fontSize: typography.caption,
      color: colors.textSecondary,
    },
    qtyBadge: {
      minWidth: 56,
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
    typeBadge: {
      fontSize: typography.chipSmall,
      fontWeight: '700',
      color: colors.accent,
      marginBottom: layout.spacingXs / 2,
    },
    cardActions: {
      marginTop: layout.spacingSm,
      flexDirection: 'row',
      justifyContent: 'flex-end',
    },
    moveButton: {
      minWidth: 100,
    },
    separator: {
      height: layout.spacingSm,
    },
    modalOverlay: {
      flex: 1,
      backgroundColor: overlayColor,
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
      padding: layout.spacingLg,
    },
    modalTitle: {
      fontSize: typography.sectionTitle,
      fontWeight: '700',
      color: colors.text,
      marginBottom: layout.spacingSm,
    },
    selector: {
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: layout.radiusMd,
      paddingHorizontal: layout.spacingMd,
      paddingVertical: layout.spacingSm,
      backgroundColor: colors.surface,
      marginBottom: layout.spacingSm,
    },
    selectorLabel: {
      fontSize: typography.caption,
      color: colors.textSecondary,
      marginBottom: layout.spacingXs / 2,
    },
    selectorValueRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    selectorValue: {
      fontSize: typography.body,
      color: colors.text,
      fontWeight: '600',
    },
    containerList: {
      maxHeight: 200,
      marginBottom: layout.spacingSm,
    },
    containerListContent: {
      paddingBottom: layout.spacingSm,
    },
    optionRow: {
      paddingVertical: layout.spacingSm,
      paddingHorizontal: layout.spacingMd,
      borderRadius: layout.radiusSm,
    },
    optionRowActive: {
      backgroundColor: softSurface,
    },
    optionText: {
      fontSize: typography.body,
      color: colors.text,
    },
    optionTextActive: {
      color: colors.text,
      fontWeight: '700',
    },
    modalButtonRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      marginTop: layout.spacingSm,
      gap: layout.spacingSm,
    },
  });
}

