import React, { useEffect, useMemo, useState } from 'react';
import { ScrollView, View, Text, StyleSheet, Modal, TouchableOpacity, Alert } from 'react-native';
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
  image_uri?: string | null;
};

type BuildPartRow = {
  id: number;
  componentSubtype: string | null;
  componentName: string | null;
  componentNumber: string | null;
  componentColor: string | null;
  componentCategory: string | null;
  componentDescription: string | null;
  componentCondition: string | null;
  quantity: number | null;
  isSpare: number | null;
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
    {
      label: string;
      quantity: number;
      isUnassigned?: boolean;
      containerId: number | null;
      itemId: number | null;
    }[]
  >([]);
  const [selectedLocation, setSelectedLocation] = useState<{
    itemId: number | null;
    containerId: number | null;
    quantity: number;
  } | null>(null);
  const [selectedItem, setSelectedItem] = useState<PartRecord | null>(null);
  const [containers, setContainers] = useState<{ id: number; name: string }[]>([]);
  const [moveModalVisible, setMoveModalVisible] = useState(false);
  const [destinationContainerId, setDestinationContainerId] = useState<number | null>(null);
  const [moveQty, setMoveQty] = useState('');
  const [moveError, setMoveError] = useState<string | null>(null);
  const [savingMove, setSavingMove] = useState(false);
  const [buildParts, setBuildParts] = useState<BuildPartRow[]>([]);
  const [inventoryModalVisible, setInventoryModalVisible] = useState(false);
  const [editingBuildPart, setEditingBuildPart] = useState<BuildPartRow | null>(null);
  const [buildComponentName, setBuildComponentName] = useState('');
  const [buildComponentColor, setBuildComponentColor] = useState('');
  const [buildComponentSubtype, setBuildComponentSubtype] = useState<'part' | 'minifig' | 'set' | 'moc'>('part');
  const [buildQuantity, setBuildQuantity] = useState('1');
  const [buildIsSpare, setBuildIsSpare] = useState(false);

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
            if (isSetOrMocType(record.type)) {
              await loadBuildParts(record, isMounted);
            } else {
              setBuildParts([]);
            }
          } else {
            setLocations([]);
            setTotalQuantity(0);
            setBuildParts([]);
          }
        }
      } catch (error) {
        console.error(error);
        if (isMounted) {
          setPart(null);
          setLocations([]);
          setTotalQuantity(0);
          setBuildParts([]);
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

  useEffect(() => {
    const targetId = selectedLocation?.itemId;
    if (!targetId) {
      setSelectedItem(null);
      return;
    }
    let isActive = true;
    (async () => {
      try {
        const record = await loadPartById(String(targetId));
        if (isActive) {
          setSelectedItem(record);
        }
      } catch (e) {
        console.error('Failed to load selected item', e);
      }
    })();
    return () => {
      isActive = false;
    };
  }, [selectedLocation?.itemId]);

  function isSetOrMocType(value?: string | null): boolean {
    const t = (value ?? '').toLowerCase();
    return t === 'set' || t === 'moc';
  }

  async function loadLocations(record: PartRecord, isMountedFlag: boolean) {
    const db = await getDb();
    const rows = await db.getAllAsync<{
      item_id: number | null;
      container_id: number | null;
      qty: number | null;
      container_name: string | null;
      room_name: string | null;
    }>(
      `
        SELECT
          MIN(i.id) AS item_id,
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
        containerId: row.container_id,
        itemId: row.item_id ?? null,
      };
    });
    setTotalQuantity(total);
    setLocations(mapped);
    setSelectedLocation(prev => {
      if (mapped.length === 0) return null;
      if (prev) {
        const match = mapped.find(
          entry =>
            (prev.itemId != null && entry.itemId === prev.itemId) ||
            (prev.itemId == null && entry.containerId === prev.containerId)
        );
        if (match) {
          return {
            itemId: match.itemId ?? null,
            containerId: match.containerId ?? null,
            quantity: match.quantity,
          };
        }
      }
      const idValue =
        typeof record.id === 'number'
          ? record.id
          : typeof record.id === 'string'
            ? Number(record.id)
            : null;
      const matchByCurrentPart =
        idValue == null
          ? null
          : mapped.find(entry => entry.itemId === idValue);
      const fallback = matchByCurrentPart ?? mapped[0];
      return {
        itemId: fallback.itemId ?? null,
        containerId: fallback.containerId ?? null,
        quantity: fallback.quantity,
      };
    });
  }

  async function loadBuildParts(record: PartRecord, isMountedFlag: boolean) {
    const db = await getDb();
    const rows = await db.getAllAsync<BuildPartRow>(
      `
        SELECT
          id,
          component_subtype AS componentSubtype,
          component_name AS componentName,
          component_number AS componentNumber,
          component_color AS componentColor,
          component_category AS componentCategory,
          component_description AS componentDescription,
          component_condition AS componentCondition,
          quantity,
          is_spare AS isSpare
        FROM build_parts
        WHERE parent_item_id = ?
        ORDER BY component_subtype ASC, component_name ASC;
      `,
      [record.id]
    );

    if (!isMountedFlag) return;
    setBuildParts(rows);
  }

  function openInventoryModalForAdd() {
    setEditingBuildPart(null);
    setBuildComponentName('');
    setBuildComponentColor('');
    setBuildComponentSubtype('part');
    setBuildQuantity('1');
    setBuildIsSpare(false);
    setInventoryModalVisible(true);
  }

  function openInventoryModalForEdit(row: BuildPartRow) {
    setEditingBuildPart(row);
    setBuildComponentName(row.componentName ?? '');
    setBuildComponentColor(row.componentColor ?? '');
    const subtype = (row.componentSubtype ?? 'part').toLowerCase();
    setBuildComponentSubtype(
      subtype === 'set' || subtype === 'moc' || subtype === 'minifig'
        ? (subtype as 'set' | 'moc' | 'minifig')
        : 'part'
    );
    setBuildQuantity(String(row.quantity ?? 1));
    setBuildIsSpare(!!row.isSpare);
    setInventoryModalVisible(true);
  }

  async function refreshBuildPartsOnly() {
    if (!part || !isSetOrMoc) return;
    await loadBuildParts(part, true);
  }

  async function handleSaveBuildPart() {
    if (!part || !part.id) return;
    const parentId = Number(part.id);
    if (Number.isNaN(parentId)) return;
    const qtyNum = parseInt(buildQuantity, 10);
    const safeQty = Number.isNaN(qtyNum) || qtyNum < 1 ? 1 : qtyNum;
    const db = await getDb();
    if (editingBuildPart) {
      await db.runAsync(
        `
          UPDATE build_parts
          SET
            component_subtype = ?,
            component_name = ?,
            component_color = ?,
            quantity = ?,
            is_spare = ?
          WHERE id = ?;
        `,
        [
          buildComponentSubtype,
          buildComponentName.trim() || null,
          buildComponentColor.trim() || null,
          safeQty,
          buildIsSpare ? 1 : 0,
          editingBuildPart.id,
        ]
      );
    } else {
      await db.runAsync(
        `
          INSERT INTO build_parts
            (parent_item_id, component_subtype, component_name, component_color, quantity, is_spare)
          VALUES
            (?, ?, ?, ?, ?, ?);
        `,
        [
          parentId,
          buildComponentSubtype,
          buildComponentName.trim() || null,
          buildComponentColor.trim() || null,
          safeQty,
          buildIsSpare ? 1 : 0,
        ]
      );
    }
    setInventoryModalVisible(false);
    setEditingBuildPart(null);
    await refreshBuildPartsOnly();
  }

  function confirmDeleteBuildPart(row: BuildPartRow) {
    Alert.alert(
      'Remove inventory item?',
      'Remove this inventory item from the build?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            const db = await getDb();
            await db.runAsync(`DELETE FROM build_parts WHERE id = ?;`, [row.id]);
            await refreshBuildPartsOnly();
            setInventoryModalVisible(false);
            setEditingBuildPart(null);
          },
        },
      ]
    );
  }

  const containerLabel = useMemo(() => {
    if (destinationContainerId == null) return 'No container';
    const match = containers.find(c => c.id === destinationContainerId);
    return match ? match.name : 'No container';
  }, [containers, destinationContainerId]);

  const isSetOrMoc = useMemo(() => isSetOrMocType(part?.type), [part?.type]);
  const inventoryTitle = useMemo(() => {
    if (!isSetOrMoc) return 'Build Inventory';
    const t = (part?.type ?? '').toLowerCase();
    if (t === 'set') return 'Set Inventory';
    if (t === 'moc') return 'MOC Inventory';
    return 'Build Inventory';
  }, [isSetOrMoc, part?.type]);

  function getActionSource(): PartRecord | null {
    if (selectedItem) return selectedItem;
    if (selectedLocation && part) {
      return {
        ...part,
        id: selectedLocation.itemId ?? part.id,
        qty: selectedLocation.quantity,
        quantity: selectedLocation.quantity,
        container_id: selectedLocation.containerId,
      };
    }
    return part;
  }

  async function refreshDetails() {
    if (!partId) return;
    try {
      const record = await loadPartById(partId);
      if (record) {
        setPart(record);
        await loadLocations(record, true);
        if (isSetOrMocType(record.type)) {
          await loadBuildParts(record, true);
        } else {
          setBuildParts([]);
        }
        setSelectedItem(prev =>
          prev && prev.id === record.id ? prev : record
        );
      } else {
        setPart(null);
        setLocations([]);
        setTotalQuantity(0);
        setBuildParts([]);
      }
    } catch (e: any) {
      console.error('Failed to refresh part details', e);
      setPart(null);
      setLocations([]);
      setTotalQuantity(0);
      setBuildParts([]);
    }
  }

  function openMoveModal() {
    const source = getActionSource();
    if (!source) return;
    const selectedQty = selectedLocation?.quantity ?? null;
    const currentQty =
      selectedQty ?? source.qty ?? source.quantity ?? resolvedParams?.quantity ?? 1;
    const safeQty = currentQty && currentQty > 0 ? currentQty : 1;
    const defaultDestination =
      selectedLocation?.containerId !== undefined
        ? selectedLocation?.containerId ?? null
        : source.container_id ?? null;
    setDestinationContainerId(defaultDestination);
    setMoveQty(String(safeQty));
    setMoveError(null);
    setMoveModalVisible(true);
  }

  async function handleSubmitMove() {
    const source = getActionSource();
    if (!source) return;
    const parsedPartId = Number(source.id);
    if (Number.isNaN(parsedPartId)) {
      setMoveError('Invalid item id');
      return;
    }
    const currentQty = source.qty ?? source.quantity ?? 0;
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
          source.type ?? null,
          source.name ?? null,
          source.number ?? null,
          source.number ?? null,
          source.color ?? null,
          source.color ?? null,
          source.category_name ?? null,
          source.category_name ?? null,
          source.description ?? null,
          source.description ?? null,
          source.condition ?? null,
          source.condition ?? null
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
              source.type ?? 'part',
              source.name ?? '',
              source.number ?? null,
              destinationContainerId,
              moveAmount,
              source.condition ?? null,
              source.color ?? null,
              source.category_name ?? null,
              source.description ?? null,
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
                const targetId =
                  selectedLocation?.itemId != null
                    ? String(selectedLocation.itemId)
                    : partId;
                if (targetId) {
                  const quantityForEdit =
                    selectedLocation?.quantity ?? resolvedQty ?? undefined;
                  onEditPress?.({
                    partId: targetId,
                    partName: title,
                    colorName: color,
                    quantity: quantityForEdit,
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
              disabled={
                !selectedLocation ||
                (selectedLocation?.quantity ?? part?.qty ?? part?.quantity ?? 0) < 1
              }
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
                {locations.map(entry => {
                  const isSelected =
                    selectedLocation != null &&
                    ((selectedLocation.itemId != null &&
                      entry.itemId === selectedLocation.itemId) ||
                      (selectedLocation.itemId == null &&
                        entry.containerId === selectedLocation.containerId));
                  return (
                    <TouchableOpacity
                      key={`${entry.itemId ?? 'none'}-${entry.containerId ?? 'none'}`}
                      style={[
                        styles.locationRow,
                        isSelected && styles.locationRowSelected,
                      ]}
                      onPress={() =>
                        setSelectedLocation({
                          itemId: entry.itemId ?? null,
                          containerId: entry.containerId ?? null,
                          quantity: entry.quantity,
                        })
                      }
                    >
                      <Text
                        style={[
                          styles.locationLabel,
                          isSelected && styles.locationLabelSelected,
                        ]}
                      >
                        {entry.label}
                      </Text>
                      <Text
                        style={[
                          styles.locationQty,
                          isSelected && styles.locationQtySelected,
                        ]}
                      >
                        {entry.quantity}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            ) : null}
            {isSetOrMoc ? (
              <View style={styles.inventorySection}>
                <View style={styles.inventoryHeaderRow}>
                  <Text style={styles.sectionTitle}>{inventoryTitle}</Text>
                  <Button
                    label="Add item"
                    variant="outline"
                    onPress={openInventoryModalForAdd}
                  />
                </View>
                {buildParts.length === 0 ? (
                  <Text style={styles.inventoryEmpty}>No inventory defined yet.</Text>
                ) : (
                  buildParts.map(row => {
                    const metaParts: string[] = [];
                    if (row.componentColor) metaParts.push(row.componentColor);
                    if (row.componentSubtype) metaParts.push(row.componentSubtype);
                    if (row.componentNumber) metaParts.push(`#${row.componentNumber}`);
                    const meta = metaParts.join(' | ');
                    const qtyValue = row.quantity ?? 0;
                    const isSpare = !!row.isSpare;
                    return (
                      <TouchableOpacity
                        key={row.id}
                        style={styles.inventoryRow}
                        onPress={() => openInventoryModalForEdit(row)}
                      >
                        <View style={{ flex: 1 }}>
                          <Text style={styles.inventoryName}>
                            {row.componentName ?? 'Unnamed component'}
                          </Text>
                          {meta ? <Text style={styles.inventoryMeta}>{meta}</Text> : null}
                        </View>
                        {isSpare ? (
                          <View style={styles.inventorySpareBadge}>
                            <Text style={styles.inventorySpareText}>Spare</Text>
                          </View>
                        ) : null}
                        <View style={styles.inventoryQtyBadge}>
                          <Text style={styles.inventoryQtyText}>x{qtyValue}</Text>
                        </View>
                      </TouchableOpacity>
                    );
                  })
                )}
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

      {/* Build inventory editor */}
      <Modal
        visible={inventoryModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setInventoryModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <TouchableOpacity
            style={styles.modalBackdrop}
            activeOpacity={1}
            onPress={() => setInventoryModalVisible(false)}
          />
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>
              {editingBuildPart ? 'Edit inventory item' : 'Add inventory item'}
            </Text>
            <Input
              label="Component name"
              value={buildComponentName}
              onChangeText={setBuildComponentName}
              placeholder="Name"
            />
            <Input
              label="Color"
              value={buildComponentColor}
              onChangeText={setBuildComponentColor}
              placeholder="Color (optional)"
            />
            <View style={styles.selector}>
              <Text style={styles.selectorLabel}>Subtype</Text>
              {(['part', 'minifig', 'set', 'moc'] as const).map(option => {
                const label =
                  option === 'part'
                    ? 'Part'
                    : option === 'minifig'
                      ? 'Minifigure'
                      : option === 'set'
                        ? 'Set'
                        : 'MOC';
                const isActive = buildComponentSubtype === option;
                return (
                  <TouchableOpacity
                    key={option}
                    style={[
                      styles.optionRow,
                      isActive && styles.optionRowActive,
                    ]}
                    onPress={() => setBuildComponentSubtype(option)}
                  >
                    <Text
                      style={[
                        styles.optionText,
                        isActive && styles.optionTextActive,
                      ]}
                    >
                      {label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            <Input
              label="Quantity"
              value={buildQuantity}
              onChangeText={text => setBuildQuantity(text.replace(/\D+/g, ''))}
              keyboardType="number-pad"
              inputMode="numeric"
              placeholder="1"
            />
            <TouchableOpacity
              style={styles.spareToggle}
              onPress={() => setBuildIsSpare(prev => !prev)}
            >
              <View
                style={[
                  styles.spareCheckbox,
                  buildIsSpare && styles.spareCheckboxChecked,
                ]}
              />
              <Text style={styles.spareLabel}>Mark as spare</Text>
            </TouchableOpacity>

            <View style={styles.modalButtonRow}>
              <Button
                label="Cancel"
                variant="outline"
                onPress={() => setInventoryModalVisible(false)}
              />
              {editingBuildPart ? (
                <Button
                  label="Delete"
                  variant="danger"
                  onPress={() => editingBuildPart && confirmDeleteBuildPart(editingBuildPart)}
                />
              ) : null}
              <Button label="Save" onPress={handleSaveBuildPart} />
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
  locationRowSelected: {
    backgroundColor: colors.primarySoft,
    borderColor: colors.primary,
  },
  locationLabel: {
    fontSize: typography.body,
    color: colors.text,
  },
  locationLabelSelected: {
    color: colors.heading,
    fontWeight: '700',
  },
  locationQty: {
    fontSize: typography.body,
    color: colors.heading,
    fontWeight: '700',
  },
  locationQtySelected: {
    color: colors.heading,
  },
  inventorySection: {
    marginTop: layout.spacingSm,
    gap: layout.spacingXs,
  },
  inventoryHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  inventoryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: layout.spacingSm,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: layout.radiusMd,
    paddingHorizontal: layout.spacingSm,
    paddingVertical: layout.spacingXs,
  },
  inventoryName: {
    fontSize: typography.body,
    color: colors.text,
    fontWeight: '600',
  },
  inventoryMeta: {
    marginTop: layout.spacingXs / 2,
    fontSize: typography.caption,
    color: colors.textMuted,
  },
  inventoryQtyBadge: {
    minWidth: 46,
    paddingHorizontal: layout.spacingSm,
    paddingVertical: layout.spacingXs,
    borderRadius: layout.radiusSm,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  inventoryQtyText: {
    fontSize: typography.body,
    fontWeight: '700',
    color: colors.text,
  },
  inventorySpareBadge: {
    paddingHorizontal: layout.spacingSm,
    paddingVertical: layout.spacingXs / 2,
    borderRadius: layout.radiusSm,
    backgroundColor: colors.primarySoft,
    borderWidth: 1,
    borderColor: colors.primary,
  },
  inventorySpareText: {
    fontSize: typography.caption,
    color: colors.heading,
    fontWeight: '700',
  },
  inventoryEmpty: {
    fontSize: typography.body,
    color: colors.textMuted,
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
  spareToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: layout.spacingSm,
    marginTop: layout.spacingSm,
  },
  spareCheckbox: {
    width: 20,
    height: 20,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.background,
  },
  spareCheckboxChecked: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  spareLabel: {
    fontSize: typography.body,
    color: colors.text,
  },
});
