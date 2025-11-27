import React from 'react';
import { TouchableOpacity, Text, StyleSheet, ViewStyle } from 'react-native';
import { colors } from '../theme/colors';
import { layout } from '../theme/layout';
import { typography } from '../theme/typography';

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

const styles = StyleSheet.create({
  button: {
    paddingHorizontal: layout.spacingMd,
    paddingVertical: layout.spacingSm,
    borderRadius: layout.radiusMd,
    backgroundColor: colors.primary,
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
    borderColor: colors.primary,
  },
  labelOutline: {
    color: colors.primary,
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
