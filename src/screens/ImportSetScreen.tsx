import React, { useEffect, useMemo, useState } from 'react';
import { Modal, ScrollView, StyleSheet, View } from 'react-native';
import { Input } from '../components/Input';
import { Button } from '../components/Button';
import { getDb } from '../db/database';
import { layout } from '../theme/layout';
import { typography } from '../theme/typography';
import {
  fetchInventoryFromRebrickable,
  fetchSetMetadataFromRebrickable,
  type BuildPart,
} from '../services/inventoryImport/rebrickable';
import { upsertCatalogPartFromRebrickable } from '../db/catalogUpsert';
import { upsertCatalogColorFromRebrickable } from '../db/catalogUpsert';
import { useTheme, type Theme } from '../theme/ThemeProvider';
import { ThemedText as Text } from '../components/ThemedText';
import { ContainerPicker } from '../components/ContainerPicker';

type ImportSetScreenProps = {
  onImported?: (itemId: number) => void;
};

export default function ImportSetScreen({ onImported }: ImportSetScreenProps) {
  const [setNumber, setSetNumber] = useState('');
  const [selectedContainerId, setSelectedContainerId] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const invalidSetMessage =
    "No LEGO set by that number was found.\n\nMake sure you included the correct digits (like '75192' or '75192-1').";

  async function insertBuildParts(parentId: number, parts: BuildPart[]) {
    const db = await getDb();
    for (const p of parts) {
      const subtype = (p.componentSubtype || 'Part').toLowerCase();
      let catalogPartId: number | null = null;
      let catalogColorId: number | null = null;
      if (p.rebrickableId || p.designId) {
        try {
          // Ensure this Rebrickable part is present in the shared catalog and capture catalog_parts.id
          catalogPartId = await upsertCatalogPartFromRebrickable({
            id: (p.rebrickableId || p.designId || '').trim(),
            name: p.componentName || p.designId || '',
          });
        } catch (error) {
          console.warn('[ImportSet] catalog upsert failed', p.rebrickableId || p.designId, error);
        }
      }
      if (p.componentColorId && p.componentColorName) {
        try {
          // Ensure Rebrickable color is captured in catalog_colors for future local lookups
          catalogColorId = await upsertCatalogColorFromRebrickable({
            id: p.componentColorId,
            name: p.componentColorName,
          });
        } catch (error) {
          console.warn('[ImportSet] color catalog upsert failed', p.componentColorId, error);
        }
      }
      await db.runAsync(
        `
          INSERT INTO build_parts
            (parent_item_id, component_subtype, component_name, component_color, component_number, component_bricklink_id, component_brickowl_id, component_rebrickable_id, catalog_part_id, catalog_color_id, quantity, is_spare, image_uri)
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
          p.imageUrl || null,
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
        setErrorMessage(invalidSetMessage);
        return;
      }
      const theme = metadata.themeName ?? null;

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
            selectedContainerId,
            1,
            null,
            null,
            theme,
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
      setErrorMessage(invalidSetMessage);
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

        <ContainerPicker
          label="Container"
          selectedContainerId={selectedContainerId}
          onChange={setSelectedContainerId}
          allowCreateNew
        />

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
              {errorMessage ?? invalidSetMessage}
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

function createStyles(theme: Theme) {
  const { colors } = theme;
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    modalOverlay: {
      flex: 1,
      backgroundColor: colors.surfaceAlt ?? colors.background,
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
      color: colors.text,
      marginBottom: layout.spacingSm,
    },
    modalBody: {
      fontSize: typography.body,
      color: colors.text,
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
