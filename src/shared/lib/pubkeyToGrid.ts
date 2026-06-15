export function pubkeyToGrid(pubkey: string): boolean[] {
  let hash = 0x811c9dc5;

  for (let i = 0; i < pubkey.length; i++) {
    hash ^= pubkey.charCodeAt(i);
    hash = (hash * 0x01000193) >>> 0;
  }

  const bits: boolean[] = [];
  for (let i = 0; i < 16; i++) {
    bits.push((((hash >> i) ^ (hash >> (i + 16))) & 1) === 1);
  }

  return bits;
}