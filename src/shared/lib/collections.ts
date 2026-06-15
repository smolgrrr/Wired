export function uniqBy<T>(arr: T[], key: keyof T): T[] {
  const seen = new Map<string, T>();
  for (const item of arr) {
    seen.set(String(item[key]), item);
  }
  return Array.from(seen.values());
}