import AsyncStorage from '@react-native-async-storage/async-storage';
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { useColorScheme } from 'react-native';

export type ThemePreference = 'system' | 'light' | 'dark';
type ThemeScheme = 'light' | 'dark';

type ThemeContextValue = {
  preference: ThemePreference;
  scheme: ThemeScheme;
  setPreference: (preference: ThemePreference) => Promise<void>;
};

const storageKey = 'chikondi-theme-preference:v1';
const ThemeContext = createContext<ThemeContextValue>({
  preference: 'system',
  scheme: 'light',
  setPreference: async () => undefined,
});

function isThemePreference(value: string | null): value is ThemePreference {
  return value === 'system' || value === 'light' || value === 'dark';
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const systemScheme = useColorScheme() ?? 'light';
  const [preference, setPreferenceState] = useState<ThemePreference>('system');

  useEffect(() => {
    let active = true;
    void AsyncStorage.getItem(storageKey)
      .then((stored) => {
        if (active && isThemePreference(stored)) setPreferenceState(stored);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, []);

  const setPreference = useCallback(async (next: ThemePreference) => {
    setPreferenceState(next);
    try {
      await AsyncStorage.setItem(storageKey, next);
    } catch (error) {
      setPreferenceState(preference);
      throw new Error('The appearance setting could not be saved on this device.', {
        cause: error,
      });
    }
  }, [preference]);

  const value = useMemo<ThemeContextValue>(
    () => ({
      preference,
      scheme: preference === 'system' ? systemScheme : preference,
      setPreference,
    }),
    [preference, setPreference, systemScheme],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  return useContext(ThemeContext);
}
