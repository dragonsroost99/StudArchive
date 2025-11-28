import React, { useEffect, useState } from 'react';
import { ScrollView, View, Text, StyleSheet } from 'react-native';
import { Button } from '../components/Button';
import { getDb } from '../db/database';
import { colors } from '../theme/colors';
import { layout } from '../theme/layout';
import { typography } from '../theme/typography';

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
};

type PartRecord = {
  id?: number | string | null;
  name?: string | null;
  number?: string | null;
  qty?: number | null;
  quantity?: number | null;
  color?: string | null;
  color_name?: string | null;
  category_name?: string | null;
  description?: string | null;
  desc?: string | null;
};

export default function PartDetailScreen({
  route,
  params,
  onEditPress,
  refreshKey = 0,
}: PartDetailScreenProps) {
  const resolvedParams = route?.params ?? params;
  const partId = resolvedParams?.partId;
  const [part, setPart] = useState<PartRecord | null>(null);

  async function loadPartById(id: string): Promise<PartRecord | null> {
    const db = await getDb();
    const rows = await db.getAllAsync<PartRecord>(
      `
        SELECT
          id,
          name,
          number,
          qty,
          qty AS quantity,
          color,
          color AS color_name,
          category AS category_name,
          description,
          description AS desc
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
          setPart(record ?? null);
        }
      } catch (error) {
        console.error(error);
        if (isMounted) {
          setPart(null);
        }
      }
    })();

    return () => {
      isMounted = false;
    };
  }, [partId, refreshKey]);

  const title =
    part?.name ?? resolvedParams?.partName ?? 'Part Name (placeholder)';
  const subtitle =
    (typeof part?.number === 'string' && part.number) ??
    (part?.id != null ? String(part.id) : null) ??
    resolvedParams?.partId ??
    'Set / Part number goes here';
  const resolvedQty = part?.qty ?? part?.quantity ?? resolvedParams?.quantity;
  const quantity =
    resolvedQty != null ? resolvedQty.toString() : '���������?"';
  const color =
    part?.color ?? part?.color_name ?? resolvedParams?.colorName ?? '���������?"';
  const category =
    part?.category_name ??
    'Category not set';
  const description =
    part?.description ??
    part?.desc ??
    'No description provided yet.';

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
    >
      <View style={styles.card}>
        <View style={styles.headerRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.title}>{title}</Text>
            <Text style={styles.subtitle}>{subtitle}</Text>
          </View>
          <Button
            label="Edit"
            variant="outline"
            onPress={() => {
              if (partId) {
                onEditPress?.({
                  partId,
                  partName: title,
                  colorName: color,
                  quantity: resolvedQty ?? undefined,
                });
              }
            }}
          />
        </View>
        <View style={styles.divider} />
        <View style={styles.detailsSection}>
          <Text style={styles.sectionTitle}>Details</Text>
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Category</Text>
            <Text style={styles.detailValue}>{category}</Text>
          </View>
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Description</Text>
            <Text style={styles.detailValue}>{description}</Text>
          </View>
        </View>

        <View style={styles.statsSection}>
          <Text style={styles.sectionTitle}>Stats</Text>
          <View style={styles.statsRow}>
            <View style={styles.statCard}>
              <Text style={styles.statLabel}>Count</Text>
              <Text style={styles.statValue}>{quantity}</Text>
            </View>
            <View style={styles.statCard}>
              <Text style={styles.statLabel}>Color</Text>
              <Text style={styles.statValue}>{color}</Text>
            </View>
          </View>
        </View>
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
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
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
});
