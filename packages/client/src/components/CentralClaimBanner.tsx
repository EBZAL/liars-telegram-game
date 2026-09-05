import React from 'react';
import type { PublicPreviousPlayProjection } from '@liars-telegram-game/room-runtime';

export interface CentralClaimBannerProps {
  previousPlay: PublicPreviousPlayProjection | null;
  centralPileCount?: number;
}

export const CentralClaimBanner: React.FC<CentralClaimBannerProps> = ({
  previousPlay,
  centralPileCount = 0,
}) => {
  return (
    <div
      data-testid="central-claim-banner"
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'radial-gradient(circle, #1a4332 0%, #0d2119 100%)',
        border: '1px solid var(--accent-velvet-green)',
        borderRadius: '16px',
        padding: '16px 24px',
        minWidth: '220px',
        maxWidth: '320px',
        margin: '12px auto',
        boxShadow: '0 8px 32px rgba(0, 0, 0, 0.6), inset 0 0 16px rgba(0, 0, 0, 0.4)',
        textAlign: 'center',
      }}
    >
      {previousPlay ? (
        <>
          <span style={{ fontSize: '11px', textTransform: 'uppercase', color: 'var(--text-secondary)', letterSpacing: '1px' }}>
            Current Play
          </span>
          <div style={{ margin: '8px 0', fontSize: '15px', fontWeight: 700, color: 'var(--text-primary)' }}>
            <span style={{ color: 'var(--accent-gold)' }}>{previousPlay.playerId}</span> claimed
          </div>
          <div style={{ fontSize: '20px', fontWeight: 800, color: 'var(--text-gold)', letterSpacing: '0.5px' }}>
            {previousPlay.count} × {previousPlay.claimedRank}
          </div>
          {centralPileCount > 0 && (
            <span style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>
              Pile: {centralPileCount} cards
            </span>
          )}
          <div style={{ display: 'flex', gap: '4px', marginTop: '8px' }}>
            {Array.from({ length: previousPlay.count }).map((_, i) => (
              <div
                key={i}
                style={{
                  width: '24px',
                  height: '34px',
                  background: 'linear-gradient(135deg, #2b3347 0%, #171b26 100%)',
                  border: '1px solid #4a5568',
                  borderRadius: '4px',
                  boxShadow: '0 2px 4px rgba(0,0,0,0.4)',
                }}
              />
            ))}
          </div>
        </>
      ) : (
        <>
          <span style={{ fontSize: '24px', marginBottom: '4px' }}>🃏</span>
          <span style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-gold)' }}>
            First Turn of Round
          </span>
          <span style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '4px' }}>
            Play 1 to 3 cards matching table rank
          </span>
        </>
      )}
    </div>
  );
};
