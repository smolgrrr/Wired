import { createContext, useContext, useEffect } from "react";
import type { Dispatch, SetStateAction } from "react";
import type { FeedStatusKind } from "../hooks/useFeed";

export type FeedStatusIndicatorContextValue = {
  statusKind?: FeedStatusKind;
  setStatusKind: Dispatch<SetStateAction<FeedStatusKind | undefined>>;
};

export const FeedStatusIndicatorContext = createContext<FeedStatusIndicatorContextValue>({
  statusKind: undefined,
  setStatusKind: () => {},
});

export function useFeedStatusIndicator(): FeedStatusIndicatorContextValue {
  return useContext(FeedStatusIndicatorContext);
}

export function useHeaderFeedStatus(statusKind: FeedStatusKind) {
  const { setStatusKind } = useFeedStatusIndicator();

  useEffect(() => {
    setStatusKind(statusKind);
    return () => setStatusKind(undefined);
  }, [setStatusKind, statusKind]);
}
