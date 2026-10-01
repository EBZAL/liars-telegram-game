import React, { useEffect } from 'react';
import { soundManager } from '../sound.js';
import { getPlayerDisplayName } from '../player-names.js';

export interface MatchWinnerOverlayProps {
  winnerId: string;
  isOwnWin: boolean;
  playerNames?: Record<string, string>;
  winCount?: number;
  onPlayAgain?: () => void;
  onReturnToLobby: () => void;
}

export const MatchWinnerOverlay: React.FC<MatchWinnerOverlayProps> = ({
  winnerId,
  isOwnWin,
  playerNames,
  winCount,
  onPlayAgain,
  onReturnToLobby,
}) => {
  const winnerName = getPlayerDisplayName(winnerId, playerNames);

  useEffect(() => {
    if (isOwnWin) {
      soundManager.playVictory();
    }
  }, [isOwnWin]);

  return (
    <div
      data-testid="match-winner-overlay"
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(7, 9, 13, 0.92)',
        backdropFilter: 'blur(8px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1300,
        padding: '16px',
        animation: 'fadeIn 0.3s ease-out',
      }}
    >
      <div
        style={{
          background: 'linear-gradient(180deg, #241e15 0%, #14110c 100%)',
          border: '2px solid var(--accent-gold)',
          borderRadius: '20px',
          padding: '32px 24px',
          maxWidth: '360px',
          width: '100%',
          textAlign: 'center',
          boxShadow: '0 16px 48px rgba(0, 0, 0, 0.9)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '16px',
        }}
      >
        <div style={{ fontSize: '48px', lineHeight: 1 }}>
          {isOwnWin ? '🏆' : '👑'}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <span style={{ fontSize: '12px', letterSpacing: '1.5px', textTransform: 'uppercase', color: 'var(--accent-gold)', fontWeight: 800 }}>
            {isOwnWin ? 'VICTORY!' : 'MATCH CONCLUDED'}
          </span>
          <h2 style={{ margin: 0, fontSize: '22px', fontWeight: 800, color: 'var(--text-primary)' }}>
            {isOwnWin ? 'YOU ARE THE SOLE SURVIVOR!' : `${winnerName} WON THE MATCH!`}
          </h2>
          <p style={{ margin: '8px 0 0 0', fontSize: '13px', color: 'var(--text-secondary)' }}>
            All other contenders have fallen to Russian Roulette.
          </p>
          {winCount !== undefined && winCount > 0 && (
            <div
              data-testid="winner-total-wins"
              style={{
                marginTop: '10px',
                fontSize: '12px',
                fontWeight: 700,
                color: 'var(--text-gold)',
                background: 'rgba(229, 169, 59, 0.2)',
                border: '1px solid var(--border-gold)',
                borderRadius: '12px',
                padding: '4px 12px',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
              }}
            >
              🏆 Total Room Victories: {winCount}
            </div>
          )}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', width: '100%', marginTop: '8px' }}>
          {onPlayAgain && (
            <button
              data-testid="btn-play-again"
              className="btn-primary"
              onClick={onPlayAgain}
              style={{
                width: '100%',
                padding: '14px',
                fontSize: '15px',
                fontWeight: 800,
                letterSpacing: '0.5px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
              }}
            >
              <span>🔄</span> PLAY AGAIN (بازی مجدد)
            </button>
          )}

          <button
            data-testid="btn-return-lobby"
            className="btn-secondary"
            onClick={onReturnToLobby}
            style={{ width: '100%', padding: '12px', fontSize: '13px' }}
          >
            🚪 Leave Room
          </button>
        </div>
      </div>
    </div>
  );
};
