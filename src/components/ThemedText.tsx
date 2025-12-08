import React from 'react';
import { Text as RNText, type TextProps } from 'react-native';
import { useTheme } from '../theme/ThemeProvider';

/**
 * ThemedText ensures all text inherits the active theme color
 * while still allowing callers to pass custom styles.
 */
export function ThemedText({ style, ...rest }: TextProps) {
  const { colors } = useTheme();
  return (
    <RNText
      {...rest}
      style={[{ color: colors.text }, style]}
    />
  );
}
