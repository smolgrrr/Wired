const timeUnits = [
  { unit: "w", value: 60 * 60 * 24 * 7 },
  { unit: "d", value: 60 * 60 * 24 },
  { unit: "h", value: 60 * 60 },
  { unit: "m", value: 60 },
];

export const timeAgo = (unixTime: number) => {
  let seconds = Math.floor(new Date().getTime() / 1000 - unixTime);

  if (seconds < 60) return "now";

  for (const unit of timeUnits) {
    if (seconds >= unit.value) {
      return `${Math.floor(seconds / unit.value)}${unit.unit}`;
    }
    seconds %= unit.value;
  }

  return "now";
};