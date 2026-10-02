import React from 'react';

export interface RouletteChamberProps {
  shotsUsed: number;
  isEliminated?: boolean;
  compact?: boolean;
}

export const RouletteChamber: React.FC<RouletteChamberProps> = ({
  shotsUsed,
  isEliminated = false,
  compact = false,
}) => {
  const totalChambers = 6;
  const chamberSize = compact ? 8 : 12;
  const chamberGap = compact ? 2 : 4;
  const iconSize = compact ? '11px' : '14px';

  return (
    <div
      data-testid="roulette-chamber"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: compact ? '4px' : '6px',
        background: 'rgba(0, 0, 0, 0.4)',
        border: '1px solid var(--border-subtle)',
        borderRadius: compact ? '12px' : '16px',
        padding: compact ? '2px 5px' : '4px 10px',
      }}
    >
      <span style={{ fontSize: iconSize, marginRight: compact ? '0' : '2px' }}>
        {isEliminated ? '💀' : '🔫'}
      </span>

      <div style={{ display: 'flex', gap: `${chamberGap}px` }}>
        {Array.from({ length: totalChambers }).map((_, index) => {
          const isSpent = index < shotsUsed;
          const isCurrent = index === shotsUsed && !isEliminated;

          return (
            <div
              key={index}
              data-testid={`chamber-${index}`}
              style={{
                width: `${chamberSize}px`,
                height: `${chamberSize}px`,
                borderRadius: '50%',
                background: isSpent
                  ? '#4a5568'
                  : isCurrent
                  ? 'var(--accent-crimson)'
                  : '#1f2430',
                border: isCurrent
                  ? `${compact ? 1.5 : 2}px solid #ff6b6b`
                  : isSpent
                  ? '1px solid #718096'
                  : '1px solid #2d3748',
                boxShadow: isCurrent ? '0 0 6px rgba(255, 107, 107, 0.8)' : 'none',
                transition: 'all 0.2s ease',
              }}
            />
          );
        })}
      </div>

      <span style={{ fontSize: compact ? '9px' : '11px', color: 'var(--text-secondary)', marginLeft: compact ? '1px' : '2px', fontWeight: 600 }}>
        {shotsUsed}/6
      </span>
    </div>
  );
};
