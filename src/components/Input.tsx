import React, { useMemo, useState } from 'react';
import { TextInput, TextInputProps, View, Text, StyleSheet } from 'react-native';
import { colors } from '../theme/colors';
import { layout } from '../theme/layout';
import { typography } from '../theme/typography';

interface InputProps extends TextInputProps {
  label?: string;
  clearOnFirstKeystroke?: boolean;
  overwriteIndicator?: boolean;
}

export function Input({
  label,
  style,
  onFocus,
  onBlur,
  onChangeText,
  clearOnFirstKeystroke = true,
  overwriteIndicator = true,
  ...rest
}: InputProps) {
  const [focused, setFocused] = useState(false);
  const [hasTyped, setHasTyped] = useState(false);

  const currentValue =
    typeof rest.value === 'string'
      ? rest.value
      : typeof rest.defaultValue === 'string'
      ? rest.defaultValue
      : '';

  const showOverwriteIndicator =
    overwriteIndicator &&
    focused &&
    !hasTyped &&
    !!currentValue &&
    currentValue.length > 0;

  const inputTextStyle = useMemo(
    () => [
      styles.input,
      focused && styles.inputFocused,
      showOverwriteIndicator && styles.overwriteText,
      style,
    ],
    [focused, showOverwriteIndicator, style]
  );

  return (
    <View style={styles.container}>
      {label ? <Text style={styles.label}>{label}</Text> : null}
      <TextInput
        {...rest}
        style={inputTextStyle}
        placeholderTextColor={colors.textMuted}
        onChangeText={text => {
          let nextValue = text;
          if (clearOnFirstKeystroke && focused && !hasTyped) {
            const baseline = currentValue || '';
            nextValue = text.startsWith(baseline)
              ? text.slice(baseline.length)
              : text;
          }
          setHasTyped(true);
          onChangeText?.(nextValue);
        }}
        onFocus={e => {
          setFocused(true);
          setHasTyped(false);
          onFocus?.(e);
        }}
        onBlur={e => {
          setFocused(false);
          setHasTyped(false);
          onBlur?.(e);
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
    marginBottom: layout.spacingSm,
  },
  label: {
    fontSize: typography.caption,
    color: colors.textMuted,
    marginBottom: layout.spacingXs / 2,
  },
  input: {
    width: '100%',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: layout.radiusMd,
    paddingHorizontal: layout.spacingMd,
    paddingVertical: layout.spacingSm,
    fontSize: typography.body + 1,
    backgroundColor: colors.background,
    color: colors.text,
  },
  inputFocused: {
    borderColor: colors.primary,
  },
  overwriteText: {
    color: colors.textMuted,
    fontStyle: 'italic',
  },
});
