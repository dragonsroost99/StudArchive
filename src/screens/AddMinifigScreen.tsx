import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  TouchableOpacity,
  View,
} from 'react-native';
import { Input } from '../components/Input';
import { Button } from '../components/Button';
import { layout } from '../theme/layout';
import { typography } from '../theme/typography';
import { useTheme, type Theme } from '../theme/ThemeProvider';
import { ThemedText as Text } from '../components/ThemedText';
import { ContainerPicker } from '../components/ContainerPicker';
import { useAppSettings } from '../settings/settingsStore';
import { getMinifigDisplayId, type MinifigLike } from '../utils/marketDisplay';
import { getDb } from '../db/database';

type MinifigRow = {
  id?: number;
  name: string;
  rebrickable_id: string;
  bricklink_id?: string | null;
  brickowl_id?: string | null;
  img_url?: string | null;
};

type AddMinifigScreenProps = {
  onAdded?: () => void;
};

const BL_ID_REGEX = /^[a-z]{2,3}\d{2,4}$/i;

async function ensureMinifigCatalogTable(db: any) {
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS minifig_catalog (
      rebrickable_id TEXT PRIMARY KEY NOT NULL,
      name TEXT,
      bricklink_id TEXT,
      brickowl_id TEXT,
      img_url TEXT
    );
  `);
}

async function searchLocalMinifigs(raw: string): Promise<MinifigRow[]> {
  const db = await getDb();
  await ensureMinifigCatalogTable(db);
  const like = `%${raw}%`;
  const rows = await db.getAllAsync<MinifigRow>(
    `
      SELECT id, name, number AS rebrickable_id, bricklink_id, brickowl_id, image_uri AS img_url
      FROM items
      WHERE type = 'minifig'
        AND (
          number = ?
          OR bricklink_id = ?
          OR brickowl_id = ?
          OR name LIKE ?
        )
      UNION
      SELECT NULL as id, name, rebrickable_id, bricklink_id, brickowl_id, img_url
      FROM minifig_catalog
      WHERE
        rebrickable_id = ?
        OR bricklink_id = ?
        OR brickowl_id = ?
        OR name LIKE ?
      LIMIT 50;
    `,
    [raw, raw, raw, like, raw, raw, raw, like]
  );
  return rows;
}

async function upsertCatalogEntries(rows: MinifigRow[]) {
  if (!rows.length) return;
  const db = await getDb();
  await ensureMinifigCatalogTable(db);
  const stmt = await db.prepareAsync(
    `
      INSERT INTO minifig_catalog (rebrickable_id, name, bricklink_id, brickowl_id, img_url)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(rebrickable_id) DO UPDATE SET
        name = excluded.name,
        bricklink_id = COALESCE(excluded.bricklink_id, minifig_catalog.bricklink_id),
        brickowl_id = COALESCE(excluded.brickowl_id, minifig_catalog.brickowl_id),
        img_url = COALESCE(excluded.img_url, minifig_catalog.img_url);
    `
  );
  try {
    for (const row of rows) {
      await stmt.runAsync([
        row.rebrickable_id,
        row.name,
        row.bricklink_id ?? null,
        row.brickowl_id ?? null,
        row.img_url ?? null,
      ]);
    }
  } finally {
    await stmt.finalizeAsync();
  }
}

async function fetchMinifigDetail(figId: string): Promise<MinifigRow | null> {
  try {
    const detailResp = await fetch(`https://rebrickable.com/api/v3/lego/minifigs/${figId}/`, {
      headers: {
        Authorization: 'key 20c8f718caadb2f0e0eca2a30373592b',
        Accept: 'application/json',
      },
    });
    if (!detailResp.ok) return null;
    const detail = await detailResp.json();
    return {
      rebrickable_id: detail.fig_num ?? figId,
      name: detail.name ?? figId,
      bricklink_id: detail?.external_ids?.BrickLink?.[0] ?? null,
      brickowl_id: detail?.external_ids?.BrickOwl?.[0] ?? null,
      img_url: detail.img_url ?? detail.set_img_url ?? null,
    };
  } catch (error) {
    console.warn('Failed detail fetch for minifig', figId, error);
    return null;
  }
}

async function fetchList(url: string): Promise<any[]> {
  const response = await fetch(url, {
    headers: {
      Authorization: 'key 20c8f718caadb2f0e0eca2a30373592b',
      Accept: 'application/json',
    },
  });
  if (!response.ok) {
    console.warn('Rebrickable minifig list failed', response.status);
    return [];
  }
  const data = await response.json();
  return Array.isArray(data?.results) ? data.results : [];
}

function uniqueIds(entries: any[]): string[] {
  const set = new Set<string>();
  entries.forEach(entry => {
    const figId = entry.fig_num ?? entry.set_num ?? entry.number ?? entry.id ?? null;
    if (figId) set.add(String(figId));
  });
  return Array.from(set);
}

async function searchMinifigs(query: string): Promise<MinifigRow[]> {
  const raw = query.trim();
  const q = raw.toLowerCase();
  if (!raw) return [];

  const local = await searchLocalMinifigs(raw);
  if (local.length > 0) {
    return local;
  }

  const looksLikeId = BL_ID_REGEX.test(raw);
  const isNumeric = /^\d+$/.test(raw);
  if (isNumeric) {
    return [];
  }

  const collectedDetails: MinifigRow[] = [];
  const detailCache = new Map<string, MinifigRow | null>();

  async function resolveDetails(figIds: string[], requireExternalMatch: boolean) {
    for (const figId of figIds) {
      if (detailCache.has(figId)) {
        const cached = detailCache.get(figId);
        if (cached) collectedDetails.push(cached);
        continue;
      }
      const detail = await fetchMinifigDetail(figId);
      detailCache.set(figId, detail);
      if (!detail) continue;
      if (requireExternalMatch) {
        const blMatch = detail.bricklink_id && detail.bricklink_id.toLowerCase() === q;
        const boMatch = detail.brickowl_id && detail.brickowl_id.toLowerCase() === q;
        if (!blMatch && !boMatch) {
          continue;
        }
      }
      collectedDetails.push(detail);
    }
  }

  if (looksLikeId) {
    const candidateIds = uniqueIds([
      ...(await fetchList(
        `https://rebrickable.com/api/v3/lego/minifigs/?bricklink_id=${encodeURIComponent(raw)}&page_size=100`
      )),
      ...(await fetchList(
        `https://rebrickable.com/api/v3/lego/minifigs/?brickowl_id=${encodeURIComponent(raw)}&page_size=100`
      )),
      ...(await fetchList(
        `https://rebrickable.com/api/v3/lego/minifigs/?search=${encodeURIComponent(raw)}&page_size=100`
      )),
    ]);
    await resolveDetails(candidateIds, true);
    if (collectedDetails.length > 0) {
      await upsertCatalogEntries(collectedDetails);
      return collectedDetails;
    }
  }

  const searchIds = uniqueIds(
    await fetchList(
      `https://rebrickable.com/api/v3/lego/minifigs/?search=${encodeURIComponent(raw)}&page_size=20`
    )
  ).slice(0, 20);
  await resolveDetails(searchIds, false);
  await upsertCatalogEntries(collectedDetails);
  return collectedDetails;
}

export default function AddMinifigScreen({ onAdded }: AddMinifigScreenProps) {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const { settings } = useAppSettings();
  const marketStandard = settings?.marketStandard ?? 'bricklink';

  const [query, setQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState<MinifigRow[]>([]);
  const [selected, setSelected] = useState<MinifigRow | null>(null);
  const [selectedContainerId, setSelectedContainerId] = useState<number | null>(null);
  const [quantity, setQuantity] = useState('1');

  const placeholder =
    marketStandard === 'bricklink'
      ? 'Search by BrickLink ID or name'
      : marketStandard === 'brickowl'
        ? 'Search by BrickOwl ID or name'
        : 'Search by Rebrickable ID or name';

  async function handleSearch() {
    const trimmed = query.trim();
    if (!trimmed) return;
    setSearching(true);
    try {
      const matches = await searchMinifigs(trimmed);
      if (matches.length === 0 && /^\d+$/.test(trimmed)) {
        Alert.alert(
          'No minifig found',
          'That looks like a set number. Use "Import Set" to import a full set.'
        );
      }
      setResults(matches);
      setSelected(matches[0] ?? null);
    } catch (error) {
      console.error('Minifig search failed', error);
      Alert.alert('Search failed', 'Could not search Rebrickable. Try again.');
    } finally {
      setSearching(false);
    }
  }

  async function handleAdd() {
    if (!selected) return;
    const qtyNum = parseInt(quantity, 10);
    const safeQty = Number.isNaN(qtyNum) || qtyNum < 1 ? 1 : qtyNum;
    const db = await getDb();
    await db.execAsync('BEGIN TRANSACTION;');
    try {
      const existingRows = await db.getAllAsync<{ id: number }>(
        `
          SELECT id FROM items
          WHERE type = 'minifig'
            AND rebrickable_id = ?
          LIMIT 1;
        `,
        [selected.rebrickable_id]
      );
      let targetId = existingRows[0]?.id ?? null;
      if (!targetId) {
        await db.runAsync(
          `
            INSERT INTO items
              (type, name, number, bricklink_id, brickowl_id, rebrickable_id, container_id, qty, image_uri)
            VALUES
              (?, ?, ?, ?, ?, ?, ?, ?, ?);
          `,
          [
            'minifig',
            selected.name,
            selected.rebrickable_id,
            selected.bricklink_id ?? null,
            selected.brickowl_id ?? null,
            selected.rebrickable_id,
            selectedContainerId,
            safeQty,
            selected.img_url ?? null,
          ]
        );
        const idRows = await db.getAllAsync<{ id: number }>(`SELECT last_insert_rowid() as id;`);
        targetId = idRows[0]?.id ?? null;
      } else {
        await db.runAsync(
          `
            UPDATE items
            SET qty = qty + ?, container_id = COALESCE(?, container_id)
            WHERE id = ?;
          `,
          [safeQty, selectedContainerId, targetId]
        );
      }
      await db.execAsync('COMMIT;');
      Alert.alert('Minifigure added', `${selected.name} added to your collection.`);
      if (onAdded) onAdded();
    } catch (error) {
      await db.execAsync('ROLLBACK;');
      console.error('Failed to add minifig', error);
      Alert.alert('Error', 'Failed to add minifigure.');
    }
  }

  const renderItem = ({ item }: { item: MinifigRow }) => {
    const displayId = getMinifigDisplayId(item as MinifigLike, marketStandard);
    const isActive = selected?.rebrickable_id === item.rebrickable_id;
    return (
      <TouchableOpacity
        style={[styles.resultRow, isActive && styles.resultRowActive]}
        onPress={() => setSelected(item)}
      >
        {item.img_url ? (
          <Image source={{ uri: item.img_url }} style={styles.resultThumb} />
        ) : (
          <View style={[styles.resultThumb, styles.resultThumbPlaceholder]}>
            <Text style={styles.resultThumbText}>FIG</Text>
          </View>
        )}
        <View style={{ flex: 1 }}>
          <Text style={styles.resultName}>{item.name}</Text>
          <Text style={styles.resultMeta}>{displayId}</Text>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: theme.colors.background }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <FlatList
        data={results}
        keyExtractor={item => item.rebrickable_id}
        renderItem={renderItem}
        ListHeaderComponent={
          <View style={styles.searchSection}>
            <Text style={styles.title}>Add Minifigure</Text>
            <Text style={styles.subtitle}>
              Search Rebrickable for minifigs and add them to your collection.
            </Text>
            <Input
              label="Search by ID or name"
              placeholder={placeholder}
              value={query}
              onChangeText={setQuery}
            />
            <Button label={searching ? 'Searching...' : 'Search'} onPress={handleSearch} disabled={searching} />
          </View>
        }
        ListEmptyComponent={
          searching ? (
            <View style={styles.emptyState}>
              <ActivityIndicator color={theme.colors.accent} />
              <Text style={styles.meta}>Searching...</Text>
            </View>
          ) : (
            <View style={styles.emptyState}>
              <Text style={styles.meta}>No results yet. Try a search.</Text>
            </View>
          )
        }
        contentContainerStyle={styles.listContent}
      />

      {selected ? (
        <View style={styles.addSection}>
          <View style={styles.selectedRow}>
            {selected.img_url ? (
              <Image source={{ uri: selected.img_url }} style={styles.selectedThumb} />
            ) : null}
            <View style={{ flex: 1 }}>
              <Text style={styles.selectedName}>{selected.name}</Text>
              <Text style={styles.resultMeta}>
                {getMinifigDisplayId(selected as MinifigLike, marketStandard)}
              </Text>
            </View>
          </View>
          <Input
            label="Quantity"
            value={quantity}
            onChangeText={text => setQuantity(text.replace(/\D+/g, ''))}
            keyboardType="number-pad"
            inputMode="numeric"
          />
          <ContainerPicker
            label="Container"
            selectedContainerId={selectedContainerId}
            onChange={setSelectedContainerId}
            allowCreateNew
          />
          <Button label="Add to Collection" onPress={handleAdd} />
        </View>
      ) : null}
    </KeyboardAvoidingView>
  );
}

function createStyles(theme: Theme) {
  const { colors } = theme;
  return StyleSheet.create({
    container: {
      flex: 1,
    },
    searchSection: {
      padding: layout.spacingLg,
      gap: layout.spacingSm,
      backgroundColor: colors.surface,
      borderBottomWidth: 1,
      borderColor: colors.border,
    },
    title: {
      fontSize: typography.title,
      fontWeight: '700',
      color: colors.text,
    },
    subtitle: {
      fontSize: typography.body,
      color: colors.textSecondary,
    },
    listContent: {
      paddingBottom: layout.spacingXl * 2,
    },
    resultRow: {
      flexDirection: 'row',
      alignItems: 'center',
      padding: layout.spacingSm,
      gap: layout.spacingSm,
      borderBottomWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.background,
    },
    resultRowActive: {
      backgroundColor: colors.primarySoft,
    },
    resultThumb: {
      width: 56,
      height: 56,
      borderRadius: layout.radiusSm,
      backgroundColor: colors.surface,
    },
    resultThumbPlaceholder: {
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      borderColor: colors.border,
    },
    resultThumbText: {
      color: colors.text,
      fontSize: typography.caption,
      fontWeight: '700',
    },
    resultName: {
      fontSize: typography.body,
      fontWeight: '600',
      color: colors.text,
    },
    resultMeta: {
      fontSize: typography.caption,
      color: colors.textMuted,
    },
    emptyState: {
      padding: layout.spacingLg,
      alignItems: 'center',
      gap: layout.spacingXs,
    },
    meta: {
      fontSize: typography.caption,
      color: colors.textMuted,
    },
    addSection: {
      borderTopWidth: 1,
      borderColor: colors.border,
      padding: layout.spacingMd,
      gap: layout.spacingSm,
      backgroundColor: colors.surface,
    },
    selectedRow: {
      flexDirection: 'row',
      gap: layout.spacingSm,
      alignItems: 'center',
    },
    selectedThumb: {
      width: 64,
      height: 64,
      borderRadius: layout.radiusSm,
      backgroundColor: colors.background,
      borderWidth: 1,
      borderColor: colors.border,
    },
    selectedName: {
      fontSize: typography.body,
      fontWeight: '700',
      color: colors.text,
    },
  });
}
