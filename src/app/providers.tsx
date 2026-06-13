import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { initNostr, isNostrReady } from "../nostr/client";
import { SettingsProvider } from "./settings";

type NostrContextValue = {
  ready: boolean;
};

const NostrContext = createContext<NostrContextValue>({ ready: false });

export function NostrProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(isNostrReady());

  useEffect(() => {
    let cancelled = false;

    initNostr().then(() => {
      if (!cancelled) {
        setReady(true);
      }
    });

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <NostrContext.Provider value={{ ready }}>
      {ready ? children : (
        <main className="bg-black text-white min-h-screen flex items-center justify-center">
          <p className="text-neutral-400 text-sm">Connecting to relays…</p>
        </main>
      )}
    </NostrContext.Provider>
  );
}

export function useNostrReady(): boolean {
  return useContext(NostrContext).ready;
}

export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <SettingsProvider>
      <NostrProvider>{children}</NostrProvider>
    </SettingsProvider>
  );
}