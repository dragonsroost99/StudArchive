import React, { useMemo } from 'react';
import { ScrollView, View, StyleSheet } from 'react-native';
import { layout } from '../theme/layout';
import { typography } from '../theme/typography';
import { useTheme, type Theme } from '../theme/ThemeProvider';
import { ThemedText as Text } from '../components/ThemedText';

const highlights = [
  'Track sets, parts, minifigs, and MOCs across rooms and containers.',
  'Flag duplicates for trade lists and keep valuations handy.',
  'Local SQLite storage keeps your collection available offline.',
];

export default function AboutScreen() {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
    >
      <View style={styles.card}>
        <Text style={styles.title}>About StudArchive</Text>
        <Text style={styles.subtitle}>
          Organize every brick, set, and minifig.
        </Text>
        <View style={styles.divider} />
        <Text style={styles.body}>
          StudArchive is a local-first LEGO tracker built with Expo and SQLite.
          Catalog rooms, containers, and the pieces inside them so you always
          know where everything lives.
        </Text>

        <View style={styles.featureList}>
          {highlights.map(line => (
            <Text key={line} style={styles.featureItem}>
              {`• ${line}`}
            </Text>
          ))}
        </View>

        <Text style={styles.footer}>
          All data stays on your device, ready to view and edit even when
          you&apos;re offline.
        </Text>
      </View>
    </ScrollView>
  );
}

const createStyles = (theme: Theme) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: theme.colors.background,
    },
    content: {
      padding: layout.spacingLg,
      paddingBottom: layout.spacingXl * 2,
    },
    card: {
      backgroundColor: theme.colors.surface,
      borderRadius: layout.radiusLg,
      padding: layout.spacingLg,
      borderWidth: 1,
      borderColor: theme.colors.border,
    },
    title: {
      fontSize: typography.title,
      fontWeight: '700',
      color: theme.colors.text,
      textAlign: 'center',
    },
    subtitle: {
      fontSize: typography.caption,
      color: theme.colors.textSecondary,
      textAlign: 'center',
      marginTop: layout.spacingXs,
    },
    divider: {
      height: 1,
      backgroundColor: theme.colors.border,
      marginVertical: layout.spacingMd,
    },
    body: {
      fontSize: typography.body,
      color: theme.colors.text,
      lineHeight: typography.body + 6,
      marginBottom: layout.spacingSm,
    },
    featureList: {
      marginTop: layout.spacingXs,
      marginBottom: layout.spacingSm,
      gap: layout.spacingXs,
    },
    featureItem: {
      fontSize: typography.body,
      color: theme.colors.text,
    },
    footer: {
      fontSize: typography.caption,
      color: theme.colors.textSecondary,
      marginTop: layout.spacingSm,
    },
  });
