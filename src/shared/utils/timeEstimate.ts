const timeUnits = [
  { unit: "c", value: 60 * 60 * 24 * 365.25 * 100 },
  { unit: "de", value: 60 * 60 * 24 * 365.25 * 10 },
  { unit: "y", value: 60 * 60 * 24 * 365.25 },
  { unit: "mo", value: 60 * 60 * 24 * 30 },
  { unit: "w", value: 60 * 60 * 24 * 7 },
  { unit: "d", value: 60 * 60 * 24 },
  { unit: "h", value: 60 * 60 },
  { unit: "m", value: 60 },
  { unit: "s", value: 1 },
];

export function timeToGoEst(difficulty: string, hashrate: number): string {
  const difficultyValue = parseInt(difficulty);
  let estimatedTime = (Math.pow(2, difficultyValue) / (hashrate || 1)) * 1.3;
  let result = "";

  if (hashrate < 50000 && estimatedTime > 60 * 60 * 24 * 3) {
    return "calculating";
  }

  for (const unit of timeUnits) {
    if (estimatedTime >= unit.value) {
      const timeInUnit = Math.floor(estimatedTime / unit.value);
      estimatedTime -= timeInUnit * unit.value;
      result += `${timeInUnit}${unit.unit} `;
    }
  }

  return result.trim() || "now";
}