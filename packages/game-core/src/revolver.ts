export type RevolverOutcome = 'LETHAL' | 'BLANK';

export function createBaseRevolver(): RevolverOutcome[] {
  return ['LETHAL', 'BLANK', 'BLANK', 'BLANK', 'BLANK', 'BLANK'];
}
