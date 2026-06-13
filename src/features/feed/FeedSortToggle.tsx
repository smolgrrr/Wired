import { SegmentedControl } from "../../shared/ui/SegmentedControl";

type FeedSortToggleProps = {
  sortByPow: boolean;
  onToggle: () => void;
};

export function FeedSortToggle({ sortByPow, onToggle }: FeedSortToggleProps) {
  return (
    <SegmentedControl
      aria-label="Sort feed"
      orientation="vertical"
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
      className="mr-2 shrink-0"
    />
  );
}