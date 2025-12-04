import React, { useEffect, useMemo, useState } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Input } from '../components/Input';
import { Button } from '../components/Button';
import { getDb } from '../db/database';
import { layout } from '../theme/layout';
import { typography } from '../theme/typography';
import { useTheme, type Theme } from '../theme/ThemeProvider';

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
  image_uri?: string | null;
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
  const [imageUri, setImageUri] = useState('');
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const [selectedContainerId, setSelectedContainerId] = useState<number | null>(
    null
  );
  const [containers, setContainers] = useState<
    { id: number; name: string; roomName?: string | null }[]
  >([]);
  const [containerPickerVisible, setContainerPickerVisible] = useState(false);

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
          image_uri
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
        setColorName(record.color ?? '');
        setCategoryName(record.category ?? '');
        setDescription(record.description ?? '');
        setQuantity(
          record.qty != null && !Number.isNaN(record.qty)
            ? String(record.qty)
            : ''
        );
        setImageUri(record.image_uri ?? '');
        setSelectedContainerId(
          record.container_id != null ? Number(record.container_id) : null
        );
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
            LEFT JOIN rooms r ON r.id = c.room_id
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

  const containerLabel = useMemo(() => {
    if (selectedContainerId == null) return 'No container';
    const match = containers.find(c => c.id === selectedContainerId);
    if (!match) return 'No container';
    return match.roomName ? `${match.roomName} - ${match.name}` : match.name;
  }, [containers, selectedContainerId]);

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
            image_uri = ?
          WHERE id = ?;
        `,
        [
          trimmedName,
          colorName.trim() || null,
          categoryName.trim() || null,
          description.trim() || null,
          resolvedQty,
          selectedContainerId,
          imageUri.trim() || null,
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
              placeholder="Enter color"
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
          <TouchableOpacity
            style={styles.selector}
            disabled={loading}
            onPress={() => setContainerPickerVisible(true)}
          >
            <Text style={styles.selectorLabel}>Container</Text>
            <Text style={styles.selectorValue}>{containerLabel}</Text>
          </TouchableOpacity>

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
        visible={containerPickerVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setContainerPickerVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <TouchableOpacity
            style={styles.modalBackdrop}
            activeOpacity={1}
            onPress={() => setContainerPickerVisible(false)}
          />
          <View style={styles.modalCard}>
            <TouchableOpacity
              style={[
                styles.optionRow,
                selectedContainerId == null && styles.optionRowActive,
              ]}
              onPress={() => {
                setSelectedContainerId(null);
                setContainerPickerVisible(false);
              }}
            >
              <Text
                style={[
                  styles.optionText,
                  selectedContainerId == null && styles.optionTextActive,
                ]}
              >
                No container
              </Text>
            </TouchableOpacity>
            {containers.map(option => {
              const isActive = option.id === selectedContainerId;
              const label = option.roomName
                ? `${option.roomName} - ${option.name}`
                : option.name;
              return (
                <TouchableOpacity
                  key={option.id}
                  style={[styles.optionRow, isActive && styles.optionRowActive]}
                  onPress={() => {
                    setSelectedContainerId(option.id);
                    setContainerPickerVisible(false);
                  }}
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
        </View>
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
});
}









