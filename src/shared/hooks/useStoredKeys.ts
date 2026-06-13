import { useCallback, useMemo, useState } from "react";
import type { StoredKey } from "../../nostr/types";

const loadStoredKeys = (): StoredKey[] => {
  try {
    const parsed = JSON.parse(localStorage.getItem("usedKeys") || "[]") as StoredKey[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

export function useStoredKeys() {
  const [keys, setKeys] = useState<StoredKey[]>(loadStoredKeys);

  const appendKey = useCallback((secretHex: string, pubkey: string) => {
    setKeys((current) => {
      if (current.some((entry) => entry[1] === pubkey)) {
        return current;
      }

      const next: StoredKey[] = [...current, [secretHex, pubkey]];
      localStorage.setItem("usedKeys", JSON.stringify(next));
      return next;
    });
  }, []);

  const pubkeys = useMemo(() => keys.map((entry) => entry[1]), [keys]);

  return { keys, pubkeys, appendKey };
}