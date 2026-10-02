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
        padding: '5px 6px',
        borderRadius: '10px',
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
        minWidth: '78px',
        maxWidth: '96px',
        width: '100%',
        boxSizing: 'border-box',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '3px', width: '100%', marginBottom: '2px' }}>
        <span style={{ fontSize: '12px', flexShrink: 0 }}>
          {isEliminated ? '💀' : isCurrentTurn ? '🎯' : '👤'}
        </span>
        <span
          style={{
            fontSize: '11px',
            fontWeight: 700,
            color: isCurrentTurn ? 'var(--text-gold)' : 'var(--text-primary)',
            maxWidth: wins && wins > 0 ? '48px' : '62px',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
          title={displayName || player.playerId}
        >
          {displayName || player.playerId}
        </span>
        {wins !== undefined && wins > 0 && (
          <span
            style={{
              fontSize: '9px',
              fontWeight: 800,
              color: 'var(--text-gold)',
              background: 'rgba(229, 169, 59, 0.22)',
              border: '1px solid rgba(229, 169, 59, 0.4)',
              borderRadius: '6px',
              padding: '0 3px',
              flexShrink: 0,
            }}
          >
            🏆{wins}
          </span>
        )}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '3px', fontSize: '10px', color: 'var(--text-secondary)', width: '100%' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '3px' }}>
          <span>🎴 {player.handCount} {player.handCount === 1 ? 'card' : 'cards'}</span>
        </div>
        <RouletteChamber shotsUsed={player.shotsUsed} isEliminated={isEliminated} compact />
      </div>

      {isCurrentTurn && (
        <span style={{ fontSize: '9px', color: 'var(--accent-gold)', fontWeight: 600, marginTop: '1px' }}>
          Thinking...
        </span>
      )}
      {isEliminated && (
        <span style={{ fontSize: '9px', color: 'var(--text-danger)', fontWeight: 600, marginTop: '1px' }}>
          ELIMINATED
        </span>
      )}
    </div>
  );
};
