import React from 'react';
import type { PrivateCardProjection } from '@liars-telegram-game/room-runtime';
import type { CardRank } from '@liars-telegram-game/game-core';

export interface PlayerHandProps {
  hand: PrivateCardProjection[];
  selectedCardIds: string[];
  onToggleCard: (cardId: string) => void;
  disabled?: boolean;
}

const CARD_RANK_DISPLAY: Record<CardRank, { label: string; icon: string; color: string }> = {
  KING: { label: 'K', icon: '👑', color: '#e5a93b' },
  QUEEN: { label: 'Q', icon: '👸', color: '#3b82f6' },
  ACE: { label: 'A', icon: '🅰️', color: '#10b981' },
  JOKER: { label: '★', icon: '🃏', color: '#a855f7' },
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
        const rankInfo = CARD_RANK_DISPLAY[card.rank] ?? { label: '?', icon: '🎴', color: '#fff' };

        return (
          <div
            key={card.id}
            data-testid={`card-${card.id}`}
            onClick={() => {
              if (!disabled) {
                onToggleCard(card.id);
              }
            }}
            style={{
              width: 'var(--card-width)',
              height: 'var(--card-height)',
              background: isSelected
                ? 'linear-gradient(180deg, #322617 0%, #1c150c 100%)'
                : 'linear-gradient(180deg, #242938 0%, #151822 100%)',
              border: isSelected
                ? '2px solid var(--accent-gold)'
                : '1px solid var(--border-subtle)',
              borderRadius: 'var(--card-radius)',
              transform: isSelected ? 'translateY(-14px)' : 'none',
              transition: 'transform 0.15s cubic-bezier(0.4, 0, 0.2, 1), border-color 0.15s ease',
              cursor: disabled ? 'not-allowed' : 'pointer',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
              padding: '8px',
              boxShadow: isSelected
                ? '0 8px 24px rgba(229, 169, 59, 0.35)'
                : '0 4px 12px rgba(0, 0, 0, 0.4)',
              userSelect: 'none',
              position: 'relative',
            }}
          >
            {/* Top Left Rank */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '2px' }}>
              <span style={{ fontSize: '14px', fontWeight: 800, color: rankInfo.color }}>
                {rankInfo.label}
              </span>
            </div>

            {/* Center Icon */}
            <div style={{ alignSelf: 'center', fontSize: '24px' }}>
              {rankInfo.icon}
            </div>

            {/* Bottom Right Rank */}
            <div style={{ alignSelf: 'flex-end', fontSize: '12px', fontWeight: 700, color: rankInfo.color }}>
              {card.rank === 'JOKER' ? 'WILD' : card.rank}
            </div>

            {/* Selection Checkmark */}
            {isSelected && (
              <div
                style={{
                  position: 'absolute',
                  top: '-8px',
                  right: '-8px',
                  background: 'var(--accent-gold)',
                  color: '#000',
                  borderRadius: '50%',
                  width: '18px',
                  height: '18px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '11px',
                  fontWeight: 900,
                  boxShadow: '0 2px 4px rgba(0,0,0,0.5)',
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
