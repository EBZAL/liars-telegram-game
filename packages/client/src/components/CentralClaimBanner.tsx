import React from 'react';
import type { PublicPreviousPlayProjection } from '@liars-telegram-game/room-runtime';
import { getPlayerDisplayName } from '../player-names.js';

export interface CentralClaimBannerProps {
  previousPlay: PublicPreviousPlayProjection | null;
  centralPileCount?: number;
  playerNames?: Record<string, string>;
}

export const CentralClaimBanner: React.FC<CentralClaimBannerProps> = ({
  previousPlay,
  centralPileCount = 0,
  playerNames,
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
        padding: '16px 20px',
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
          <div style={{ margin: '6px 0', fontSize: '15px', fontWeight: 700, color: 'var(--text-primary)' }}>
            <span style={{ color: 'var(--accent-gold)' }}>
              {getPlayerDisplayName(previousPlay.playerId, playerNames)}
            </span>{' '}
            claimed
          </div>
          <div style={{ fontSize: '20px', fontWeight: 800, color: 'var(--text-gold)', letterSpacing: '0.5px' }}>
            {previousPlay.count} × {previousPlay.claimedRank}
          </div>
          {centralPileCount > 0 && (
            <span style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>
              Pile: {centralPileCount} cards
            </span>
          )}
          {/* Visual Face-down Card Backs */}
          <div style={{ display: 'flex', gap: '8px', justifyContent: 'center', marginTop: '10px' }}>
            {Array.from({ length: previousPlay.count }).map((_, i) => (
              <div
                key={i}
                style={{
                  width: '32px',
                  height: '45px',
                  aspectRatio: '1060 / 1484',
                  borderRadius: '4px',
                  border: '1px solid var(--border-gold)',
                  boxShadow: '0 4px 8px rgba(0,0,0,0.6)',
                  overflow: 'hidden',
                  backgroundColor: '#1b1f2b',
                }}
              >
                <picture style={{ width: '100%', height: '100%', display: 'block' }}>
                  <source srcSet="/cards/card-back.webp" type="image/webp" />
                  <img
                    src="/cards/card-back.png"
                    alt="Card back"
                    style={{
                      width: '100%',
                      height: '100%',
                      objectFit: 'cover',
                      display: 'block',
                    }}
                  />
                </picture>
              </div>
            ))}
          </div>
        </>
      ) : (
        <>
          <div style={{ width: '36px', height: '50px', marginBottom: '8px', borderRadius: '4px', overflow: 'hidden', border: '1px solid var(--border-gold)', boxShadow: '0 4px 10px rgba(0,0,0,0.5)' }}>
            <picture style={{ width: '100%', height: '100%', display: 'block' }}>
              <source srcSet="/cards/card-back.webp" type="image/webp" />
              <img src="/cards/card-back.png" alt="Deck" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            </picture>
          </div>
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
