/* eslint-disable react-refresh/only-export-components -- context + provider module */
import {
  createContext,
  useCallback,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  loadSettings,
  saveSettings,
  resetSettingsToDefaults,
  type AppSettings,
} from "./settingsStorage";

export type SettingsContextValue = {
  settings: AppSettings;
  setSettings: (next: AppSettings) => void;
  resetSettings: () => AppSettings;
};

export const SettingsContext = createContext<SettingsContextValue | null>(null);

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettingsState] = useState<AppSettings>(() =>
    loadSettings(),
  );

  const setSettings = useCallback((next: AppSettings) => {
    saveSettings(next);
    setSettingsState(next);
  }, []);

  const resetSettings = useCallback((): AppSettings => {
    const next = resetSettingsToDefaults();
    setSettingsState(next);
    return next;
  }, []);

  const value = useMemo(
    () => ({ settings, setSettings, resetSettings }),
    [settings, setSettings, resetSettings],
  );

  return (
    <SettingsContext.Provider value={value}>
      {children}
    </SettingsContext.Provider>
  );
}
