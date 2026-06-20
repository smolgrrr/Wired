import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { closeAllSubscriptions, initNostr, isNostrReady } from "../nostr/client";
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
      closeAllSubscriptions();
    };
  }, []);

  return (
    <NostrContext.Provider value={{ ready }}>
      {children}
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