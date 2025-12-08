import React, { useMemo } from 'react';
import { TouchableOpacity, StyleSheet, ViewStyle } from 'react-native';
import { layout } from '../theme/layout';
import { typography } from '../theme/typography';
import { useTheme } from '../theme/ThemeProvider';
import { ThemedText as Text } from './ThemedText';

type ButtonVariant = 'primary' | 'outline' | 'danger';

interface Props {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  variant?: ButtonVariant;
  style?: ViewStyle;
}

export function Button({
  label,
  onPress,
  disabled = false,
  variant = 'primary',
  style,
}: Props) {
  const theme = useTheme();
  const palette = {
    primary: theme.colors.accent,
    primarySoft: theme.colors.surfaceAlt ?? theme.colors.surface,
    border: theme.colors.border,
    text: theme.colors.text,
    danger: theme.colors.danger,
  };

  const styles = useMemo(
    () =>
      createStyles({
        accent: palette.primary,
        accentSoft: palette.primarySoft,
        border: palette.border,
        danger: palette.danger,
      }),
    [palette.accent, palette.accentSoft, palette.border, palette.danger]
  );

  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled}
      style={[
        styles.button,
        variant === 'outline' && styles.outline,
        variant === 'danger' && styles.danger,
        disabled && styles.disabled,
        style,
      ]}
    >
      <Text
        style={[
          styles.label,
          variant === 'outline' && styles.labelOutline,
          variant === 'danger' && styles.labelDanger,
        ]}
      >
        {label}
      </Text>
    </TouchableOpacity>
  );
}

function createStyles(colors: {
  accent: string;
  accentSoft: string;
  border: string;
  danger: string;
}) {
  return StyleSheet.create({
    button: {
      paddingHorizontal: layout.spacingMd,
      paddingVertical: layout.spacingSm,
      borderRadius: layout.radiusMd,
      backgroundColor: colors.accent,
      alignItems: 'center',
      justifyContent: 'center',
    },
    label: {
      color: '#fff',
      fontSize: typography.button,
      fontWeight: '600',
    },
    outline: {
      backgroundColor: 'transparent',
      borderWidth: 1,
      borderColor: colors.accent,
    },
    labelOutline: {
      color: colors.accent,
    },
    danger: {
      backgroundColor: colors.danger,
    },
    labelDanger: {
      color: '#fff',
    },
    disabled: {
      opacity: 0.4,
    },
  });
}
