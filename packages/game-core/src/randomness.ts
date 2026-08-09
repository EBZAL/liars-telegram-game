export interface RandomSource {
  /**
   * Returns an integer between 0 and max (exclusive).
   * 0 <= result < max
   */
  nextInt(max: number): number;
}

export function shuffle<T>(array: readonly T[], source: RandomSource): T[] {
  const copy = [...array];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = source.nextInt(i + 1);
    const temp = copy[i];
    copy[i] = copy[j];
    copy[j] = temp;
  }
  return copy;
}
