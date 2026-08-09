export type PlayerCount = 2 | 3 | 4;

export function parsePlayerCount(count: number): PlayerCount {
  if (count === 2 || count === 3 || count === 4) {
    return count as PlayerCount;
  }
  throw new Error(`Invalid canonical player count: ${count}`);
}
