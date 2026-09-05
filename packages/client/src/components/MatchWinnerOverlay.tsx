import React from 'react';

export interface MatchWinnerOverlayProps {
  winnerId: string;
  isOwnWin: boolean;
  onReturnToLobby: () => void;
}

export const MatchWinnerOverlay: React.FC<MatchWinnerOverlayProps> = ({
  winnerId,
  isOwnWin,
  onReturnToLobby,
}) => {
  return (
    <div
      data-testid="match-winner-overlay"
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(7, 9, 13, 0.9)',
        backdropFilter: 'blur(8px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1100,
        padding: '16px',
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
            {isOwnWin ? 'YOU ARE THE SOLE SURVIVOR!' : `${winnerId} WON THE MATCH!`}
          </h2>
          <p style={{ margin: '8px 0 0 0', fontSize: '13px', color: 'var(--text-secondary)' }}>
            All other contenders have fallen to Russian Roulette.
          </p>
        </div>

        <button
          data-testid="btn-return-lobby"
          className="btn-primary"
          onClick={onReturnToLobby}
          style={{ width: '100%', marginTop: '8px', padding: '14px' }}
        >
          RETURN TO LOBBY
        </button>
      </div>
    </div>
  );
};
