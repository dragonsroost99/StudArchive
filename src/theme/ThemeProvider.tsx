import React, { createContext, useContext } from 'react';
import { Text, useColorScheme } from 'react-native';
import { useAppSettings } from '../settings/settingsStore';
import { useAppThemeChoice } from './useAppTheme';
import { colors as baseColors, colors as globalColors } from './colors';

export type ThemeMode = 'light' | 'dark';

export interface Theme {
  mode: ThemeMode;
  colors: {
    background: string;
    surface: string;
    surfaceAlt: string;
    text: string;
    textMuted: string;
    textSecondary: string;
    heading: string;
    accent: string;
    border: string;
    danger: string;
  };
}

const lightTheme: Theme = {
  mode: 'light',
  colors: {
    background: '#F2F2F7',
    surface: '#FFFFFF',
    surfaceAlt: '#F5F5FA',
    text: '#111827',
    textMuted: '#6B7280',
    textSecondary: '#6B7280',
    heading: '#111827',
    accent: '#3B82F6',
    border: '#E5E7EB',
    danger: '#EF4444',
  },
};

const darkTheme: Theme = {
  mode: 'dark',
  colors: {
    background: baseColors.background ?? '#050816',
    surface: baseColors.surface ?? '#111827',
    surfaceAlt: (baseColors as any).surfaceAlt ?? baseColors.surface ?? '#1F2933',
    text: baseColors.text ?? '#F9FAFB',
    textMuted: baseColors.textMuted ?? '#CBD5E1',
    textSecondary: (baseColors as any).textSecondary ?? baseColors.textMuted ?? '#CBD5E1',
    heading: (baseColors as any).heading ?? baseColors.text ?? '#F9FAFB',
    accent: (baseColors as any).primary ?? '#60A5FA',
    border: baseColors.border ?? '#1F2937',
    danger: baseColors.danger ?? '#F87171',
  },
};


const ThemeContext = createContext<Theme | null>(null);

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { settings } = useAppSettings();
  const systemScheme = useColorScheme();
  const choice = useAppThemeChoice(settings?.themePreference ?? 'dark', systemScheme);
  const theme = choice === 'dark' ? darkTheme : lightTheme;

  // Set a themed default text color so any unstyled <Text> inherits the current theme.
  const existingTextStyle = Text.defaultProps?.style;
  const baseTextStyleArray = Array.isArray(existingTextStyle)
    ? existingTextStyle
    : existingTextStyle
    ? [existingTextStyle]
    : [];
  Text.defaultProps = Text.defaultProps || {};
  Text.defaultProps.style = [...baseTextStyleArray, { color: theme.colors.text }];
  Text.defaultProps.allowFontScaling = Text.defaultProps.allowFontScaling ?? true;

  // Keep existing color references in sync for legacy styles synchronously on render.
  globalColors.background = theme.colors.background;
  globalColors.surface = theme.colors.surface;
  (globalColors as any).surfaceAlt = theme.colors.surfaceAlt;
  globalColors.text = theme.colors.text;
  (globalColors as any).textMuted = theme.colors.textMuted;
  (globalColors as any).textSecondary = theme.colors.textSecondary;
  (globalColors as any).heading = theme.colors.heading;
  globalColors.border = theme.colors.border;
  (globalColors as any).primary = theme.colors.accent;
  (globalColors as any).primarySoft = theme.colors.surfaceAlt;
  globalColors.danger = theme.colors.danger;
  (globalColors as any).chipBorder = theme.colors.border;
  (globalColors as any).chipActiveBg = theme.colors.surfaceAlt;
  (globalColors as any).chipActiveBorder = theme.colors.accent;
  (globalColors as any).chipActiveText = theme.colors.text;
  (globalColors as any).modalBackdrop =
    theme.mode === 'dark' ? '#000000CC' : '#00000055';

  return <ThemeContext.Provider value={theme}>{children}</ThemeContext.Provider>;
};

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error('useTheme must be used within ThemeProvider');
  }
  return ctx;
}
