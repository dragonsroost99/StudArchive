import React, { useEffect, useMemo, useState } from 'react';
import { ScrollView, View, Text, StyleSheet, Modal, TouchableOpacity } from 'react-native';
import { Button } from '../components/Button';
import { Input } from '../components/Input';
import { getDb } from '../db/database';
import { colors } from '../theme/colors';
import { layout } from '../theme/layout';
import { typography } from '../theme/typography';

export type PartDetailParams = {
  partId: string;
  partName?: string;
  colorName?: string;
  quantity?: number;
};

type PartDetailScreenProps = {
  route?: { params?: PartDetailParams };
  params?: PartDetailParams;
  onEditPress?: (params: PartDetailParams) => void;
  refreshKey?: number;
};

type PartRecord = {
  id?: number | string | null;
  name?: string | null;
  number?: string | null;
  qty?: number | null;
  quantity?: number | null;
  color?: string | null;
  color_name?: string | null;
  category_name?: string | null;
  description?: string | null;
  desc?: string | null;
  type?: string | null;
  condition?: string | null;
  container_id?: number | null;
};

export default function PartDetailScreen({
  route,
  params,
  onEditPress,
  refreshKey = 0,
}: PartDetailScreenProps) {
  const resolvedParams = route?.params ?? params;
  const partId = resolvedParams?.partId;
  const [part, setPart] = useState<PartRecord | null>(null);
  const [totalQuantity, setTotalQuantity] = useState<number>(0);
  const [locations, setLocations] = useState<
    { label: string; quantity: number; isUnassigned?: boolean }[]
  >([]);
  const [containers, setContainers] = useState<{ id: number; name: string }[]>([]);
  const [moveModalVisible, setMoveModalVisible] = useState(false);
  const [destinationContainerId, setDestinationContainerId] = useState<number | null>(null);
  const [moveQty, setMoveQty] = useState('');
  const [moveError, setMoveError] = useState<string | null>(null);
  const [savingMove, setSavingMove] = useState(false);

  async function loadPartById(id: string): Promise<PartRecord | null> {
    const db = await getDb();
    const rows = await db.getAllAsync<PartRecord>(
      `
        SELECT
          id,
          name,
          number,
          qty,
          qty AS quantity,
          color,
          color AS color_name,
          category AS category_name,
          description,
          description AS desc,
          type,
          condition,
          container_id
        FROM items
        WHERE id = ?
        LIMIT 1;
      `,
      [id]
    );
    return rows[0] ?? null;
  }

  useEffect(() => {
    if (!partId) return;
    let isMounted = true;

    (async () => {
      try {
        const record = await loadPartById(partId);
        if (isMounted) {
          setPart(record ?? null);
          if (record) {
            await loadLocations(record, isMounted);
          } else {
            setLocations([]);
            setTotalQuantity(0);
          }
        }
      } catch (error) {
        console.error(error);
        if (isMounted) {
          setPart(null);
          setLocations([]);
          setTotalQuantity(0);
        }
      }
    })();

    return () => {
      isMounted = false;
    };
  }, [partId, refreshKey]);

  useEffect(() => {
    let isMounted = true;
    (async () => {
      try {
        const db = await getDb();
        const rows = await db.getAllAsync<{ id: number; name: string }>(`
          SELECT id, name
          FROM containers
          ORDER BY name ASC;
        `);
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

  async function loadLocations(record: PartRecord, isMountedFlag: boolean) {
    const db = await getDb();
    const rows = await db.getAllAsync<{
      container_id: number | null;
      qty: number | null;
      container_name: string | null;
      room_name: string | null;
    }>(
      `
        SELECT
          i.container_id,
          SUM(i.qty) AS qty,
          c.name AS container_name,
          r.name AS room_name
        FROM items i
        LEFT JOIN containers c ON i.container_id = c.id
        LEFT JOIN rooms r ON c.room_id = r.id
        WHERE
          i.type = ?
          AND i.name = ?
          AND ((i.number IS NULL AND ? IS NULL) OR i.number = ?)
          AND ((i.color IS NULL AND ? IS NULL) OR i.color = ?)
          AND ((i.category IS NULL AND ? IS NULL) OR i.category = ?)
          AND ((i.description IS NULL AND ? IS NULL) OR i.description = ?)
          AND ((i.condition IS NULL AND ? IS NULL) OR i.condition = ?)
        GROUP BY i.container_id, c.name, r.name
        ORDER BY c.name ASC;
      `,
      [
        record.type ?? null,
        record.name ?? null,
        record.number ?? null,
        record.number ?? null,
        record.color ?? null,
        record.color ?? null,
        record.category_name ?? null,
        record.category_name ?? null,
        record.description ?? null,
        record.description ?? null,
        record.condition ?? null,
        record.condition ?? null,
      ]
    );

    if (!isMountedFlag) return;

    const total = rows.reduce((sum, row) => sum + (row.qty ?? 0), 0);
    const mapped = rows.map(row => {
      const label =
        row.container_id == null
          ? 'No container'
          : row.room_name
          ? `${row.room_name} · ${row.container_name ?? 'Container'}`
          : row.container_name ?? 'Container';
      return {
        label,
        quantity: row.qty ?? 0,
        isUnassigned: row.container_id == null,
      };
    });
    setTotalQuantity(total);
    setLocations(mapped);
  }

  const containerLabel = useMemo(() => {
    if (destinationContainerId == null) return 'No container';
    const match = containers.find(c => c.id === destinationContainerId);
    return match ? match.name : 'No container';
  }, [containers, destinationContainerId]);

  async function refreshDetails() {
    if (!partId) return;
    try {
      const record = await loadPartById(partId);
      if (record) {
        setPart(record);
        await loadLocations(record, true);
      } else {
        setPart(null);
        setLocations([]);
        setTotalQuantity(0);
      }
    } catch (e: any) {
      console.error('Failed to refresh part details', e);
      setPart(null);
      setLocations([]);
      setTotalQuantity(0);
    }
  }

  function openMoveModal() {
    if (!part) return;
    const currentQty = part.qty ?? part.quantity ?? resolvedParams?.quantity ?? 1;
    const safeQty = currentQty && currentQty > 0 ? currentQty : 1;
    setDestinationContainerId(part.container_id ?? null);
    setMoveQty(String(safeQty));
    setMoveError(null);
    setMoveModalVisible(true);
  }

  async function handleSubmitMove() {
    if (!partId || !part) return;
    const parsedPartId = Number(partId);
    if (Number.isNaN(parsedPartId)) {
      setMoveError('Invalid item id');
      return;
    }
    const currentQty = part.qty ?? part.quantity ?? 0;
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
          [destinationContainerId, parsedPartId]
        );
      } else {
        const remaining = currentQty - moveAmount;
        await db.runAsync(
          `UPDATE items SET qty = ? WHERE id = ?;`,
          [remaining, parsedPartId]
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
          destinationContainerId == null ? [] : [destinationContainerId];
        params.push(
          part.type ?? null,
          part.name ?? null,
          part.number ?? null,
          part.number ?? null,
          part.color ?? null,
          part.color ?? null,
          part.category_name ?? null,
          part.category_name ?? null,
          part.description ?? null,
          part.description ?? null,
          part.condition ?? null,
          part.condition ?? null
        );

        const existing = await db.getAllAsync<{ id: number; qty: number }>(
          matchSql,
          params
        );
        const match = existing[0];

        if (match) {
          await db.runAsync(
            `UPDATE items SET qty = ? WHERE id = ?;`,
            [(match.qty ?? 0) + moveAmount, match.id]
          );
        } else {
          await db.runAsync(
            `
              INSERT INTO items
                (type, name, number, container_id, qty, condition, color, category, description, value_each, value_total)
              VALUES
                (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
            `,
            [
              part.type ?? 'part',
              part.name ?? '',
              part.number ?? null,
              destinationContainerId,
              moveAmount,
              part.condition ?? null,
              part.color ?? null,
              part.category_name ?? null,
              part.description ?? null,
              null,
              null,
            ]
          );
        }
      }
      await db.execAsync('COMMIT;');
      setMoveModalVisible(false);
      await refreshDetails();
    } catch (e: any) {
      console.error('Failed to move item', e);
      setMoveError(e?.message ?? 'Failed to move item');
      try {
        await (await getDb()).execAsync('ROLLBACK;');
      } catch {}
    } finally {
      setSavingMove(false);
    }
  }
  const title =
    part?.name ?? resolvedParams?.partName ?? 'Part Name (placeholder)';
  const subtitle =
    (typeof part?.number === 'string' && part.number) ??
    (part?.id != null ? String(part.id) : null) ??
    resolvedParams?.partId ??
    'Set / Part number goes here';
  const resolvedQty = part?.qty ?? part?.quantity ?? resolvedParams?.quantity;
  const quantity =
    resolvedQty != null ? resolvedQty.toString() : '���������?"';
  const color =
    part?.color ?? part?.color_name ?? resolvedParams?.colorName ?? '���������?"';
  const category =
    part?.category_name ??
    'Category not set';
  const description =
    part?.description ??
    part?.desc ??
    'No description provided yet.';

  const totalQuantityDisplay = useMemo(() => {
    if (totalQuantity && totalQuantity > 0) return totalQuantity.toString();
    if (resolvedQty != null) return resolvedQty.toString();
    return '…';
  }, [totalQuantity, resolvedQty]);

  return (
    <>
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.card}>
          <View style={styles.headerRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.title}>{title}</Text>
              <Text style={styles.subtitle}>{subtitle}</Text>
            </View>
            <Button
              label="Edit"
              variant="outline"
              onPress={() => {
                if (partId) {
                  onEditPress?.({
                    partId,
                    partName: title,
                    colorName: color,
                    quantity: resolvedQty ?? undefined,
                  });
                }
              }}
            />
          </View>
          <View style={styles.actionsRow}>
            <Button
              label="Move to container..."
              variant="outline"
              onPress={openMoveModal}
              disabled={!part || (part?.qty ?? part?.quantity ?? 0) < 1}
            />
          </View>
          <View style={styles.divider} />
          <View style={styles.detailsSection}>
            <Text style={styles.sectionTitle}>Details</Text>
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Category</Text>
              <Text style={styles.detailValue}>{category}</Text>
            </View>
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Description</Text>
              <Text style={styles.detailValue}>{description}</Text>
            </View>
          </View>

          <View style={styles.statsSection}>
            <Text style={styles.sectionTitle}>Stats</Text>
            <View style={styles.statsRow}>
              <View style={styles.statCard}>
                <Text style={styles.statLabel}>Count</Text>
                <Text style={styles.statValue}>{quantity}</Text>
              </View>
              <View style={styles.statCard}>
                <Text style={styles.statLabel}>Color</Text>
                <Text style={styles.statValue}>{color}</Text>
              </View>
            </View>
            <View style={styles.statsRow}>
              <View style={styles.statCard}>
                <Text style={styles.statLabel}>Total quantity (all containers)</Text>
                <Text style={styles.statValue}>{totalQuantityDisplay}</Text>
              </View>
            </View>
            {locations.length > 0 ? (
              <View style={styles.locationSection}>
                <Text style={styles.sectionTitle}>Stored in</Text>
                {locations.map(entry => (
                  <View key={`${entry.label}-${entry.quantity}`} style={styles.locationRow}>
                    <Text style={styles.locationLabel}>{entry.label}</Text>
                    <Text style={styles.locationQty}>{entry.quantity}</Text>
                  </View>
                ))}
              </View>
            ) : null}
          </View>
        </View>
      </ScrollView>

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
            <Text style={styles.modalTitle}>Move to container</Text>
            <View style={styles.selector}>
              <Text style={styles.selectorLabel}>Destination container</Text>
              <Text style={styles.selectorValue}>{containerLabel}</Text>
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
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    padding: layout.spacingLg,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: layout.radiusLg,
    padding: layout.spacingLg,
    borderWidth: 1,
    borderColor: colors.border,
    gap: layout.spacingSm,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: layout.spacingSm,
  },
  actionsRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
  },
  title: {
    fontSize: typography.title,
    fontWeight: '700',
    color: colors.heading,
  },
  subtitle: {
    fontSize: typography.caption,
    color: colors.textMuted,
  },
  divider: {
    height: 1,
    backgroundColor: colors.border,
    marginVertical: layout.spacingXs,
  },
  detailsSection: {
    gap: layout.spacingSm,
  },
  detailRow: {
    gap: layout.spacingXs / 2,
  },
  detailLabel: {
    fontSize: typography.caption,
    color: colors.textMuted,
  },
  detailValue: {
    fontSize: typography.body,
    color: colors.text,
    lineHeight: typography.body + 4,
  },
  statsSection: {
    marginTop: layout.spacingSm,
    gap: layout.spacingXs,
  },
  sectionTitle: {
    fontSize: typography.sectionTitle,
    fontWeight: '600',
    color: colors.heading,
  },
  statsRow: {
    flexDirection: 'row',
    gap: layout.spacingSm,
    flexWrap: 'wrap',
  },
  statCard: {
    flex: 1,
    minWidth: 120,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: layout.radiusMd,
    padding: layout.spacingSm,
  },
  statLabel: {
    fontSize: typography.caption,
    color: colors.textMuted,
  },
  statValue: {
    marginTop: layout.spacingXs / 2,
    fontSize: typography.body,
    color: colors.text,
    fontWeight: '600',
  },
  locationSection: {
    marginTop: layout.spacingSm,
    gap: layout.spacingXs,
  },
  locationRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: layout.radiusMd,
    paddingHorizontal: layout.spacingSm,
    paddingVertical: layout.spacingXs,
  },
  locationLabel: {
    fontSize: typography.body,
    color: colors.text,
  },
  locationQty: {
    fontSize: typography.body,
    color: colors.heading,
    fontWeight: '700',
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
    padding: layout.spacingLg,
  },
  modalTitle: {
    fontSize: typography.sectionTitle,
    fontWeight: '700',
    color: colors.heading,
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
    color: colors.textMuted,
    marginBottom: layout.spacingXs / 2,
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
  modalButtonRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: layout.spacingSm,
    gap: layout.spacingSm,
  },
  errorText: {
    fontSize: typography.caption,
    color: colors.danger,
    marginTop: layout.spacingXs,
  },
});
