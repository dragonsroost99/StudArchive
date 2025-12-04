import React, { useEffect, useMemo, useState } from 'react';
import { ScrollView, View, Text, StyleSheet, Image } from 'react-native';
import { Button } from '../components/Button';
import { getDb } from '../db/database';
import { layout } from '../theme/layout';
import { typography } from '../theme/typography';
import { useTheme, type Theme } from '../theme/ThemeProvider';
import { fetchAndCacheThumbnail, getThumbnail } from '../services/thumbnailStore';

type BuildComponentDetailParams = {
  buildPartId: number;
  parentItemId: number;
};

type BuildPartRecord = {
  id: number;
  parent_item_id: number;
  component_subtype: string | null;
  component_name: string | null;
  component_number: string | null;
  component_color: string | null;
  quantity: number | null;
  component_description?: string | null;
  image_uri?: string | null;
};

type ParentItemRecord = {
  id: number;
  name: string | null;
  image_uri: string | null;
  type: string | null;
};

type BuildComponentDetailScreenProps = {
  route?: { params?: BuildComponentDetailParams };
  params?: BuildComponentDetailParams;
  onClose?: () => void;
  onHome?: () => void;
};

export default function BuildComponentDetailScreen({
  route,
  params,
  onClose,
  onHome,
}: BuildComponentDetailScreenProps) {
  const resolvedParams = route?.params ?? params;
  const buildPartId = resolvedParams?.buildPartId;
  const parentItemId = resolvedParams?.parentItemId;

  const [component, setComponent] = useState<BuildPartRecord | null>(null);
  const [parentItem, setParentItem] = useState<ParentItemRecord | null>(null);
  const [imageUri, setImageUri] = useState<string | null>(null);
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);

  useEffect(() => {
    let isMounted = true;
    (async () => {
      if (!buildPartId || !parentItemId) return;
      try {
        const db = await getDb();
        const [componentRow] = await db.getAllAsync<BuildPartRecord>(
          `
            SELECT
              id,
              parent_item_id,
              component_subtype,
              component_name,
              component_number,
              component_color,
              component_description,
              image_uri,
              quantity
            FROM build_parts
            WHERE id = ? AND parent_item_id = ?;
          `,
          [buildPartId, parentItemId]
        );
        const [parentRow] = await db.getAllAsync<ParentItemRecord>(
          `
            SELECT id, name, image_uri, type
            FROM items
            WHERE id = ?;
          `,
          [parentItemId]
        );
        if (!isMounted) return;
        setComponent(componentRow ?? null);
        setParentItem(parentRow ?? null);
      } catch (error) {
        console.error('Failed to load build component detail', error);
      }
    })();
    return () => {
      isMounted = false;
    };
  }, [buildPartId, parentItemId]);

  const isMinifig = useMemo(() => {
    const subtype = (component?.component_subtype ?? '').toLowerCase();
    return subtype === 'minifigure' || subtype === 'minifig';
  }, [component?.component_subtype]);

  useEffect(() => {
    if (!component) return;
    const desc = component.component_description ?? '';
    if (component.image_uri) {
      setImageUri(component.image_uri);
      return;
    }
    if (desc && desc.startsWith('http')) {
      setImageUri(desc);
      return;
    }
    let cancelled = false;
    (async () => {
      const designId = (component.component_number ?? '').trim();
      if (!designId) return;
      const colorValue = component.component_color ?? null;
      try {
        const cached = await getThumbnail(designId, colorValue);
        if (cancelled) return;
        if (cached !== null) {
          setImageUri(cached || null);
          return;
        }
        const fetched = await fetchAndCacheThumbnail(designId, colorValue);
        if (!cancelled) {
          setImageUri(fetched || null);
        }
      } catch (error) {
        console.warn('[BuildComponentDetail] Failed to resolve thumbnail', designId, error);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [component, isMinifig]);

  const designIdLabel = isMinifig ? 'Fig ID' : 'Part ID';

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.card}>
        <View
          style={[
            styles.imageWrapper,
            isMinifig ? styles.imageWrapperMinifig : styles.imageWrapperPart,
          ]}
        >
          {imageUri ? (
            <Image
              source={{ uri: imageUri }}
              style={[
                styles.detailImage,
                isMinifig ? styles.detailImageCover : styles.detailImageContain,
              ]}
            />
          ) : (
            <View style={styles.imagePlaceholder}>
              <Text style={styles.placeholderText}>No image</Text>
            </View>
          )}
        </View>

        <Text style={styles.title}>{component?.component_name ?? 'Component'}</Text>
        <Text style={styles.subtitle}>
          {isMinifig ? 'Minifigure' : 'Part'}
        </Text>

        <View style={styles.metaRow}>
          <Text style={styles.metaLabel}>{designIdLabel}</Text>
          <Text style={styles.metaValue}>
            {component?.component_number ?? 'N/A'}
          </Text>
        </View>
        {!isMinifig ? (
          <View style={styles.metaRow}>
            <Text style={styles.metaLabel}>Color</Text>
            <Text style={styles.metaValue}>
              {component?.component_color ?? 'Unknown'}
            </Text>
          </View>
        ) : null}
        <View style={styles.metaRow}>
          <Text style={styles.metaLabel}>Quantity in this build</Text>
          <Text style={styles.metaValue}>
            {component?.quantity ?? 0}
          </Text>
        </View>
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Parent set / MOC</Text>
        <View style={styles.parentRow}>
          <View style={styles.parentImageWrapper}>
            {parentItem?.image_uri ? (
              <Image
                source={{ uri: parentItem.image_uri }}
                style={styles.parentImage}
                resizeMode="contain"
              />
            ) : (
              <View style={styles.parentPlaceholder}>
                <Text style={styles.placeholderText}>No image</Text>
              </View>
            )}
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.parentName}>
              {parentItem?.name ?? 'Unknown parent'}
            </Text>
            <Text style={styles.parentMeta}>
              {(parentItem?.type ?? 'Set').toUpperCase()}
            </Text>
          </View>
        </View>
        <View style={styles.actionRow}>
          <Button label="Back" variant="outline" onPress={onClose} />
          <Button label="Home" variant="outline" onPress={onHome} />
        </View>
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
      gap: layout.spacingLg,
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
      borderRadius: layout.radiusMd,
      overflow: 'hidden',
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surfaceAlt ?? colors.background,
      alignItems: 'center',
      justifyContent: 'center',
    },
    imageWrapperPart: {
      aspectRatio: 1.6,
    },
    imageWrapperMinifig: {
      aspectRatio: 1,
    },
    detailImage: {
      width: '100%',
      height: '100%',
    },
    detailImageContain: {
      resizeMode: 'contain',
    },
    detailImageCover: {
      resizeMode: 'cover',
    },
    imagePlaceholder: {
      width: '100%',
      height: '100%',
      alignItems: 'center',
      justifyContent: 'center',
      padding: layout.spacingMd,
    },
    placeholderText: {
      color: colors.textSecondary,
      fontSize: typography.caption,
    },
    title: {
      fontSize: typography.sectionTitle,
      fontWeight: '700',
      color: colors.text,
    },
    subtitle: {
      fontSize: typography.body,
      color: colors.textSecondary,
    },
    metaRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      paddingVertical: layout.spacingXs,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    metaLabel: {
      fontSize: typography.caption,
      color: colors.textSecondary,
    },
    metaValue: {
      fontSize: typography.body,
      color: colors.text,
      fontWeight: '600',
    },
    sectionTitle: {
      fontSize: typography.sectionTitle,
      fontWeight: '700',
      color: colors.text,
      marginBottom: layout.spacingSm,
    },
    parentRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: layout.spacingMd,
    },
    parentImageWrapper: {
      width: 96,
      height: 72,
      borderRadius: layout.radiusSm,
      overflow: 'hidden',
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surfaceAlt ?? colors.background,
    },
    parentImage: {
      width: '100%',
      height: '100%',
      resizeMode: 'contain',
    },
    parentPlaceholder: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.surfaceAlt ?? colors.background,
    },
    parentName: {
      fontSize: typography.body,
      color: colors.text,
      fontWeight: '700',
    },
    parentMeta: {
      fontSize: typography.caption,
      color: colors.textSecondary,
    },
    actionRow: {
      flexDirection: 'row',
      justifyContent: 'flex-end',
      gap: layout.spacingSm,
      marginTop: layout.spacingSm,
    },
  });
}


