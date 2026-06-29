import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { DEFAULT_DIFFICULTY } from "../config";

export type Settings = {
  difficulty: number;
  filterDifficulty: number;
  ageHours: number;
  sortByPow: boolean;
};

type SettingsContextValue = {
  settings: Settings;
  updateSettings: (patch: Partial<Settings>) => void;
};

const SettingsContext = createContext<SettingsContextValue | null>(null);

const loadSettings = (): Settings => ({
  difficulty: Number(localStorage.getItem("difficulty")) || DEFAULT_DIFFICULTY,
  filterDifficulty: Number(localStorage.getItem("filterDifficulty")) || DEFAULT_DIFFICULTY,
  ageHours: Number(localStorage.getItem("age")) || 24,
  sortByPow: localStorage.getItem("sortBy") !== "false",
});

const persistSettings = (settings: Settings) => {
  localStorage.setItem("difficulty", String(settings.difficulty));
  localStorage.setItem("filterDifficulty", String(settings.filterDifficulty));
  localStorage.setItem("age", String(settings.ageHours));
  localStorage.setItem("sortBy", String(settings.sortByPow));
};

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<Settings>(loadSettings);

  const updateSettings = useCallback((patch: Partial<Settings>) => {
    setSettings((current) => {
      const next = { ...current, ...patch };
      persistSettings(next);
      return next;
    });
  }, []);

  const value = useMemo(
    () => ({ settings, updateSettings }),
    [settings, updateSettings],
  );

  return (
    <SettingsContext.Provider value={value}>
      {children}
    </SettingsContext.Provider>
  );
}

export function useSettings(): SettingsContextValue {
  const context = useContext(SettingsContext);
  if (!context) {
    throw new Error("useSettings must be used within SettingsProvider");
  }
  return context;
}
