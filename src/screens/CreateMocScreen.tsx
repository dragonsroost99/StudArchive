import React, { useEffect, useMemo, useState } from 'react';
import {
  Alert,
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

type CreateMocScreenProps = {
  onCreated?: (itemId: number) => void;
};

type ContainerRow = { id: number; name: string };

export default function CreateMocScreen({ onCreated }: CreateMocScreenProps) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [containers, setContainers] = useState<ContainerRow[]>([]);
  const [selectedContainerId, setSelectedContainerId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);

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
          selectedContainerId === -1 ? null : selectedContainerId,
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
        <Input
          label="Description / notes"
          value={description}
          onChangeText={setDescription}
          placeholder="Optional details"
          multiline
          numberOfLines={3}
          style={styles.multiline}
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
          label={saving ? 'Saving...' : 'Save MOC'}
          onPress={handleSave}
          disabled={saving}
        />
      </View>
    </ScrollView>
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
  multiline: {
    minHeight: 90,
    textAlignVertical: 'top',
  },
});
