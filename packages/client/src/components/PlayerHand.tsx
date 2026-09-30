import React from 'react';
import type { PrivateCardProjection } from '@liars-telegram-game/room-runtime';
import type { CardRank } from '@liars-telegram-game/game-core';
import { soundManager } from '../sound.js';

export interface PlayerHandProps {
  hand: PrivateCardProjection[];
  selectedCardIds: string[];
  onToggleCard: (cardId: string) => void;
  disabled?: boolean;
}

export const CARD_IMAGE_SOURCES: Record<CardRank, { webp: string; png: string; label: string }> = {
  KING: { webp: '/cards/king.webp', png: '/cards/king.png', label: 'King' },
  QUEEN: { webp: '/cards/queen.webp', png: '/cards/queen.png', label: 'Queen' },
  ACE: { webp: '/cards/ace.webp', png: '/cards/ace.png', label: 'Ace' },
  JOKER: { webp: '/cards/joker.webp', png: '/cards/joker.png', label: 'Joker' },
};

export const PlayerHand: React.FC<PlayerHandProps> = ({
  hand,
  selectedCardIds,
  onToggleCard,
  disabled = false,
}) => {
  return (
    <div
      data-testid="player-hand"
      style={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'flex-end',
        gap: '8px',
        padding: '16px 8px 8px 8px',
        maxWidth: '100%',
        overflowX: 'auto',
      }}
    >
      {hand.map((card) => {
        const isSelected = selectedCardIds.includes(card.id);
        const imgInfo = CARD_IMAGE_SOURCES[card.rank] ?? CARD_IMAGE_SOURCES.KING;

        return (
          <div
            key={card.id}
            data-testid={`card-${card.id}`}
            data-card-rank={card.rank}
            onClick={() => {
              if (!disabled) {
                soundManager.playCardSelect();
                onToggleCard(card.id);
              }
            }}
            style={{
              width: 'var(--card-width)',
              height: 'var(--card-height)',
              aspectRatio: '1060 / 1484',
              borderRadius: 'var(--card-radius)',
              transform: isSelected ? 'translateY(-16px) scale(1.05)' : 'none',
              transition:
                'transform 0.18s cubic-bezier(0.2, 0.8, 0.2, 1), box-shadow 0.18s ease, border-color 0.18s ease',
              cursor: disabled ? 'not-allowed' : 'pointer',
              position: 'relative',
              userSelect: 'none',
              boxShadow: isSelected
                ? '0 12px 28px rgba(229, 169, 59, 0.45), 0 0 12px rgba(229, 169, 59, 0.7)'
                : '0 6px 16px rgba(0, 0, 0, 0.55)',
              border: isSelected ? '2px solid var(--accent-gold)' : '1px solid rgba(255, 255, 255, 0.12)',
              backgroundColor: '#1b1f2b',
              flexShrink: 0,
            }}
          >
            <picture style={{ width: '100%', height: '100%', display: 'block' }}>
              <source srcSet={imgInfo.webp} type="image/webp" />
              <img
                src={imgInfo.png}
                alt={imgInfo.label}
                loading="eager"
                style={{
                  width: '100%',
                  height: '100%',
                  objectFit: 'cover',
                  borderRadius: 'calc(var(--card-radius) - 1px)',
                  display: 'block',
                  pointerEvents: 'none',
                }}
              />
            </picture>

            {/* Selection Checkmark */}
            {isSelected && (
              <div
                style={{
                  position: 'absolute',
                  top: '-7px',
                  right: '-7px',
                  background: 'var(--accent-gold)',
                  color: '#000',
                  borderRadius: '50%',
                  width: '20px',
                  height: '20px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '12px',
                  fontWeight: 900,
                  boxShadow: '0 2px 6px rgba(0,0,0,0.6)',
                  border: '1.5px solid #fff',
                  zIndex: 2,
                }}
              >
                ✓
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};
