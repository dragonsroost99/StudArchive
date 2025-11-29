import React, { useEffect, useMemo, useState } from 'react';
import {
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Input } from '../components/Input';
import { Button } from '../components/Button';
import { getDb } from '../db/database';
import { colors } from '../theme/colors';
import { layout } from '../theme/layout';
import { typography } from '../theme/typography';
import {
  fetchInventoryFromRebrickable,
  fetchSetMetadataFromRebrickable,
  type BuildPart,
} from '../services/inventoryImport/rebrickable';

type ImportSetScreenProps = {
  onImported?: (itemId: number) => void;
};

type ContainerRow = { id: number; name: string };

export default function ImportSetScreen({ onImported }: ImportSetScreenProps) {
  const [setNumber, setSetNumber] = useState('');
  const [containers, setContainers] = useState<ContainerRow[]>([]);
  const [selectedContainerId, setSelectedContainerId] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;
    (async () => {
      try {
        const db = await getDb();
        const rows = await db.getAllAsync<ContainerRow>(
          `
            SELECT id, name
            FROM containers
            ORDER BY name ASC;
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

  const containerOptions = useMemo(
    () => [{ id: -1, name: 'No container' }, ...containers],
    [containers]
  );

  async function insertBuildParts(parentId: number, parts: BuildPart[]) {
    const db = await getDb();
    for (const p of parts) {
      const subtype = (p.componentSubtype || 'Part').toLowerCase();
      await db.runAsync(
        `
          INSERT INTO build_parts
            (parent_item_id, component_subtype, component_name, component_color, component_number, quantity, is_spare)
          VALUES
            (?, ?, ?, ?, ?, ?, ?);
        `,
        [
          parentId,
          subtype,
          p.componentName || null,
          p.componentColorName || null,
          p.designId || null,
          p.quantity ?? 0,
          p.isSpare ? 1 : 0,
        ]
      );
    }
  }

  async function handleImport() {
    const trimmed = setNumber.trim();
    if (!trimmed) {
      setErrorMessage('Enter a set number to import.');
      return;
    }
    setLoading(true);
    setErrorMessage(null);
    try {
      const [metadata, parts] = await Promise.all([
        fetchSetMetadataFromRebrickable(trimmed),
        fetchInventoryFromRebrickable(trimmed),
      ]);

      if (!metadata || !parts || parts.length === 0) {
        setErrorMessage('Could not import this set. Check the set number and try again.');
        return;
      }

      const db = await getDb();
      await db.execAsync('BEGIN TRANSACTION;');
      try {
        await db.runAsync(
          `
            INSERT INTO items
              (type, name, number, container_id, qty, condition, color, category, description, value_each, value_total, image_uri)
            VALUES
              (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
          `,
          [
            'set',
            metadata.name ?? trimmed,
            metadata.setNum ?? trimmed,
            selectedContainerId === -1 ? null : selectedContainerId,
            1,
            null,
            null,
            null,
            null,
            null,
            null,
            metadata.imageUrl ?? null,
          ]
        );

        const idRows = await db.getAllAsync<{ id: number }>(
          `SELECT last_insert_rowid() AS id;`
        );
        const newItemId = idRows[0]?.id;
        if (!newItemId) {
          throw new Error('Failed to create set record');
        }

        await insertBuildParts(newItemId, parts);
        await db.execAsync('COMMIT;');
        setSetNumber('');
        setErrorMessage(null);
        if (onImported) {
          onImported(newItemId);
        }
      } catch (error) {
        await db.execAsync('ROLLBACK;');
        throw error;
      }
    } catch (error) {
      console.error('Import set failed', error);
      setErrorMessage('Could not import this set. Check the set number and try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.card}>
        <Text style={styles.title}>Import Set</Text>
        <Text style={styles.subtitle}>
          Enter a Rebrickable set number, choose a container, and we will import the set details
          and inventory into StudArchive.
        </Text>

        <Input
          label="Set number"
          value={setNumber}
          onChangeText={setSetNumber}
          placeholder="e.g. 75192 or 75192-1"
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="number-pad"
          inputMode="numeric"
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
                    {option.name}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        <Button
          label={loading ? 'Importing...' : 'Import from Rebrickable'}
          onPress={handleImport}
          disabled={loading}
        />
      </View>

      <Modal
        visible={!!errorMessage}
        transparent
        animationType="fade"
        onRequestClose={() => setErrorMessage(null)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Import Error</Text>
            <Text style={styles.modalBody}>
              {errorMessage ??
                'Could not import this set. Check the set number and try again.'}
            </Text>
            <Button
              label="OK"
              onPress={() => setErrorMessage(null)}
              style={{ marginTop: layout.spacingSm }}
            />
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: colors.modalBackdrop,
    justifyContent: 'center',
    alignItems: 'center',
    padding: layout.spacingLg,
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
  modalBody: {
    fontSize: typography.body,
    color: colors.text,
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
  title: {
    fontSize: typography.title,
    fontWeight: '700',
    color: colors.heading,
  },
  subtitle: {
    fontSize: typography.body,
    color: colors.text,
    lineHeight: typography.body + 4,
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
    color: colors.textMuted,
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
});
