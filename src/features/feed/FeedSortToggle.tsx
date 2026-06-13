import { useSyncExternalStore } from "react";
import { SegmentedControl } from "../../shared/ui/SegmentedControl";

type FeedSortToggleProps = {
  sortByPow: boolean;
  onToggle: () => void;
};

function subscribeSm(onStoreChange: () => void) {
  const mediaQuery = window.matchMedia("(min-width: 640px)");
  mediaQuery.addEventListener("change", onStoreChange);
  return () => mediaQuery.removeEventListener("change", onStoreChange);
}

function getSm() {
  return window.matchMedia("(min-width: 640px)").matches;
}

function getServerSm() {
  return false;
}

export function FeedSortToggle({ sortByPow, onToggle }: FeedSortToggleProps) {
  const isSm = useSyncExternalStore(subscribeSm, getSm, getServerSm);

  return (
    <SegmentedControl
      aria-label="Sort feed"
      orientation={isSm ? "vertical" : "horizontal"}
      options={[
        { value: "signal", label: "signal" },
        { value: "time", label: "time" },
      ]}
      value={sortByPow ? "signal" : "time"}
      onChange={(value) => {
        const wantsTime = value === "time";
        if (wantsTime !== !sortByPow) {
          onToggle();
        }
      }}
      className="shrink-0"
    />
  );
}