import React, { useEffect, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Input } from '../components/Input';
import { Button } from '../components/Button';
import { getDb } from '../db/database';
import { colors } from '../theme/colors';
import { layout } from '../theme/layout';
import { typography } from '../theme/typography';

export type EditPartParams = {
  partId: string;
};

type EditPartScreenProps = {
  route?: { params?: EditPartParams };
  params?: EditPartParams;
  onSaved?: (item: EditableItem) => void;
};

type EditableItem = {
  id: number;
  name: string;
  color: string | null;
  category: string | null;
  description: string | null;
  qty: number | null;
};

export default function EditPartScreen({
  route,
  params,
  onSaved,
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
  const [colorName, setColorName] = useState('');
  const [categoryName, setCategoryName] = useState('');
  const [description, setDescription] = useState('');
  const [quantity, setQuantity] = useState('');
  const [hasTypedName, setHasTypedName] = useState(false);
  const [hasTypedColor, setHasTypedColor] = useState(false);
  const [hasTypedCategory, setHasTypedCategory] = useState(false);
  const [hasTypedDescription, setHasTypedDescription] = useState(false);
  const [hasTypedQuantity, setHasTypedQuantity] = useState(false);

  function handleFirstType(
    incoming: string,
    currentValue: string,
    hasTyped: boolean,
    markTyped: (value: boolean) => void,
    setter: (value: string) => void
  ) {
    if (!hasTyped) {
      const delta = incoming.startsWith(currentValue)
        ? incoming.slice(currentValue.length)
        : incoming;
      markTyped(true);
      setter(delta);
      return;
    }
    setter(incoming);
  }

  async function loadItem(id: string): Promise<EditableItem | null> {
    const db = await getDb();
    const rows = await db.getAllAsync<EditableItem>(
      `
        SELECT
          id,
          name,
          color,
          category,
          description,
          qty
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
        setColorName(record.color ?? '');
        setCategoryName(record.category ?? '');
        setDescription(record.description ?? '');
        setQuantity(
          record.qty != null && !Number.isNaN(record.qty)
            ? String(record.qty)
            : ''
        );
        setHasTypedName(false);
        setHasTypedColor(false);
        setHasTypedCategory(false);
        setHasTypedDescription(false);
        setHasTypedQuantity(false);
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
            qty = ?
          WHERE id = ?;
        `,
        [
          trimmedName,
          colorName.trim() || null,
          categoryName.trim() || null,
          description.trim() || null,
          resolvedQty,
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

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
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
            onChangeText={text =>
              handleFirstType(
                text,
                name,
                hasTypedName,
                setHasTypedName,
                setName
              )
            }
            placeholder="Enter name"
          />
          <Input
            label="Color"
            value={colorName}
            editable={!loading}
            onChangeText={text =>
              handleFirstType(
                text,
                colorName,
                hasTypedColor,
                setHasTypedColor,
                setColorName
              )
            }
            placeholder="Enter color"
          />
          <Input
            label="Category"
            value={categoryName}
            editable={!loading}
            onChangeText={text =>
              handleFirstType(
                text,
                categoryName,
                hasTypedCategory,
                setHasTypedCategory,
                setCategoryName
              )
            }
            placeholder="Enter category"
          />
          <Input
            label="Description"
            value={description}
            editable={!loading}
            onChangeText={text =>
              handleFirstType(
                text,
                description,
                hasTypedDescription,
                setHasTypedDescription,
                setDescription
              )
            }
            placeholder="Enter description"
            multiline
            numberOfLines={3}
            style={styles.multilineInput}
          />
          <Input
            label="Quantity"
            value={quantity}
            editable={!loading}
            onChangeText={text =>
              handleFirstType(
                text.replace(/\D+/g, ''),
                quantity,
                hasTypedQuantity,
                setHasTypedQuantity,
                setQuantity
              )
            }
            keyboardType="number-pad"
            inputMode="numeric"
            placeholder="0"
          />

          <Button
            label={saving ? 'Saving...' : 'Save'}
            onPress={handleSave}
            disabled={saving || loading}
            style={styles.saveButton}
          />
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    padding: layout.spacingLg,
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
    color: colors.heading,
  },
  subtitle: {
    fontSize: typography.caption,
    color: colors.textMuted,
  },
  errorText: {
    color: colors.danger,
    fontSize: typography.caption,
  },
  statusText: {
    fontSize: typography.caption,
    color: colors.textMuted,
  },
  statusSuccess: {
    color: colors.primary,
  },
  multilineInput: {
    minHeight: 90,
    textAlignVertical: 'top',
  },
  saveButton: {
    marginTop: layout.spacingSm,
  },
});
