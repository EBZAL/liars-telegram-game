import React from 'react';

export interface RouletteChamberProps {
  shotsUsed: number;
  isEliminated?: boolean;
}

export const RouletteChamber: React.FC<RouletteChamberProps> = ({
  shotsUsed,
  isEliminated = false,
}) => {
  const totalChambers = 6;

  return (
    <div
      data-testid="roulette-chamber"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '6px',
        background: 'rgba(0, 0, 0, 0.4)',
        border: '1px solid var(--border-subtle)',
        borderRadius: '16px',
        padding: '4px 10px',
      }}
    >
      <span style={{ fontSize: '14px', marginRight: '2px' }}>
        {isEliminated ? '💀' : '🔫'}
      </span>

      <div style={{ display: 'flex', gap: '4px' }}>
        {Array.from({ length: totalChambers }).map((_, index) => {
          const isSpent = index < shotsUsed;
          const isCurrent = index === shotsUsed && !isEliminated;

          return (
            <div
              key={index}
              data-testid={`chamber-${index}`}
              style={{
                width: '12px',
                height: '12px',
                borderRadius: '50%',
                background: isSpent
                  ? '#4a5568'
                  : isCurrent
                  ? 'var(--accent-crimson)'
                  : '#1f2430',
                border: isCurrent
                  ? '2px solid #ff6b6b'
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

      <span style={{ fontSize: '11px', color: 'var(--text-secondary)', marginLeft: '2px', fontWeight: 600 }}>
        {shotsUsed}/6
      </span>
    </div>
  );
};
