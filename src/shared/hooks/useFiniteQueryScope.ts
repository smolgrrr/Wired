import { useCallback, useEffect, useRef } from "react";
import type { FiniteQuery, QueryHandle } from "../../nostr/browser-relay-access";
import { startFiniteQuery } from "../../nostr/client";

export function useFiniteQueryScope(): (query: FiniteQuery) => QueryHandle {
  const active = useRef(new Set<QueryHandle>());

  useEffect(() => () => {
    const handles = active.current;
    handles.forEach((handle) => handle.close());
    handles.clear();
  }, []);

  return useCallback((query: FiniteQuery) => {
    const handle = startFiniteQuery(query);
    active.current.add(handle);
    void handle.done.finally(() => active.current.delete(handle));
    return handle;
  }, []);
}
