import React from 'react';
import type { PublicPlayerProjection } from '@liars-telegram-game/room-runtime';
import { RouletteChamber } from './RouletteChamber.js';

export interface OpponentSeatProps {
  player: PublicPlayerProjection;
  isCurrentTurn: boolean;
  position: 'top' | 'left' | 'right';
  displayName?: string;
  wins?: number;
}

export const OpponentSeat: React.FC<OpponentSeatProps> = ({
  player,
  isCurrentTurn,
  position,
  displayName,
  wins,
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
          ? 'linear-gradient(180deg, rgba(45, 36, 20, 0.92) 0%, rgba(24, 20, 12, 0.95) 100%)'
          : 'rgba(23, 28, 40, 0.85)',
        backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)',
        border: isCurrentTurn
          ? '2px solid var(--accent-gold)'
          : '1px solid var(--border-subtle)',
        boxShadow: isCurrentTurn
          ? '0 0 16px rgba(229, 169, 59, 0.4)'
          : '0 4px 14px rgba(0, 0, 0, 0.45)',
        opacity: isEliminated ? 0.45 : 1,
        transition: 'all 0.2s ease',
        minWidth: '90px',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '5px', marginBottom: '4px' }}>
        <span style={{ fontSize: '14px' }}>
          {isEliminated ? '💀' : isCurrentTurn ? '🎯' : '👤'}
        </span>
        <span
          style={{
            fontSize: '13px',
            fontWeight: 700,
            color: isCurrentTurn ? 'var(--text-gold)' : 'var(--text-primary)',
            maxWidth: '75px',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {displayName || player.playerId}
        </span>
        {wins !== undefined && wins > 0 && (
          <span
            style={{
              fontSize: '10px',
              fontWeight: 800,
              color: 'var(--text-gold)',
              background: 'rgba(229, 169, 59, 0.22)',
              border: '1px solid rgba(229, 169, 59, 0.4)',
              borderRadius: '8px',
              padding: '0 4px',
            }}
          >
            🏆{wins}
          </span>
        )}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px', fontSize: '11px', color: 'var(--text-secondary)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          <span>🎴 {player.handCount} {player.handCount === 1 ? 'card' : 'cards'}</span>
        </div>
        <RouletteChamber shotsUsed={player.shotsUsed} isEliminated={isEliminated} />
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
