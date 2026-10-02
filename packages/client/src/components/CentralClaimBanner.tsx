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
        borderRadius: '12px',
        padding: '8px 10px',
        width: '100%',
        maxWidth: '175px',
        margin: '4px auto',
        boxShadow: '0 6px 20px rgba(0, 0, 0, 0.6), inset 0 0 12px rgba(0, 0, 0, 0.4)',
        textAlign: 'center',
        boxSizing: 'border-box',
      }}
    >
      {previousPlay ? (
        <>
          <span style={{ fontSize: '9px', textTransform: 'uppercase', color: 'var(--text-secondary)', letterSpacing: '0.8px', fontWeight: 600 }}>
            Current Play
          </span>
          <div
            style={{
              margin: '2px 0',
              fontSize: '12px',
              fontWeight: 700,
              color: 'var(--text-primary)',
              maxWidth: '145px',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            <span style={{ color: 'var(--accent-gold)' }}>
              {getPlayerDisplayName(previousPlay.playerId, playerNames)}
            </span>{' '}
            claimed
          </div>
          <div style={{ fontSize: '15px', fontWeight: 800, color: 'var(--text-gold)', letterSpacing: '0.5px' }}>
            {previousPlay.count} × {previousPlay.claimedRank}
          </div>
          {centralPileCount > 0 && (
            <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>
              Pile: {centralPileCount} cards
            </span>
          )}
          {/* Visual Face-down Card Backs */}
          <div style={{ display: 'flex', gap: '5px', justifyContent: 'center', marginTop: '6px' }}>
            {Array.from({ length: previousPlay.count }).map((_, i) => (
              <div
                key={i}
                style={{
                  width: '24px',
                  height: '34px',
                  aspectRatio: '1060 / 1484',
                  borderRadius: '3px',
                  border: '1px solid var(--border-gold)',
                  boxShadow: '0 2px 6px rgba(0,0,0,0.6)',
                  overflow: 'hidden',
                  backgroundColor: '#1b1f2b',
                  flexShrink: 0,
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
          <div
            style={{
              width: '26px',
              height: '36px',
              marginBottom: '4px',
              borderRadius: '3px',
              overflow: 'hidden',
              border: '1px solid var(--border-gold)',
              boxShadow: '0 2px 6px rgba(0,0,0,0.5)',
            }}
          >
            <picture style={{ width: '100%', height: '100%', display: 'block' }}>
              <source srcSet="/cards/card-back.webp" type="image/webp" />
              <img src="/cards/card-back.png" alt="Deck" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            </picture>
          </div>
          <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-gold)' }}>
            First Turn of Round
          </span>
          <span style={{ fontSize: '10px', color: 'var(--text-secondary)', marginTop: '2px' }}>
            Play 1–3 cards matching rank
          </span>
        </>
      )}
    </div>
  );
};
