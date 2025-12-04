import React, { useMemo } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { layout } from '../theme/layout';
import { typography } from '../theme/typography';
import {
  useAppSettings,
  type ThemePreference,
  type CategoryStandard,
  type ColorStandard,
} from '../settings/settingsStore';
import { useTheme, type Theme } from '../theme/ThemeProvider';

type Option<T> = { label: string; value: T };
type StyleSet = ReturnType<typeof createStyles>;

function OptionGroup<T extends string>({
  title,
  options,
  value,
  onSelect,
  styles,
}: {
  title: string;
  options: Option<T>[];
  value: T;
  onSelect: (next: T) => void;
  styles: StyleSet;
}) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <View style={styles.optionList}>
        {options.map(option => {
          const selected = option.value === value;
          return (
            <TouchableOpacity
              key={option.value}
              style={[styles.optionRow, selected && styles.optionRowActive]}
              onPress={() => onSelect(option.value)}
            >
              <View style={[styles.radio, selected && styles.radioSelected]} />
              <Text style={[styles.optionLabel, selected && styles.optionLabelActive]}>
                {option.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

export default function SettingsScreen() {
  const { settings, loading, updateSettings } = useAppSettings();
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);

  if (loading || !settings) {
    return (
      <View style={styles.loadingContainer}>
        <Text style={styles.loadingText}>Loading settings…</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Settings</Text>
      <Text style={styles.subtitle}>Choose how StudArchive should look and label data.</Text>

      <OptionGroup<ThemePreference>
        title="Theme"
        value={settings.themePreference}
        styles={styles}
        options={[
          { label: 'Light', value: 'light' },
          { label: 'Dark', value: 'dark' },
          { label: 'System default', value: 'system' },
        ]}
        onSelect={value => updateSettings({ themePreference: value })}
      />

      <OptionGroup<CategoryStandard>
        title="Category Standard"
        value={settings.categoryStandard}
        styles={styles}
        options={[
          { label: 'BrickLink', value: 'bricklink' },
          { label: 'Custom', value: 'custom' },
        ]}
        onSelect={value => updateSettings({ categoryStandard: value })}
      />

      <OptionGroup<ColorStandard>
        title="Color naming"
        value={settings.colorStandard}
        styles={styles}
        options={[
          { label: 'Rebrickable', value: 'rebrickable' },
          { label: 'BrickLink', value: 'bricklink' },
          { label: 'BrickOwl', value: 'brickowl' },
        ]}
        onSelect={value => updateSettings({ colorStandard: value })}
      />
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
      gap: layout.spacingLg,
    },
    title: {
      fontSize: typography.title,
      fontWeight: '700',
      color: theme.colors.text,
    },
    subtitle: {
      fontSize: typography.body,
      color: theme.colors.textSecondary,
      lineHeight: typography.body + 4,
    },
    section: {
      backgroundColor: theme.colors.surface,
      borderWidth: 1,
      borderColor: theme.colors.border,
      borderRadius: layout.radiusLg,
      padding: layout.spacingMd,
      gap: layout.spacingSm,
    },
    sectionTitle: {
      fontSize: typography.sectionTitle,
      fontWeight: '700',
      color: theme.colors.text,
    },
    optionList: {
      gap: layout.spacingXs,
    },
    optionRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: layout.spacingXs,
      paddingHorizontal: layout.spacingSm,
      borderRadius: layout.radiusMd,
    },
    optionRowActive: {
      backgroundColor: theme.colors.surfaceAlt,
    },
    radio: {
      width: 16,
      height: 16,
      borderRadius: 8,
      borderWidth: 2,
      borderColor: theme.colors.border,
      marginRight: layout.spacingSm,
    },
    radioSelected: {
      borderColor: theme.colors.accent,
      backgroundColor: theme.colors.accent,
    },
    optionLabel: {
      fontSize: typography.body,
      color: theme.colors.text,
    },
    optionLabelActive: {
      color: theme.colors.text,
      fontWeight: '700',
    },
    loadingContainer: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.colors.background,
    },
    loadingText: {
      fontSize: typography.body,
      color: theme.colors.text,
    },
  });
