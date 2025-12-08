import React, { useEffect, useMemo, useState } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  View,
} from 'react-native';
import { Input } from '../components/Input';
import { Button } from '../components/Button';
import { getDb } from '../db/database';
import { layout } from '../theme/layout';
import { typography } from '../theme/typography';
import { useTheme, type Theme } from '../theme/ThemeProvider';
import { ThemedText as Text } from '../components/ThemedText';
import { ContainerPicker } from '../components/ContainerPicker';
import {
  fetchPartColorsFromRebrickable,
  type RebrickablePartColor,
} from '../services/inventoryImport/rebrickable';
import { resolveCatalogColorById } from '../db/catalogColors';
import { upsertCatalogColorFromRebrickable } from '../db/catalogUpsert';

export type EditPartParams = {
  partId: string;
};

type EditPartScreenProps = {
  route?: { params?: EditPartParams };
  params?: EditPartParams;
  onSaved?: (item: EditableItem) => void;
  onDelete?: (id: number) => void;
};

type EditableItem = {
  id: number;
  name: string;
  type?: string | null;
  color: string | null;
  category: string | null;
  description: string | null;
  qty: number | null;
  container_id: number | null;
  number?: string | null;
  image_uri?: string | null;
  catalog_color_id?: number | null;
};

export default function EditPartScreen({
  route,
  params,
  onSaved,
  onDelete,
}: EditPartScreenProps) {
  const resolvedParams = route?.params ?? params;
  const partId = resolvedParams?.partId;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'success' | 'error'>(
    'idle'
  );

  const [name, setName] = useState('');
  const [itemType, setItemType] = useState<string>('');
  const [colorName, setColorName] = useState('');
  const [categoryName, setCategoryName] = useState('');
  const [description, setDescription] = useState('');
  const [quantity, setQuantity] = useState('');
  const [partNumber, setPartNumber] = useState('');
  const [partColors, setPartColors] = useState<RebrickablePartColor[]>([]);
  const [selectedColorId, setSelectedColorId] = useState<number | null>(null);
  const [catalogColorId, setCatalogColorId] = useState<number | null>(null);
  const [colorLoading, setColorLoading] = useState(false);
  const [colorModalVisible, setColorModalVisible] = useState(false);
  const [lastColorLookupPart, setLastColorLookupPart] = useState<string | null>(null);
  const [imageUri, setImageUri] = useState('');
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const [selectedContainerId, setSelectedContainerId] = useState<number | null>(
    null
  );

  async function loadItem(id: string): Promise<EditableItem | null> {
    const db = await getDb();
    const rows = await db.getAllAsync<EditableItem>(
      `
        SELECT
          id,
          name,
          type,
          color,
          category,
          description,
          qty,
          container_id,
          number,
          image_uri,
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
    if (!partId) {
      setError('Missing part id');
      setLoading(false);
      return;
    }

    let isMounted = true;
    (async () => {
      try {
        const record = await loadItem(partId);
        if (!isMounted) return;
        if (!record) {
          setError('Item not found');
          return;
        }
        setName(record.name ?? '');
        setItemType(record.type ?? '');
        if (record.catalog_color_id) {
          try {
            const resolved = await resolveCatalogColorById(record.catalog_color_id);
            if (!isMounted) return;
            setColorName(resolved?.name ?? record.color ?? '');
          } catch (err) {
            console.warn('[EditPart] Failed to resolve catalog color', err);
            setColorName(record.color ?? '');
          }
        } else {
          setColorName(record.color ?? '');
        }
        setCategoryName(record.category ?? '');
        setDescription(record.description ?? '');
        setQuantity(
          record.qty != null && !Number.isNaN(record.qty)
            ? String(record.qty)
            : ''
        );
        setPartNumber(record.number ?? '');
        setImageUri(record.image_uri ?? '');
        setSelectedContainerId(
          record.container_id != null ? Number(record.container_id) : null
        );
        setCatalogColorId(record.catalog_color_id ?? null);
        setError(null);
      } catch (e: any) {
        console.error(e);
        if (isMounted) {
          setError(e?.message ?? 'Failed to load item');
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
  }, [partId]);

  async function loadPartColors(partNum: string) {
    const trimmed = partNum.trim();
    if (!trimmed) {
      setPartColors([]);
      setSelectedColorId(null);
      setLastColorLookupPart(null);
      return;
    }
    if (trimmed === lastColorLookupPart && partColors.length > 0) {
      return;
    }
    setColorLoading(true);
    setPartColors([]);
    setSelectedColorId(null);
    try {
      const colors = await fetchPartColorsFromRebrickable(trimmed);
      setPartColors(colors);
      setLastColorLookupPart(trimmed);
      if (colors.length === 1) {
        const only = colors[0];
        setSelectedColorId(only.colorId);
        setColorName(only.name);
        setColorModalVisible(false);
      }
    } catch (err) {
      console.warn('[EditPart] Failed to load colors', { partNum: trimmed }, err);
      setPartColors([]);
      setSelectedColorId(null);
    } finally {
      setColorLoading(false);
    }
  }


  async function handleSave() {
    if (!partId) return;
    setSaving(true);
    setError(null);
    setSaveStatus('idle');

    try {
      const db = await getDb();
      const trimmedName = name.trim();
      if (!trimmedName) {
        throw new Error('Name is required');
      }
      const parsedQty = parseInt(quantity, 10);
      const resolvedQty = Number.isNaN(parsedQty) ? 0 : parsedQty;
      let catalogColorIdToSave = catalogColorId;
      if (selectedColorId) {
        const matchedColor = partColors.find(c => c.colorId === selectedColorId);
        if (matchedColor) {
          try {
            catalogColorIdToSave = await upsertCatalogColorFromRebrickable({
              id: matchedColor.colorId,
              name: matchedColor.name,
            });
          } catch (error) {
            console.warn('[EditPart] catalog color upsert failed', matchedColor.colorId, error);
          }
        }
      }
      const colorValue = colorName.trim() || null;

      await db.runAsync(
        `
          UPDATE items
          SET
            name = ?,
            color = ?,
            category = ?,
            description = ?,
            qty = ?,
            container_id = ?,
            image_uri = ?,
            catalog_color_id = ?
          WHERE id = ?;
        `,
        [
          trimmedName,
          colorValue,
          categoryName.trim() || null,
          description.trim() || null,
          resolvedQty,
          selectedContainerId,
          imageUri.trim() || null,
          catalogColorIdToSave,
          partId,
        ]
      );

      const parsedId = Number(partId);
      const safeId = Number.isNaN(parsedId) ? 0 : parsedId;
      onSaved?.({
        id: safeId,
        name: trimmedName,
        color: colorName.trim() || null,
        category: categoryName.trim() || null,
        description: description.trim() || null,
        qty: resolvedQty,
        container_id: selectedContainerId,
        image_uri: imageUri.trim() || null,
      });
      setSaveStatus('success');
    } catch (e: any) {
      console.error(e);
      setError(e?.message ?? 'Failed to save changes');
      setSaveStatus('error');
    } finally {
      setSaving(false);
    }
  }

  const statusMessage =
    saveStatus === 'success'
      ? 'Saved successfully'
      : saveStatus === 'error'
      ? 'Save failed'
      : null;
  const isSetType = useMemo(() => {
    const t = (itemType ?? '').trim().toLowerCase();
    return t === 'set' || t === 'moc';
  }, [itemType]);

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
      >
        <View style={styles.card}>
          <Text style={styles.title}>Edit Part</Text>
          <Text style={styles.subtitle}>
            ID: {partId ?? 'Unknown'}
          </Text>

          {error ? <Text style={styles.errorText}>{error}</Text> : null}
          {statusMessage && !error ? (
            <Text
              style={[
                styles.statusText,
                saveStatus === 'success'
                  ? styles.statusSuccess
                  : styles.errorText,
              ]}
            >
              {statusMessage}
            </Text>
          ) : null}

          <Input
            label="Name"
            value={name}
            editable={!loading}
            onChangeText={setName}
            placeholder="Enter name"
          />
          {!isSetType ? (
            <Input
              label="Color"
              value={colorName}
              editable={!loading}
              onChangeText={setColorName}
              onFocus={async () => {
                if (partNumber.trim()) {
                  await loadPartColors(partNumber);
                }
                setColorModalVisible(true);
              }}
              placeholder="Enter color"
            />
          ) : null}
          {!isSetType ? (
            <Button
              label={colorLoading ? 'Loading colors...' : 'Choose color'}
              variant="outline"
              disabled={colorLoading || !partNumber.trim()}
              onPress={async () => {
                if (partNumber.trim()) {
                  await loadPartColors(partNumber);
                }
                setColorModalVisible(true);
              }}
            />
          ) : null}
          <Input
          label={isSetType ? 'Theme' : 'Category'}
          value={categoryName}
          editable={!loading}
          onChangeText={setCategoryName}
          placeholder={isSetType ? 'Enter theme' : 'Enter category'}
        />
        <Input
          label="Image URL"
          value={imageUri}
          editable={!loading}
            onChangeText={setImageUri}
            placeholder="https://example.com/image.jpg (optional)"
            autoCapitalize="none"
            autoCorrect={false}
          />
          <Input
            label="Quantity"
            value={quantity}
            editable={!loading}
            onChangeText={text => setQuantity(text.replace(/\D+/g, ''))}
            keyboardType="number-pad"
            inputMode="numeric"
            placeholder="0"
          />
          <ContainerPicker
            label="Container"
            selectedContainerId={selectedContainerId}
            onChange={setSelectedContainerId}
            allowCreateNew
          />

          <Button
            label={saving ? 'Saving...' : 'Save'}
            onPress={handleSave}
            disabled={saving || loading}
            style={styles.saveButton}
          />
          <Button
            label="Delete"
            variant="danger"
            onPress={() => {
              if (!partId) return;
              const parsedId = Number(partId);
              if (Number.isNaN(parsedId)) return;
              onDelete?.(parsedId);
            }}
            style={styles.saveButton}
          />
        </View>
      </ScrollView>

      <Modal
        visible={colorModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setColorModalVisible(false)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setColorModalVisible(false)}
        >
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Select Color</Text>
            {colorLoading ? <Text style={styles.modalBody}>Loading colors...</Text> : null}
            {partColors.length === 0 && !colorLoading ? (
              <Text style={styles.modalBody}>No colors yet. Enter a color manually.</Text>
            ) : null}
            {partColors.map(option => {
              const isActive = option.colorId === selectedColorId;
              return (
                <TouchableOpacity
                  key={option.colorId}
                  style={[styles.optionRow, isActive && styles.optionRowActive]}
                  onPress={() => {
                    setSelectedColorId(option.colorId);
                    setColorName(option.name);
                    setColorModalVisible(false);
                  }}
                >
                  <Text style={[styles.optionText, isActive && styles.optionTextActive]}>
                    {option.name}
                  </Text>
                </TouchableOpacity>
              );
            })}
            <Button label="Close" variant="outline" onPress={() => setColorModalVisible(false)} />
          </View>
        </TouchableOpacity>
      </Modal>
    </KeyboardAvoidingView>
  );
}

function createStyles(theme: Theme) {
  const { colors } = theme;
  return StyleSheet.create({
    flex: {
      flex: 1,
    },
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    content: {
      padding: layout.spacingLg,
      paddingBottom: layout.spacingXl * 2,
      flexGrow: 1,
    },
    modalOverlay: {
      flex: 1,
      backgroundColor: '#00000066',
      justifyContent: 'center',
      padding: layout.spacingLg,
    },
    modalCard: {
      backgroundColor: colors.surface,
      borderRadius: layout.radiusLg,
      padding: layout.spacingLg,
      borderWidth: 1,
      borderColor: colors.border,
      gap: layout.spacingSm,
    },
    modalTitle: {
      fontSize: typography.sectionTitle,
      fontWeight: '700',
      color: colors.text,
    },
    modalBody: {
      fontSize: typography.body,
      color: colors.textSecondary,
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
      fontSize: typography.caption,
      color: colors.textSecondary,
    },
    errorText: {
      color: colors.danger,
      fontSize: typography.caption,
    },
    statusText: {
      fontSize: typography.caption,
      color: colors.textSecondary,
    },
    statusSuccess: {
      color: colors.accent,
    },
  multilineInput: {
    minHeight: 90,
    textAlignVertical: 'top',
  },
    saveButton: {
      marginTop: layout.spacingSm,
    },
    optionRow: {
      paddingVertical: layout.spacingSm,
      paddingHorizontal: layout.spacingSm,
      borderRadius: layout.radiusSm,
      borderWidth: 1,
      borderColor: colors.border,
      marginTop: layout.spacingXs,
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









