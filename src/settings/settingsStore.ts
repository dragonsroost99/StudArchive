import { useCallback, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

export type ThemePreference = 'light' | 'dark' | 'system';
export type CategoryStandard = 'bricklink' | 'custom';
export type ColorStandard = 'rebrickable' | 'bricklink' | 'brickowl';
export type MarketStandard = 'bricklink' | 'brickowl' | 'rebrickable';

export interface AppSettings {
  themePreference: ThemePreference;
  categoryStandard: CategoryStandard;
  colorStandard: ColorStandard;
  marketStandard: MarketStandard;
}

const STORAGE_KEY = 'studarchive.settings';

export const defaultSettings: AppSettings = {
  themePreference: 'dark',
  categoryStandard: 'bricklink',
  colorStandard: 'rebrickable',
  marketStandard: 'bricklink',
};

let currentSettings: AppSettings = defaultSettings;
const listeners = new Set<(next: AppSettings) => void>();

function mergeWithDefaults(value: Partial<AppSettings> | null): AppSettings {
  return {
    themePreference: value?.themePreference ?? defaultSettings.themePreference,
    categoryStandard: value?.categoryStandard ?? defaultSettings.categoryStandard,
    colorStandard: value?.colorStandard ?? defaultSettings.colorStandard,
    marketStandard: value?.marketStandard ?? defaultSettings.marketStandard,
  };
}

export async function loadSettings(): Promise<AppSettings> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) {
      currentSettings = defaultSettings;
      return currentSettings;
    }
    const parsed = JSON.parse(raw) as Partial<AppSettings> | null;
    currentSettings = mergeWithDefaults(parsed);
    notify(currentSettings);
    return currentSettings;
  } catch (error) {
    console.warn('[Settings] Failed to load settings, using defaults', error);
    currentSettings = defaultSettings;
    return currentSettings;
  }
}

export async function saveSettings(settings: AppSettings): Promise<void> {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    currentSettings = settings;
    notify(currentSettings);
  } catch (error) {
    console.warn('[Settings] Failed to persist settings', error);
  }
}

function notify(next: AppSettings) {
  listeners.forEach(listener => {
    try {
      listener(next);
    } catch {}
  });
}

function subscribe(listener: (next: AppSettings) => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useAppSettings() {
  const [settings, setSettings] = useState<AppSettings | null>(currentSettings);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    (async () => {
      const loaded = await loadSettings();
      if (mounted) {
        setSettings(loaded);
        setLoading(false);
      }
    })();
    const unsubscribe = subscribe(next => {
      setSettings(next);
    });
    return () => {
      mounted = false;
      unsubscribe();
    };
  }, []);

  const updateSettings = useCallback(
    async (patch: Partial<AppSettings>) => {
      const base = settings ?? currentSettings;
      const next = { ...base, ...patch };
      setSettings(next);
      await saveSettings(next);
    },
    [settings]
  );

  return { settings, loading, updateSettings };
}
