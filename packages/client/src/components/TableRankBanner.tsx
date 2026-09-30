import React from 'react';
import type { TableRank } from '@liars-telegram-game/game-core';

export interface TableRankBannerProps {
  tableRank: TableRank;
}

const RANK_SYMBOLS: Record<TableRank, { label: string; icon: string; file: string }> = {
  KING: { label: 'KING', icon: '👑', file: 'king' },
  QUEEN: { label: 'QUEEN', icon: '👸', file: 'queen' },
  ACE: { label: 'ACE', icon: '🅰️', file: 'ace' },
};

export const TableRankBanner: React.FC<TableRankBannerProps> = ({ tableRank }) => {
  const info = RANK_SYMBOLS[tableRank] ?? { label: tableRank, icon: '🃏', file: 'king' };

  return (
    <div
      data-testid="table-rank-banner"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '8px',
        background: 'linear-gradient(180deg, #241d13 0%, #15110b 100%)',
        border: '1px solid var(--border-gold)',
        borderRadius: '20px',
        padding: '6px 16px',
        boxShadow: '0 4px 12px rgba(0, 0, 0, 0.4)',
      }}
    >
      <div
        style={{
          width: '20px',
          height: '28px',
          borderRadius: '3px',
          overflow: 'hidden',
          border: '1px solid var(--border-gold)',
          boxShadow: '0 2px 4px rgba(0,0,0,0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: '#1b1f2b',
        }}
      >
        <picture style={{ width: '100%', height: '100%', display: 'block' }}>
          <source srcSet={`/cards/${info.file}.webp`} type="image/webp" />
          <img
            src={`/cards/${info.file}.png`}
            alt={info.label}
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
          />
        </picture>
      </div>
      <span
        style={{
          color: 'var(--text-gold)',
          fontWeight: 700,
          fontSize: '13px',
          letterSpacing: '1px',
          textTransform: 'uppercase',
        }}
      >
        Table: {info.label}
      </span>
    </div>
  );
};
