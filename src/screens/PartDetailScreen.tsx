import React from 'react';
import { ScrollView, View, Text, StyleSheet } from 'react-native';
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
};

export default function PartDetailScreen({
  route,
  params,
}: PartDetailScreenProps) {
  const resolvedParams = route?.params ?? params;
  const title = resolvedParams?.partName ?? 'Part Name (placeholder)';
  const subtitle = resolvedParams?.partId ?? 'Set / Part number goes here';
  const quantity =
    resolvedParams?.quantity != null
      ? resolvedParams.quantity.toString()
      : '—';
  const color = resolvedParams?.colorName ?? '—';
  const category = '—';

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
    >
      <View style={styles.card}>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.subtitle}>{subtitle}</Text>
        <View style={styles.divider} />
        <Text style={styles.body}>
          Brief description of the part, material, or usage. Replace this text
          once real data is available.
        </Text>

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
            <View style={styles.statCard}>
              <Text style={styles.statLabel}>Category</Text>
              <Text style={styles.statValue}>{category}</Text>
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
  body: {
    fontSize: typography.body,
    color: colors.text,
    lineHeight: typography.body + 6,
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
