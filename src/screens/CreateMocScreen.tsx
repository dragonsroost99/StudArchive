import React, { useEffect, useMemo, useState } from 'react';
import { Alert, ScrollView, StyleSheet, View } from 'react-native';
import { Input } from '../components/Input';
import { Button } from '../components/Button';
import { getDb } from '../db/database';
import { layout } from '../theme/layout';
import { typography } from '../theme/typography';
import { useTheme, type Theme } from '../theme/ThemeProvider';
import { ThemedText as Text } from '../components/ThemedText';
import { ContainerPicker } from '../components/ContainerPicker';

type CreateMocScreenProps = {
  onCreated?: (itemId: number) => void;
};

export default function CreateMocScreen({ onCreated }: CreateMocScreenProps) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [selectedContainerId, setSelectedContainerId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);

  async function handleSave() {
    const trimmedName = name.trim();
    if (!trimmedName) {
      Alert.alert('Name required', 'Enter a MOC name to continue.');
      return;
    }
    setSaving(true);
    try {
      const db = await getDb();
      await db.runAsync(
        `
          INSERT INTO items
            (type, name, number, container_id, qty, condition, color, category, description, value_each, value_total, image_uri)
          VALUES
            (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
        `,
        [
          'moc',
          trimmedName,
          null,
          selectedContainerId,
          1,
          null,
          null,
          null,
          description.trim() || null,
          null,
          null,
          null,
        ]
      );

      const idRows = await db.getAllAsync<{ id: number }>(
        `SELECT last_insert_rowid() AS id;`
      );
      const newItemId = idRows[0]?.id;
      if (!newItemId) {
        throw new Error('Failed to create MOC');
      }

      setName('');
      setDescription('');
      if (onCreated) {
        onCreated(newItemId);
      }
    } catch (error) {
      console.error('Create MOC failed', error);
      Alert.alert('Save failed', 'Could not create this MOC. Please try again.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.card}>
        <Text style={styles.title}>Create MOC</Text>
        <Text style={styles.subtitle}>
          Add a new custom creation. You can manage its inventory after saving.
        </Text>

        <Input
          label="MOC name"
          value={name}
          onChangeText={setName}
          placeholder="My Custom Falcon"
        />

        <ContainerPicker
          label="Container"
          selectedContainerId={selectedContainerId}
          onChange={setSelectedContainerId}
          allowCreateNew
        />

        <Button
          label={saving ? 'Saving...' : 'Save MOC'}
          onPress={handleSave}
          disabled={saving}
        />
      </View>
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
    actionsRow: {
      flexDirection: 'row',
      gap: layout.spacingSm,
      marginTop: layout.spacingSm,
    },
  });
}
