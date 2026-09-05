import { describe, it, expect, vi } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { RouletteChamber } from '../src/components/RouletteChamber.js';
import { ChallengeRevealOverlay } from '../src/components/ChallengeRevealOverlay.js';
import { MatchPausedBanner } from '../src/components/MatchPausedBanner.js';
import { MatchWinnerOverlay } from '../src/components/MatchWinnerOverlay.js';

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
});
