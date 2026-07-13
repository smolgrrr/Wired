import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { DEFAULT_FILTER_DIFFICULTY, DEFAULT_POST_DIFFICULTY } from "../config";

export type Settings = {
  difficulty: number;
  filterDifficulty: number;
  ageHours: number;
  sortByPow: boolean;
  lightningAddress: string;
};

type SettingsContextValue = {
  settings: Settings;
  updateSettings: (patch: Partial<Settings>) => void;
};

const SettingsContext = createContext<SettingsContextValue | null>(null);

const LEGACY_DEFAULT_FILTER_DIFFICULTY = 21;

function loadFilterDifficulty(): number {
  const stored = Number(localStorage.getItem("filterDifficulty"));
  if (!stored || stored === LEGACY_DEFAULT_FILTER_DIFFICULTY) {
    return DEFAULT_FILTER_DIFFICULTY;
  }
  return stored;
}

const loadSettings = (): Settings => ({
  difficulty: Number(localStorage.getItem("difficulty")) || DEFAULT_POST_DIFFICULTY,
  filterDifficulty: loadFilterDifficulty(),
  ageHours: Number(localStorage.getItem("age")) || 24,
  sortByPow: localStorage.getItem("sortBy") !== "false",
  lightningAddress: localStorage.getItem("wired:lightning-address") || "",
});

const persistSettings = (settings: Settings) => {
  localStorage.setItem("difficulty", String(settings.difficulty));
  localStorage.setItem("filterDifficulty", String(settings.filterDifficulty));
  localStorage.setItem("age", String(settings.ageHours));
  localStorage.setItem("sortBy", String(settings.sortByPow));
  if (settings.lightningAddress) {
    localStorage.setItem("wired:lightning-address", settings.lightningAddress);
  } else {
    localStorage.removeItem("wired:lightning-address");
  }
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
