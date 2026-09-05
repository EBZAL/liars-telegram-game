import React from 'react';
import type { TableRank } from '@liars-telegram-game/game-core';

export interface TableRankBannerProps {
  tableRank: TableRank;
}

const RANK_SYMBOLS: Record<TableRank, { label: string; icon: string }> = {
  KING: { label: 'KING', icon: '👑' },
  QUEEN: { label: 'QUEEN', icon: '👸' },
  ACE: { label: 'ACE', icon: '🅰️' },
};

export const TableRankBanner: React.FC<TableRankBannerProps> = ({ tableRank }) => {
  const info = RANK_SYMBOLS[tableRank] ?? { label: tableRank, icon: '🃏' };

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
      <span style={{ fontSize: '18px' }}>{info.icon}</span>
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
