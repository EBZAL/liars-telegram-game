import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import type { RecipientRoomProjection } from '@liars-telegram-game/room-runtime';
import { LobbyView } from '../src/components/LobbyView.js';
import { GameContainer } from '../src/App.js';
import { RoomProvider } from '../src/room-context.js';

describe('T-039 Lobby View and App Routing', () => {
  describe('LobbyView Component', () => {
    beforeEach(() => {
      // Mock navigator.clipboard
      Object.assign(navigator, {
        clipboard: {
          writeText: vi.fn().mockResolvedValue(undefined),
        },
      });
    });

    afterEach(() => {
      vi.restoreAllMocks();
    });

    it('renders room ID and member slots with host indicator', () => {
      render(
        <LobbyView
          roomId="r_lobby_1"
          members={['alice', 'bob']}
          hostPlayerId="alice"
          ownPlayerId="bob"
          onStartMatch={vi.fn()}
        />
      );

      expect(screen.getByTestId('lobby-room-badge').textContent).toContain('r_lobby_1');
      expect(screen.getByTestId('lobby-member-alice')).toBeTruthy();
      expect(screen.getByTestId('lobby-member-bob')).toBeTruthy();
      expect(screen.getByTestId('host-badge').textContent).toContain('HOST');

      // Empty slots for 3 and 4
      expect(screen.getByTestId('lobby-empty-slot-2')).toBeTruthy();
      expect(screen.getByTestId('lobby-empty-slot-3')).toBeTruthy();
    });

    it('handles host start match button (disabled when < 2 players, enabled when >= 2)', () => {
      const onStart = vi.fn();
      const { rerender } = render(
        <LobbyView
          roomId="r_room_1"
          members={['alice']}
          hostPlayerId="alice"
          ownPlayerId="alice"
          onStartMatch={onStart}
        />
      );

      const startBtn = screen.getByTestId('btn-start-match') as HTMLButtonElement;
      expect(startBtn.disabled).toBe(true);

      // Add second member
      rerender(
        <LobbyView
          roomId="r_room_1"
          members={['alice', 'bob']}
          hostPlayerId="alice"
          ownPlayerId="alice"
          onStartMatch={onStart}
        />
      );

      expect(startBtn.disabled).toBe(false);
      act(() => {
        startBtn.click();
      });
      expect(onStart).toHaveBeenCalledTimes(1);
    });

    it('displays waiting notice for non-host player', () => {
      render(
        <LobbyView
          roomId="r_room_1"
          members={['alice', 'bob']}
          hostPlayerId="alice"
          ownPlayerId="bob"
          onStartMatch={vi.fn()}
        />
      );

      expect(screen.queryByTestId('btn-start-match')).toBeNull();
      expect(screen.getByTestId('waiting-host-notice').textContent).toContain('Waiting for Host');
    });

    it('copies invite link to clipboard', async () => {
      render(
        <LobbyView
          roomId="r_game_99"
          members={['alice']}
          hostPlayerId="alice"
          ownPlayerId="alice"
          botUsername="LiarsBot"
          onStartMatch={vi.fn()}
        />
      );

      const copyBtn = screen.getByTestId('btn-copy-invite');
      await act(async () => {
        copyBtn.click();
      });

      expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
        'https://t.me/LiarsBot?startapp=r_game_99'
      );
      expect(copyBtn.textContent).toContain('Link Copied!');
    });
  });

  describe('GameContainer Routing', () => {
    it('renders connecting screen when projection is null', () => {
      render(
        <RoomProvider initialProjection={null}>
          <GameContainer />
        </RoomProvider>
      );

      expect(screen.getByTestId('connecting-screen').textContent).toContain('Connecting to room');
    });

    it('renders LobbyView when projection is LOBBY', () => {
      const lobbyProj: RecipientRoomProjection = {
        publicState: {
          roomId: 'r_lob',
          lifecycle: 'LOBBY',
          revision: 1,
          memberPlayerIds: ['alice', 'bob'],
          hostPlayerId: 'alice',
          currentTurnId: null,
          currentTurnDeadline: null,
          match: null,
        },
        privateState: null,
      };

      render(
        <RoomProvider initialProjection={lobbyProj}>
          <GameContainer />
        </RoomProvider>
      );

      expect(screen.getByTestId('lobby-view')).toBeTruthy();
      expect(screen.queryByTestId('table-view')).toBeNull();
    });

    it('renders TableView when projection is MATCH_ACTIVE', () => {
      const matchProj: RecipientRoomProjection = {
        publicState: {
          roomId: 'r_match',
          lifecycle: 'MATCH_ACTIVE',
          revision: 2,
          memberPlayerIds: ['p1', 'p2'],
          hostPlayerId: 'p1',
          currentTurnId: 'turn-1',
          currentTurnDeadline: Date.now() + 20000,
          match: {
            status: 'IN_PROGRESS',
            seatOrder: ['p1', 'p2'],
            players: [
              { playerId: 'p1', lifeStatus: 'ALIVE', handCount: 5, shotsUsed: 0 },
              { playerId: 'p2', lifeStatus: 'ALIVE', handCount: 5, shotsUsed: 0 },
            ],
            round: {
              roundNumber: 1,
              tableRank: 'KING',
              currentPlayerId: 'p1',
              previousPlay: null,
            },
            winnerId: null,
          },
        },
        privateState: {
          playerId: 'p1',
          hand: [{ id: 'c1', rank: 'KING' }],
        },
      };

      render(
        <RoomProvider initialProjection={matchProj}>
          <GameContainer />
        </RoomProvider>
      );

      expect(screen.getByTestId('table-view')).toBeTruthy();
      expect(screen.queryByTestId('lobby-view')).toBeNull();
    });

    it('renders TableView with winner overlay when MATCH_FINISHED', () => {
      const finishProj: RecipientRoomProjection = {
        publicState: {
          roomId: 'r_finished',
          lifecycle: 'MATCH_FINISHED',
          revision: 10,
          memberPlayerIds: ['p1', 'p2'],
          hostPlayerId: 'p1',
          currentTurnId: 'turn-9',
          currentTurnDeadline: null,
          match: {
            status: 'FINISHED',
            seatOrder: ['p1', 'p2'],
            players: [
              { playerId: 'p1', lifeStatus: 'ALIVE', handCount: 2, shotsUsed: 1 },
              { playerId: 'p2', lifeStatus: 'ELIMINATED', handCount: 0, shotsUsed: 4 },
            ],
            round: {
              roundNumber: 2,
              tableRank: 'ACE',
              currentPlayerId: 'p1',
              previousPlay: null,
            },
            winnerId: 'p1',
          },
        },
        privateState: {
          playerId: 'p1',
          hand: [{ id: 'c1', rank: 'ACE' }],
        },
      };

      render(
        <RoomProvider initialProjection={finishProj}>
          <GameContainer />
        </RoomProvider>
      );

      expect(screen.getByTestId('match-winner-overlay')).toBeTruthy();
    });
  });
});
