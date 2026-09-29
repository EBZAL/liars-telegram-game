import { describe, it, expect, vi } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import React, { useEffect } from 'react';
import { RouletteChamber } from '../src/components/RouletteChamber.js';
import { ChallengeRevealOverlay } from '../src/components/ChallengeRevealOverlay.js';
import { MatchPausedBanner } from '../src/components/MatchPausedBanner.js';
import { MatchWinnerOverlay } from '../src/components/MatchWinnerOverlay.js';
import { GameContainer } from '../src/App.js';
import { RoomProvider, useRoomProjection } from '../src/room-context.js';
import type { RecipientRoomProjection } from '@liars-telegram-game/room-runtime';

describe('T-038 Roulette and Challenge Reveal Presentation', () => {
  describe('RouletteChamber', () => {
    it('renders 6 chambers with spent and active indicators', () => {
      render(<RouletteChamber shotsUsed={2} isEliminated={false} />);

      expect(screen.getByTestId('roulette-chamber')).toBeTruthy();
      expect(screen.getByText('2/6')).toBeTruthy();

      for (let i = 0; i < 6; i++) {
        expect(screen.getByTestId(`chamber-${i}`)).toBeTruthy();
      }
    });

    it('renders skull when player is eliminated', () => {
      render(<RouletteChamber shotsUsed={4} isEliminated={true} />);
      expect(screen.getByTestId('roulette-chamber').textContent).toContain('💀');
    });
  });

  describe('ChallengeRevealOverlay', () => {
    it('renders honest truth verdict and blank click outcome', () => {
      const onDismiss = vi.fn();
      render(
        <ChallengeRevealOverlay
          callerId="alice"
          accusedId="bob"
          revealedCards={[{ id: 'c1', rank: 'KING' }]}
          tableRank="KING"
          isLie={false}
          shooterId="alice"
          rouletteOutcome="BLANK"
          onDismiss={onDismiss}
        />
      );

      expect(screen.getByTestId('challenge-reveal-overlay')).toBeTruthy();
      expect(screen.getByTestId('challenge-verdict').textContent).toContain('HONEST PLAY');
      expect(screen.getByTestId('roulette-outcome').textContent).toContain('CLICK');
      expect(screen.getByTestId('revealed-card-c1')).toBeTruthy();

      act(() => {
        screen.getByTestId('btn-dismiss-reveal').click();
      });
      expect(onDismiss).toHaveBeenCalledTimes(1);
    });

    it('renders caught bluff verdict and lethal bang outcome', () => {
      const onDismiss = vi.fn();
      render(
        <ChallengeRevealOverlay
          callerId="alice"
          accusedId="bob"
          revealedCards={[{ id: 'c2', rank: 'QUEEN' }]}
          tableRank="KING"
          isLie={true}
          shooterId="bob"
          rouletteOutcome="LETHAL"
          onDismiss={onDismiss}
        />
      );

      expect(screen.getByTestId('challenge-verdict').textContent).toContain('BLUFF CAUGHT');
      expect(screen.getByTestId('roulette-outcome').textContent).toContain('BANG');
    });
  });

  describe('MatchPausedBanner', () => {
    it('does not render when visible is false', () => {
      const { container } = render(<MatchPausedBanner visible={false} />);
      expect(container.firstChild).toBeNull();
    });

    it('renders banner when visible is true', () => {
      render(<MatchPausedBanner visible={true} />);
      expect(screen.getByTestId('match-paused-banner').textContent).toContain('MATCH PAUSED');
    });
  });

  describe('MatchWinnerOverlay', () => {
    it('renders victory celebration when own player wins', () => {
      const onReturn = vi.fn();
      render(<MatchWinnerOverlay winnerId="alice" isOwnWin={true} onReturnToLobby={onReturn} />);

      expect(screen.getByTestId('match-winner-overlay').textContent).toContain('YOU ARE THE SOLE SURVIVOR');
      expect(screen.getByTestId('match-winner-overlay').textContent).toContain('🏆');

      act(() => {
        screen.getByTestId('btn-return-lobby').click();
      });
      expect(onReturn).toHaveBeenCalledTimes(1);
    });

    it('renders conclusion screen when opponent wins', () => {
      const onReturn = vi.fn();
      render(<MatchWinnerOverlay winnerId="bob" isOwnWin={false} onReturnToLobby={onReturn} />);

      expect(screen.getByTestId('match-winner-overlay').textContent).toContain('bob WON THE MATCH');
    });
  });

  describe('GameContainer Challenge Integration', () => {
    it('renders ChallengeRevealOverlay when lastChallenge is in projection and allows dismissal', () => {
      const proj: RecipientRoomProjection = {
        publicState: {
          roomId: 'r_test',
          lifecycle: 'MATCH_ACTIVE',
          revision: 5,
          memberPlayerIds: ['alice', 'bob'],
          hostPlayerId: 'alice',
          currentTurnId: 'turn-2',
          currentTurnDeadline: Date.now() + 20000,
          match: {
            status: 'IN_PROGRESS',
            seatOrder: ['alice', 'bob'],
            players: [
              { playerId: 'alice', lifeStatus: 'ALIVE', handCount: 4, shotsUsed: 0 },
              { playerId: 'bob', lifeStatus: 'ALIVE', handCount: 5, shotsUsed: 1 },
            ],
            round: {
              roundNumber: 2,
              tableRank: 'KING',
              currentPlayerId: 'alice',
              previousPlay: null,
            },
            winnerId: null,
          },
          lastChallenge: {
            callerId: 'bob',
            accusedId: 'alice',
            tableRank: 'KING',
            revealedCards: [{ id: 'c1', rank: 'KING' }],
            isLie: false,
            shooterId: 'bob',
            rouletteOutcome: 'BLANK',
            eliminated: false,
            resolvedAtRevision: 5,
          },
        },
        privateState: {
          playerId: 'alice',
          hand: [{ id: 'c2', rank: 'QUEEN' }],
        },
      };

      const Setup: React.FC = () => {
        const { setProjection } = useRoomProjection();
        useEffect(() => {
          setProjection(proj);
        }, [setProjection]);
        return <GameContainer />;
      };

      render(
        <RoomProvider>
          <Setup />
        </RoomProvider>
      );

      expect(screen.getByTestId('challenge-reveal-overlay')).toBeTruthy();
      expect(screen.getByTestId('challenge-title').textContent).toContain('bob challenged alice');
      expect(screen.getByTestId('challenge-verdict').textContent).toContain('HONEST PLAY');

      // Dismiss
      act(() => {
        screen.getByTestId('btn-dismiss-reveal').click();
      });

      expect(screen.queryByTestId('challenge-reveal-overlay')).toBeNull();
    });
  });
});
