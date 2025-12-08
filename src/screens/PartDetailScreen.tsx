import React, { useEffect, useMemo, useState } from 'react';
import { ScrollView, View, StyleSheet, Modal, TouchableOpacity, Alert, Image } from 'react-native';
import { Button } from '../components/Button';
import { Input } from '../components/Input';
import { getDb } from '../db/database';
import { layout } from '../theme/layout';
import { typography } from '../theme/typography';
import {
  fetchInventoryFromRebrickable,
  fetchSetMetadataFromRebrickable,
  type BuildPart,
} from '../services/inventoryImport/rebrickable';
import { listLooseParts, type LoosePartRow } from '../db/items';
import { useTheme, type Theme } from '../theme/ThemeProvider';
import { getThumbnail, normalizeColorId } from '../services/thumbnailStore';
import { ThemedText as Text } from '../components/ThemedText';
import { useAppSettings } from '../settings/settingsStore';
import { getMinifigDisplayId } from '../utils/marketDisplay';
import { ContainerPicker } from '../components/ContainerPicker';
import { resolveCatalogColorById } from '../db/catalogColors';
import {
  upsertCatalogColorFromRebrickable,
  upsertCatalogPartFromRebrickable,
} from '../db/catalogUpsert';

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
  onNavigateToDetail?: (params: PartDetailParams) => void;
  onNavigateToBuildComponent?: (params: {
    buildPartId: number;
    parentItemId: number;
  }) => void;
};

type PartRecord = {
  id?: number | string | null;
  name?: string | null;
  number?: string | null;
  bricklink_id?: string | null;
  brickowl_id?: string | null;
  rebrickable_id?: string | null;
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
  catalog_color_id?: number | null;
};

type BuildPartRow = {
  id: number;
  componentSubtype: string | null;
  componentName: string | null;
  componentNumber: string | null;
  componentBricklinkId?: string | null;
  componentBrickowlId?: string | null;
  componentRebrickableId?: string | null;
  componentColor: string | null;
  componentCategory: string | null;
  componentDescription: string | null;
  componentCondition: string | null;
  quantity: number | null;
  isSpare: number | null;
  imageUri?: string | null;
  catalogColorId?: number | null;
};

export default function PartDetailScreen({
  route,
  params,
  onEditPress,
  refreshKey = 0,
  onTitleChange,
  onNavigateToDetail,
  onNavigateToBuildComponent,
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
  const [moveModalVisible, setMoveModalVisible] = useState(false);
  const [destinationContainerId, setDestinationContainerId] = useState<number | null>(null);
  const [moveQty, setMoveQty] = useState('');
  const [moveError, setMoveError] = useState<string | null>(null);
  const [savingMove, setSavingMove] = useState(false);
  const [buildParts, setBuildParts] = useState<BuildPartRow[]>([]);
  const [looseOwnedMap, setLooseOwnedMap] = useState<Map<string, number>>(new Map());
  const [inventoryFilter, setInventoryFilter] = useState<'all' | 'part' | 'minifigure'>('all');
  const [inventoryModalVisible, setInventoryModalVisible] = useState(false);
  const [editingBuildPart, setEditingBuildPart] = useState<BuildPartRow | null>(null);
  const [buildComponentName, setBuildComponentName] = useState('');
  const [buildComponentColor, setBuildComponentColor] = useState('');
  const [buildComponentSubtype, setBuildComponentSubtype] = useState<'part' | 'minifig' | 'set' | 'moc'>('part');
  const [buildQuantity, setBuildQuantity] = useState('1');
  const [buildIsSpare, setBuildIsSpare] = useState(false);
  const [importModalVisible, setImportModalVisible] = useState(false);
  const [importSetNumber, setImportSetNumber] = useState('');
  const [importLoading, setImportLoading] = useState(false);
  const [resolvedImageUri, setResolvedImageUri] = useState<string | null>(null);
  const [inventoryThumbnailCache, setInventoryThumbnailCache] = useState<Record<string, string>>(
    {}
  );
  const { settings: appSettings } = useAppSettings();
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const marketStandard = appSettings?.marketStandard ?? 'bricklink';

async function loadPartById(id: string): Promise<PartRecord | null> {
    const db = await getDb();
    const rows = await db.getAllAsync<PartRecord>(
      `
        SELECT
          id,
          name,
          number,
          bricklink_id,
          brickowl_id,
          rebrickable_id,
          qty,
          qty AS quantity,
          image_uri,
          color,
          color AS color_name,
          category AS category_name,
          description,
          description AS desc,
          type,
          condition,
          container_id,
          catalog_color_id
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
          if (record?.catalog_color_id) {
            const resolved = await resolveCatalogColorById(record.catalog_color_id);
            if (resolved?.name) {
              record.color = resolved.name;
              record.color_name = resolved.name;
            }
          }
          setPart(record ?? null);
          if (record) {
            if (record.catalog_color_id) {
              try {
                const resolved = await resolveCatalogColorById(record.catalog_color_id);
                if (resolved?.name) {
                  record.color = resolved.name;
                  record.color_name = resolved.name;
                }
              } catch (err) {
                console.warn('[PartDetail] Failed to resolve catalog color', err);
              }
            }
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
    const t = (value ?? '').trim().toLowerCase();
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

  const buildLooseKey = (number?: string | null, color?: string | null) =>
    `${(number ?? '').trim().toLowerCase()}||${(color ?? '').trim().toLowerCase()}`;
  const buildInventoryThumbKey = (number?: string | null, color?: string | null) => {
    const numKey = (number ?? '').trim();
    if (!numKey) return '';
    const colorKey = normalizeColorId(color);
    return `${numKey}|${colorKey}`;
  };

  async function loadBuildParts(record: PartRecord, isMountedFlag: boolean) {
    const db = await getDb();
    const rows = await db.getAllAsync<BuildPartRow>(
      `
        SELECT
          id,
          component_subtype AS componentSubtype,
          component_name AS componentName,
          component_number AS componentNumber,
          component_bricklink_id AS componentBricklinkId,
          component_brickowl_id AS componentBrickowlId,
          component_rebrickable_id AS componentRebrickableId,
          component_color AS componentColor,
          component_category AS componentCategory,
          component_description AS componentDescription,
          component_condition AS componentCondition,
          catalog_color_id AS catalogColorId,
          image_uri AS imageUri,
          quantity,
          is_spare AS isSpare
        FROM build_parts
        WHERE parent_item_id = ?
        ORDER BY component_subtype ASC, component_name ASC;
      `,
      [record.id]
    );

    // Build loose inventory lookup keyed by designId + color
    const looseParts = await listLooseParts();
    const looseMap = new Map<string, number>();
    looseParts.forEach(p => {
      const key = buildLooseKey(p.number, p.color);
      const prev = looseMap.get(key) ?? 0;
      looseMap.set(key, prev + (p.qty ?? 0));
    });

    if (!isMountedFlag) return;
    setLooseOwnedMap(looseMap);
    const withResolvedColors = await Promise.all(
      rows.map(async row => {
        if (row.catalogColorId) {
          const resolved = await resolveCatalogColorById(row.catalogColorId);
          if (resolved?.name) {
            return { ...row, componentColor: resolved.name };
          }
        }
        return row;
      })
    );
    setBuildParts(withResolvedColors);
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

  async function insertImportedParts(parts: BuildPart[], replaceExisting: boolean) {
    if (!part || !part.id) return;
    const parentId = Number(part.id);
    if (Number.isNaN(parentId)) return;
    const db = await getDb();
    await db.execAsync('BEGIN TRANSACTION;');
    try {
      if (replaceExisting) {
        await db.runAsync(`DELETE FROM build_parts WHERE parent_item_id = ?;`, [parentId]);
      }
      for (const p of parts) {
        const subtype = (p.componentSubtype || 'Part').toLowerCase();
        if (subtype === 'minifigure' && p.designId) {
          const existing = await db.getAllAsync<{ id: number; quantity: number }>(
            `
              SELECT id, quantity
              FROM build_parts
              WHERE parent_item_id = ?
                AND component_subtype = ?
                AND component_number = ?
              LIMIT 1;
            `,
            [parentId, subtype, p.designId]
          );
          const match = existing[0];
          if (match) {
            await db.runAsync(
              `UPDATE build_parts SET quantity = ? WHERE id = ?;`,
              [(match.quantity ?? 0) + (p.quantity ?? 0), match.id]
            );
            continue;
          }
        }
        let catalogPartId: number | null = null;
        let catalogColorId: number | null = null;
        if (p.rebrickableId || p.designId) {
          try {
            // Ensure this Rebrickable part is present in the shared catalog for downstream lookups
            catalogPartId = await upsertCatalogPartFromRebrickable({
              id: (p.rebrickableId || p.designId || '').trim(),
              name: p.componentName || p.designId || '',
            });
          } catch (error) {
            console.warn('[PartDetail] catalog part upsert failed', p.rebrickableId || p.designId, error);
          }
        }
        if (p.componentColorId && p.componentColorName) {
          try {
            catalogColorId = await upsertCatalogColorFromRebrickable({
              id: p.componentColorId,
              name: p.componentColorName,
            });
          } catch (error) {
            console.warn('[PartDetail] catalog color upsert failed', p.componentColorId, error);
          }
        }
        await db.runAsync(
          `
            INSERT INTO build_parts
              (parent_item_id, component_subtype, component_name, component_color, component_number, component_bricklink_id, component_brickowl_id, component_rebrickable_id, catalog_part_id, catalog_color_id, quantity, is_spare, component_description)
            VALUES
              (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
          `,
          [
            parentId,
            subtype,
            p.componentName || null,
            p.componentColorName || null,
            p.designId || null,
            p.bricklinkId ?? null,
            p.brickowlId ?? null,
            p.rebrickableId ?? p.designId ?? null,
            catalogPartId,
            catalogColorId,
            p.quantity ?? 0,
            p.isSpare ? 1 : 0,
            p.imageUrl ?? null,
          ]
        );
      }
      await db.execAsync('COMMIT;');
    } catch (error) {
      await db.execAsync('ROLLBACK;');
      throw error;
    }
  }

  async function updateItemImageUri(targetId: number, uri: string) {
    const db = await getDb();
    await db.runAsync(
      `
        UPDATE items
        SET image_uri = ?
        WHERE id = ?;
      `,
      [uri, targetId]
    );
  }

  async function handleImportFromBrickSet() {
    if (!part || !part.id || !importSetNumber.trim()) return;
    const userSetNumber = importSetNumber.trim();
    setImportLoading(true);
    const parentId = Number(part.id);
    if (Number.isNaN(parentId)) {
      setImportLoading(false);
      return;
    }
    const metadataPromise = fetchSetMetadataFromRebrickable(userSetNumber).catch(error => {
      console.error('Rebrickable set metadata fetch failed', error);
      return null;
    });
    try {
      const parts = await fetchInventoryFromRebrickable(userSetNumber);
      if (!parts || parts.length === 0) {
        Alert.alert('No inventory found', 'Rebrickable returned no parts for that set number.');
        return;
      }
      const metadata = await metadataPromise;
      const proceed = async (replace: boolean) => {
        await insertImportedParts(parts, replace);
        if (!part.image_uri && metadata?.imageUrl) {
          try {
            await updateItemImageUri(parentId, metadata.imageUrl);
            setPart(prev => (prev ? { ...prev, image_uri: metadata.imageUrl } : prev));
          } catch (error) {
            console.error('Failed to update imageUri from Rebrickable metadata', error);
          }
        }
        await refreshBuildPartsOnly();
        setImportModalVisible(false);
        setImportSetNumber('');
      };

      if (buildParts.length > 0) {
        Alert.alert(
          'Replace existing inventory?',
          'Replace existing inventory or append to it?',
          [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Append', onPress: () => void proceed(false) },
            { text: 'Replace', style: 'destructive', onPress: () => void proceed(true) },
          ]
        );
      } else {
        await proceed(false);
      }
    } catch (error) {
      console.error('Import from Rebrickable failed', error);
      Alert.alert(
        'Import failed',
        'Import from Rebrickable failed. Check the set number and try again.'
      );
    } finally {
      setImportLoading(false);
    }
  }

  const isSetOrMoc = useMemo(() => isSetOrMocType(part?.type), [part?.type]);
  const isSetOrMocDetails = useMemo(() => {
    const t = (part?.type ?? '').trim().toLowerCase();
    return t === 'set' || t === 'moc';
  }, [part?.type]);
  const inventoryTitle = useMemo(() => {
    if (!isSetOrMoc) return 'Build Inventory';
    const t = (part?.type ?? '').toLowerCase();
    if (t === 'set') return 'Set Inventory';
    if (t === 'moc') return 'MOC Inventory';
    return 'Build Inventory';
  }, [isSetOrMoc, part?.type]);

  useEffect(() => {
    if (!isSetOrMoc || buildParts.length === 0) return;
    const targets: Array<{
      key: string;
      num: string;
      color?: string | null;
    }> = [];
    buildParts.forEach(row => {
      const designId = (row.componentNumber ?? '').trim();
      if (!designId) return;
      const hasImageInRow =
        (row.imageUri && row.imageUri.length > 0) ||
        (row.componentDescription && row.componentDescription.startsWith('http'));
      if (hasImageInRow) return;
      const cacheKey = buildInventoryThumbKey(designId, row.componentColor);
      if (cacheKey && Object.prototype.hasOwnProperty.call(inventoryThumbnailCache, cacheKey)) {
        return;
      }
      targets.push({
        key: cacheKey || designId,
        num: designId,
        color: row.componentColor,
      });
    });
    if (targets.length === 0) return;
    let cancelled = false;
    (async () => {
      for (const entry of targets) {
        if (cancelled) break;
        try {
          const cached = await getThumbnail(entry.num, entry.color);
          if (cancelled) break;
          if (cached !== null) {
            setInventoryThumbnailCache(prev => {
              if (Object.prototype.hasOwnProperty.call(prev, entry.key)) {
                return prev;
              }
              return { ...prev, [entry.key]: cached };
            });
            continue;
          }
          // No background fetch; leave placeholder when not cached.
        } catch (error) {
          console.warn('[PartDetail] Failed to fetch inventory thumbnail', entry.num, error);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [buildParts, isSetOrMoc, inventoryThumbnailCache]);

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
  const subtitle = (() => {
    const rawNumber =
      (typeof part?.number === 'string' && part.number) ??
      (part?.id != null ? String(part.id) : null) ??
      resolvedParams?.partId ??
      null;
    const typeKey = (part?.type ?? '').toLowerCase();
    if (typeKey === 'minifig' && rawNumber) {
      return getMinifigDisplayId(
        {
          rebrickable_id: part?.rebrickable_id ?? rawNumber,
          bricklink_id: part?.bricklink_id ?? null,
          brickowl_id: part?.brickowl_id ?? null,
        },
        marketStandard
      );
    }
    return rawNumber ?? 'Set / Part number goes here';
  })();
  const resolvedQty = part?.qty ?? part?.quantity ?? resolvedParams?.quantity;
  const quantity =
    resolvedQty != null ? resolvedQty.toString() : '���������?"';
  const color =
    part?.color ?? part?.color_name ?? resolvedParams?.colorName ?? '���������?"';
  const category =
    part?.category_name ??
    'Category not set';
  useEffect(() => {
    const nextTitle = title || 'Details';
    onTitleChange?.(nextTitle);
  }, [title, onTitleChange]);

  const parentItemId = useMemo(() => {
    if (typeof part?.id === 'number') return part.id;
    if (typeof part?.id === 'string') {
      const parsed = Number(part.id);
      return Number.isNaN(parsed) ? null : parsed;
    }
    return null;
  }, [part?.id]);

  useEffect(() => {
    const uri = part?.image_uri ?? null;
    const baseUri =
      uri && typeof uri === 'string' && uri.trim().length > 0 ? uri.trim() : null;
    setResolvedImageUri(baseUri);

    let cancelled = false;
    (async () => {
      if (baseUri) return;
      const typeKey = (part?.type ?? '').toLowerCase();
      if (typeKey === 'set' || typeKey === 'moc') return;
      const designId = (part?.number ?? '').trim();
      if (!designId) return;
      const colorValue = part?.color ?? part?.color_name ?? null;
      try {
        const cached = await getThumbnail(designId, colorValue);
        if (cancelled) return;
        if (cached !== null) {
          if (cached) {
            setResolvedImageUri(cached);
          }
          return;
        }
        // No background fetch; show placeholder until user-provided image exists.
      } catch (error) {
        console.warn('[PartDetail] Failed to resolve thumbnail', designId, error);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [part?.image_uri, part?.number, part?.type, part?.color, part?.color_name, refreshKey]);

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
          {resolvedImageUri ? (
            <View
              style={[
                styles.imageWrapper,
                isSetOrMocDetails && styles.imageWrapperSet,
              ]}
            >
              <Image
                source={{ uri: resolvedImageUri }}
                style={[
                  styles.detailImage,
                  isSetOrMocDetails && styles.detailImageContain,
                ]}
              />
            </View>
          ) : null}
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
              label="Change Location"
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
              <Text style={styles.detailLabel}>{isSetOrMocDetails ? 'Theme' : 'Category'}</Text>
              <Text style={styles.detailValue}>{category}</Text>
            </View>
          </View>

          <View style={styles.statsSection}>
            <Text style={styles.sectionTitle}>Stats</Text>
            <View style={styles.statsRow}>
              <View style={styles.statCard}>
                <Text style={styles.statLabel}>Count</Text>
                <Text style={styles.statValue}>{quantity}</Text>
              </View>
              {!isSetOrMocDetails ? (
                <View style={styles.statCard}>
                  <Text style={styles.statLabel}>Color</Text>
                  <Text style={styles.statValue}>{color}</Text>
                </View>
              ) : null}
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
                  <View style={styles.inventoryHeaderActions}>
                    <Button
                      label="Add item"
                      variant="outline"
                      onPress={openInventoryModalForAdd}
                    />
                  </View>
                </View>
                <View style={styles.inventoryTabs}>
                  {[
                    { label: 'All', value: 'all' as const },
                    { label: 'Parts', value: 'part' as const },
                    { label: 'Minifigures', value: 'minifigure' as const },
                  ].map(tab => {
                    const isActive = inventoryFilter === tab.value;
                    return (
                      <TouchableOpacity
                        key={tab.value}
                        style={[
                          styles.inventoryTab,
                          isActive && styles.inventoryTabActive,
                        ]}
                        onPress={() => setInventoryFilter(tab.value)}
                      >
                        <Text
                          style={[
                            styles.inventoryTabText,
                            isActive && styles.inventoryTabTextActive,
                          ]}
                        >
                          {tab.label}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
                {buildParts.length === 0 ? (
                  <Text style={styles.inventoryEmpty}>No inventory defined yet.</Text>
                ) : (
                  buildParts
                    .filter(row => {
                      const subtype = (row.componentSubtype ?? '').toLowerCase();
                      if (inventoryFilter === 'part') return subtype === 'part';
                      if (inventoryFilter === 'minifigure') return subtype === 'minifigure';
                      return true;
                    })
                    .map(row => {
                    const imageUriFromComponent =
                      row.imageUri && row.imageUri.length > 0
                        ? row.imageUri
                        : row.componentDescription && row.componentDescription.startsWith('http')
                        ? row.componentDescription
                        : null;
                    const thumbCacheKey = buildInventoryThumbKey(
                      row.componentNumber,
                      row.componentColor
                    );
                    const cachedThumb =
                      (thumbCacheKey && inventoryThumbnailCache[thumbCacheKey]) || '';
                    const thumbnailUri =
                      imageUriFromComponent ||
                      (cachedThumb && cachedThumb.length > 0 ? cachedThumb : null);
                    const metaParts: string[] = [];
                    if (row.componentColor) metaParts.push(row.componentColor);
                    if (row.componentSubtype) metaParts.push(row.componentSubtype);
                    const isRowMinifig =
                      (row.componentSubtype ?? '').toLowerCase() === 'minifigure' ||
                      (row.componentSubtype ?? '').toLowerCase() === 'minifig';
                    const displayNumber =
                      isRowMinifig && (row.componentNumber || row.componentRebrickableId)
                        ? getMinifigDisplayId(
                            {
                              rebrickable_id:
                                row.componentRebrickableId ?? row.componentNumber ?? '',
                              bricklink_id: row.componentBricklinkId ?? null,
                              brickowl_id: row.componentBrickowlId ?? null,
                            },
                            marketStandard
                          )
                        : row.componentNumber;
                    if (displayNumber) metaParts.push(`#${displayNumber}`);
                    const meta = metaParts.join(' | ');
                    const qtyValue = row.quantity ?? 0;
                    const isSpare = !!row.isSpare;
                    const ownedLoose =
                      looseOwnedMap.get(buildLooseKey(row.componentNumber, row.componentColor)) ?? 0;
                    const missingQty = Math.max(0, qtyValue - ownedLoose);
                    return (
                      <TouchableOpacity
                        key={row.id}
                        style={styles.inventoryRow}
                        onPress={async () => {
                          if (!row.id || parentItemId == null) return;
                          onNavigateToBuildComponent?.({
                            buildPartId: row.id,
                            parentItemId,
                          });
                        }}
                      >
                        {thumbnailUri ? (
                          <Image
                            source={{ uri: thumbnailUri }}
                            style={styles.inventoryThumb}
                          />
                        ) : null}
                        <View style={{ flex: 1 }}>
                          <Text style={styles.inventoryName}>
                            {row.componentName ?? 'Unnamed component'}
                          </Text>
                          {meta ? <Text style={styles.inventoryMeta}>{meta}</Text> : null}
                          {isSetOrMoc ? (
                            <Text style={styles.inventoryMeta}>
                              Required: {qtyValue} · Owned: {ownedLoose} · Missing: {missingQty}
                            </Text>
                          ) : null}
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
            <ContainerPicker
              label="Destination container"
              selectedContainerId={destinationContainerId}
              onChange={setDestinationContainerId}
              allowCreateNew
            />
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
    },
  card: {
    backgroundColor: colors.surface,
    borderRadius: layout.radiusLg,
    padding: layout.spacingLg,
    borderWidth: 1,
    borderColor: colors.border,
    gap: layout.spacingSm,
  },
  imageWrapper: {
    width: '100%',
    height: 220,
    borderRadius: layout.radiusMd,
    overflow: 'hidden',
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
  },
  imageWrapperSet: {
    height: undefined,
    aspectRatio: 1.6,
  },
  detailImage: {
    width: '100%',
    height: '100%',
    resizeMode: 'cover',
  },
  detailImageContain: {
    resizeMode: 'contain',
  },
  inventoryThumb: {
    width: 64,
    height: 64,
    borderRadius: layout.radiusSm,
    marginRight: layout.spacingSm,
    backgroundColor: colors.background,
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
  inventoryHeaderActions: {
    flexDirection: 'row',
    gap: layout.spacingSm,
  },
  inventoryActionButton: {
    minWidth: 150,
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
  inventoryThumb: {
    width: 64,
    height: 64,
    borderRadius: layout.radiusSm,
    marginBottom: layout.spacingXs,
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
  inventoryTabs: {
    flexDirection: 'row',
    gap: layout.spacingSm,
    marginBottom: layout.spacingSm,
  },
  inventoryTab: {
    paddingHorizontal: layout.spacingSm,
    paddingVertical: layout.spacingXs,
    borderRadius: layout.radiusSm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  inventoryTabActive: {
    backgroundColor: colors.primarySoft,
    borderColor: colors.primary,
  },
  inventoryTabText: {
    fontSize: typography.chipSmall,
    color: colors.text,
    fontWeight: '600',
  },
  inventoryTabTextActive: {
    color: colors.heading,
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
}


