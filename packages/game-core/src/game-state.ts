import { Card, CardRank } from './cards.js';
import { RevolverOutcome } from './revolver.js';

export type PlayerId = string;

export type LifeStatus = 'ALIVE' | 'ELIMINATED';
export type RoundStatus =
  | 'WITH_CARDS'
  | 'EMPTY_PENDING_CHALLENGE'
  | 'EMPTY_SAFE';

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

export type PlayId = number;

export interface PlayState {
  readonly playId: PlayId;
  readonly playerId: PlayerId;
  readonly cardIds: readonly string[];
  readonly count: 1 | 2 | 3;
  readonly claimedRank: TableRank;
  readonly resolved: boolean;
}

export interface RoundState {
  readonly roundNumber: number;
  readonly tableRank: TableRank;
  readonly currentPlayerId: PlayerId;
  readonly previousPlay: PlayState | null;
  readonly centralPile: readonly Card[];
  readonly undealtCards: readonly Card[];
  readonly playSequence: number;
}

export type MatchStatus = 'IN_PROGRESS' | 'FINISHED';

export interface MatchState {
  readonly status: MatchStatus;
  readonly seatOrder: readonly PlayerId[];
  readonly firstRoundStarter: PlayerId;
  readonly players: Readonly<Record<PlayerId, PlayerState>>;
  readonly round: RoundState;
  readonly winnerId: PlayerId | null;
}
