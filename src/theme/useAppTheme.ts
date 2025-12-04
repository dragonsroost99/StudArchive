import { type ThemePreference } from '../settings/settingsStore';

export function useAppThemeChoice(
  themePreference: ThemePreference,
  systemScheme: 'light' | 'dark' | null
): 'light' | 'dark' {
  if (themePreference === 'system') {
    return systemScheme === 'dark' ? 'dark' : 'light';
  }
  return themePreference;
}
