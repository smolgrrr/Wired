type FeedSortToggleProps = {
  sortByPow: boolean;
  onToggle: () => void;
};

export function FeedSortToggle({ sortByPow, onToggle }: FeedSortToggleProps) {
  return (
    <label htmlFor="feed-sort-toggle" className="flex flex-col items-center cursor-pointer mr-1">
      <div className="mb-2 text-neutral-500 text-xs">PoW</div>
      <div className="relative">
        <input
          id="feed-sort-toggle"
          type="checkbox"
          className="sr-only"
          checked={!sortByPow}
          onChange={onToggle}
        />
        <div className="block bg-gray-600 w-4 h-8 rounded-full"></div>
        <div
          className={`dot absolute left-0.5 top-1 bg-white w-3 h-3 rounded-full transition ${
            !sortByPow ? "transform translate-y-full bg-blue-400" : ""
          }`}
        ></div>
      </div>
      <div className="mt-2 text-neutral-500 text-xs">Time</div>
    </label>
  );
}