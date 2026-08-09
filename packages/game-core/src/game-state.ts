import { Card, CardRank } from './cards.js';
import { RevolverOutcome } from './revolver.js';

export type PlayerId = string;

export type LifeStatus = 'ALIVE' | 'ELIMINATED';
export type RoundStatus = 'WITH_CARDS' | 'EMPTY_SAFE';

export interface RevolverState {
  readonly sequence: readonly RevolverOutcome[];
  readonly nextShotIndex: number;
}

export interface PlayerState {
  readonly id: PlayerId;
  readonly lifeStatus: LifeStatus;
  readonly roundStatus: RoundStatus;
  readonly hand: readonly Card[];
  readonly revolver: RevolverState;
}

export type TableRank = Exclude<CardRank, 'JOKER'>;

export interface RoundState {
  readonly roundNumber: number;
  readonly tableRank: TableRank;
  readonly currentPlayerId: PlayerId;
  readonly previousPlay: null;
  readonly centralPile: readonly Card[];
  readonly undealtCards: readonly Card[];
}

export interface MatchState {
  readonly status: 'IN_PROGRESS';
  readonly seatOrder: readonly PlayerId[];
  readonly firstRoundStarter: PlayerId;
  readonly players: Readonly<Record<PlayerId, PlayerState>>;
  readonly round: RoundState;
  readonly winnerId: PlayerId | null;
}
