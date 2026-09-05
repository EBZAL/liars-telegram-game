import { describe, it, expect, vi } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import type { RecipientRoomProjection } from '@liars-telegram-game/room-runtime';
import { TableView } from '../src/components/TableView.js';

function createProjection(playerCount: 2 | 3 | 4, currentPlayerId = 'p1'): RecipientRoomProjection {
  const players = Array.from({ length: playerCount }).map((_, i) => ({
    playerId: `p${i + 1}`,
    lifeStatus: 'ALIVE' as const,
    handCount: 5,
    shotsUsed: 0,
  }));

  return {
    publicState: {
      roomId: 'room-test',
      lifecycle: 'MATCH_ACTIVE',
      revision: 1,
      memberPlayerIds: players.map((p) => p.playerId),
      hostPlayerId: 'p1',
      currentTurnId: 'turn-1',
      currentTurnDeadline: Date.now() + 25000,
      match: {
        status: 'IN_PROGRESS',
        seatOrder: players.map((p) => p.playerId),
        players,
        round: {
          roundNumber: 1,
          tableRank: 'KING',
          currentPlayerId,
          previousPlay: null,
        },
        winnerId: null,
      },
    },
    privateState: {
      playerId: 'p1',
      hand: [
        { id: 'c1', rank: 'KING' },
        { id: 'c2', rank: 'QUEEN' },
        { id: 'c3', rank: 'ACE' },
        { id: 'c4', rank: 'JOKER' },
      ],
    },
  };
}

describe('T-037 TableView and Seating Layouts', () => {
  it('renders 2-player layout with 1 opponent at top', () => {
    const proj = createProjection(2);
    const onPlay = vi.fn();
    const onCall = vi.fn();

    render(<TableView projection={proj} ownPlayerId="p1" onPlayCards={onPlay} onCallLiar={onCall} />);

    expect(screen.getByTestId('table-rank-banner').textContent).toContain('Table: KING');
    expect(screen.getByTestId('central-claim-banner').textContent).toContain('First Turn of Round');
    expect(screen.getByTestId('turn-timer-bar')).toBeTruthy();

    const opponent = screen.getByTestId('opponent-seat-p2');
    expect(opponent).toBeTruthy();
    expect(opponent.getAttribute('data-position')).toBe('top');

    expect(screen.getByTestId('card-c1')).toBeTruthy();
    expect(screen.getByTestId('card-c2')).toBeTruthy();
  });

  it('renders 3-player layout with opponents at left and right', () => {
    const proj = createProjection(3);
    const onPlay = vi.fn();
    const onCall = vi.fn();

    render(<TableView projection={proj} ownPlayerId="p1" onPlayCards={onPlay} onCallLiar={onCall} />);

    const p2 = screen.getByTestId('opponent-seat-p2');
    const p3 = screen.getByTestId('opponent-seat-p3');

    expect(p2.getAttribute('data-position')).toBe('left');
    expect(p3.getAttribute('data-position')).toBe('right');
  });

  it('renders 4-player layout with opponents at left, top, and right', () => {
    const proj = createProjection(4);
    const onPlay = vi.fn();
    const onCall = vi.fn();

    render(<TableView projection={proj} ownPlayerId="p1" onPlayCards={onPlay} onCallLiar={onCall} />);

    const p2 = screen.getByTestId('opponent-seat-p2');
    const p3 = screen.getByTestId('opponent-seat-p3');
    const p4 = screen.getByTestId('opponent-seat-p4');

    expect(p2.getAttribute('data-position')).toBe('left');
    expect(p3.getAttribute('data-position')).toBe('top');
    expect(p4.getAttribute('data-position')).toBe('right');
  });

  it('handles card selection and triggers onPlayCards dispatch', () => {
    const proj = createProjection(2, 'p1');
    const onPlay = vi.fn();
    const onCall = vi.fn();

    render(<TableView projection={proj} ownPlayerId="p1" onPlayCards={onPlay} onCallLiar={onCall} />);

    const playBtn = screen.getByTestId('btn-play-cards') as HTMLButtonElement;
    expect(playBtn.disabled).toBe(true);

    // Click card-c1
    act(() => {
      screen.getByTestId('card-c1').click();
    });

    expect(playBtn.disabled).toBe(false);
    expect(playBtn.textContent).toContain('PLAY (1)');

    // Click play
    act(() => {
      playBtn.click();
    });

    expect(onPlay).toHaveBeenCalledTimes(1);
    expect(onPlay).toHaveBeenCalledWith(['c1']);
  });

  it('handles challenge button dispatch and mandatory challenge display', () => {
    const proj = createProjection(2, 'p1');
    if (proj.publicState.match) {
      proj.publicState.match.round.previousPlay = {
        playerId: 'p2',
        count: 2,
        claimedRank: 'KING',
      };
    }

    const onPlay = vi.fn();
    const onCall = vi.fn();

    render(<TableView projection={proj} ownPlayerId="p1" onPlayCards={onPlay} onCallLiar={onCall} />);

    const challengeBtn = screen.getByTestId('btn-call-liar') as HTMLButtonElement;
    expect(challengeBtn.disabled).toBe(false);

    act(() => {
      challengeBtn.click();
    });

    expect(onCall).toHaveBeenCalledTimes(1);
  });
});
