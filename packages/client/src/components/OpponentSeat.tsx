import React from 'react';
import type { PublicPlayerProjection } from '@liars-telegram-game/room-runtime';

export interface OpponentSeatProps {
  player: PublicPlayerProjection;
  isCurrentTurn: boolean;
  position: 'top' | 'left' | 'right';
}

export const OpponentSeat: React.FC<OpponentSeatProps> = ({
  player,
  isCurrentTurn,
  position,
}) => {
  const isEliminated = player.lifeStatus === 'ELIMINATED';

  return (
    <div
      data-testid={`opponent-seat-${player.playerId}`}
      data-position={position}
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        padding: '8px 12px',
        borderRadius: '12px',
        background: isCurrentTurn
          ? 'linear-gradient(180deg, #2a2214 0%, #17130c 100%)'
          : 'var(--bg-surface)',
        border: isCurrentTurn
          ? '2px solid var(--accent-gold)'
          : '1px solid var(--border-subtle)',
        boxShadow: isCurrentTurn
          ? '0 0 16px rgba(229, 169, 59, 0.4)'
          : '0 4px 12px rgba(0, 0, 0, 0.3)',
        opacity: isEliminated ? 0.45 : 1,
        transition: 'all 0.2s ease',
        minWidth: '90px',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
        <span style={{ fontSize: '14px' }}>
          {isEliminated ? '💀' : isCurrentTurn ? '🎯' : '👤'}
        </span>
        <span
          style={{
            fontSize: '13px',
            fontWeight: 700,
            color: isCurrentTurn ? 'var(--text-gold)' : 'var(--text-primary)',
            maxWidth: '80px',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {player.playerId}
        </span>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', color: 'var(--text-secondary)' }}>
        <span>🎴 {player.handCount}</span>
        <span>•</span>
        <span>🔫 {player.shotsUsed}/6</span>
      </div>

      {isCurrentTurn && (
        <span style={{ fontSize: '10px', color: 'var(--accent-gold)', fontWeight: 600, marginTop: '2px' }}>
          Thinking...
        </span>
      )}
      {isEliminated && (
        <span style={{ fontSize: '10px', color: 'var(--text-danger)', fontWeight: 600, marginTop: '2px' }}>
          ELIMINATED
        </span>
      )}
    </div>
  );
};
