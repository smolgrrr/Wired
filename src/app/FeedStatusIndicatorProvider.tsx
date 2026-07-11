import { useMemo, useState, type ReactNode } from "react";
import type { FeedStatusKind } from "../hooks/useFeed";
import { FeedStatusIndicatorContext } from "./feedStatusIndicator";

export function FeedStatusIndicatorProvider({ children }: { children: ReactNode }) {
  const [statusKind, setStatusKind] = useState<FeedStatusKind | undefined>();
  const value = useMemo(
    () => ({ statusKind, setStatusKind }),
    [statusKind],
  );

  return (
    <FeedStatusIndicatorContext.Provider value={value}>
      {children}
    </FeedStatusIndicatorContext.Provider>
  );
}
