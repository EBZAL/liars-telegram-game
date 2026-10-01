import type { DurableObjectNamespace, Fetcher } from '@cloudflare/workers-types';
import type { GameplayActionEnvelope } from '@liars-telegram-game/room-runtime';

export interface Env {
  ROOM_DO: DurableObjectNamespace;
  BOT_TOKEN?: string;
  BOT_USERNAME?: string;
  APP_NAME?: string;
  APP_URL?: string;
  TELEGRAM_WEBHOOK_SECRET?: string;
  ALLOW_INSECURE_AUTH?: string;
  ADMIN_IDS?: string;
  ASSETS?: Fetcher;
}

export type IncomingClientMessage =
  | { type: 'JOIN'; playerName?: string }
  | { type: 'LEAVE' }
  | { type: 'START_MATCH'; initialTurnId?: string }
  | { type: 'GAMEPLAY_ACTION'; envelope: GameplayActionEnvelope }
  | { type: 'PLAY_AGAIN' }
  | { type: 'CHECK_DEADLINE' }
  | GameplayActionEnvelope;

export type OutgoingServerMessage =
  | { type: 'PROJECTION'; projection: unknown }
  | { type: 'ERROR'; error: string };
