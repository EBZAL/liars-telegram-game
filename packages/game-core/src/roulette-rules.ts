import { PlayerId, PlayerState, LifeStatus } from './game-state.js';
import { RevolverOutcome } from './revolver.js';

export interface RouletteShotResolution {
  readonly playerId: PlayerId;
  readonly shotIndex: number;
  readonly outcome: RevolverOutcome;
  readonly nextShotIndex: number;
  readonly eliminated: boolean;
  readonly updatedPlayer: PlayerState;
}

export function resolveRouletteShot(
  player: PlayerState
): RouletteShotResolution {
  // 1. ALIVE Player required
  if (player.lifeStatus === 'ELIMINATED') {
    throw new Error(`Player ${player.id} is already ELIMINATED.`);
  }

  // 2. Revolver composition invariants
  const sequence = player.revolver.sequence;
  if (sequence.length !== 6) {
    throw new Error('Revolver sequence must have exactly 6 outcomes.');
  }

  const lethalCount = sequence.filter((o) => o === 'LETHAL').length;
  const blankCount = sequence.filter((o) => o === 'BLANK').length;

  if (lethalCount !== 1 || blankCount !== 5) {
    throw new Error('Revolver sequence must contain exactly 1 LETHAL and 5 BLANK outcomes.');
  }

  // 3. Shot index invariants
  const shotIndex = player.revolver.nextShotIndex;
  if (!Number.isInteger(shotIndex) || !Number.isFinite(shotIndex)) {
    throw new Error('nextShotIndex must be a finite integer.');
  }

  if (shotIndex < 0) {
    throw new Error('nextShotIndex cannot be negative.');
  }

  if (shotIndex >= 6) {
    throw new Error('Revolver is exhausted (index >= 6).');
  }

  // 4. Consumed-prefix invariant
  for (let i = 0; i < shotIndex; i++) {
    if (sequence[i] === 'LETHAL') {
      throw new Error('ALIVE player cannot have a consumed LETHAL shot in prefix.');
    }
  }

  // 5. Authoritative outcome & Index advancement
  const outcome = sequence[shotIndex]!;
  const nextShotIndex = shotIndex + 1;
  const eliminated = outcome === 'LETHAL';
  const newLifeStatus: LifeStatus = eliminated ? 'ELIMINATED' : 'ALIVE';

  const updatedPlayer: PlayerState = {
    id: player.id,
    lifeStatus: newLifeStatus,
    roundStatus: player.roundStatus,
    hand: player.hand,
    revolver: {
      sequence: player.revolver.sequence,
      nextShotIndex
    }
  };

  return {
    playerId: player.id,
    shotIndex,
    outcome,
    nextShotIndex,
    eliminated,
    updatedPlayer
  };
}
