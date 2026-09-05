import React from 'react';

export interface RevealedCard {
  id: string;
  rank: string;
}

export interface ChallengeRevealOverlayProps {
  callerId: string;
  accusedId: string;
  revealedCards: RevealedCard[];
  tableRank: string;
  isLie: boolean;
  shooterId: string;
  rouletteOutcome: 'BLANK' | 'LETHAL';
  onDismiss: () => void;
}

export const ChallengeRevealOverlay: React.FC<ChallengeRevealOverlayProps> = ({
  callerId,
  accusedId,
  revealedCards,
  tableRank,
  isLie,
  shooterId,
  rouletteOutcome,
  onDismiss,
}) => {
  const isLethal = rouletteOutcome === 'LETHAL';

  return (
    <div
      data-testid="challenge-reveal-overlay"
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(5, 7, 10, 0.85)',
        backdropFilter: 'blur(6px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
        padding: '16px',
      }}
    >
      <div
        style={{
          background: 'linear-gradient(180deg, #1c2230 0%, #11151f 100%)',
          border: `2px solid ${isLie ? 'var(--accent-gold)' : 'var(--accent-crimson)'}`,
          borderRadius: '16px',
          padding: '24px',
          maxWidth: '360px',
          width: '100%',
          textAlign: 'center',
          boxShadow: '0 12px 40px rgba(0, 0, 0, 0.8)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '16px',
        }}
      >
        {/* Header */}
        <div style={{ fontSize: '13px', textTransform: 'uppercase', color: 'var(--text-secondary)', letterSpacing: '1px' }}>
          👁️ LIAR CHALLENGE RESOLUTION
        </div>

        <div style={{ fontSize: '15px', color: 'var(--text-primary)', fontWeight: 600 }}>
          <span style={{ color: 'var(--accent-gold)' }}>{callerId}</span> challenged{' '}
          <span style={{ color: 'var(--accent-gold)' }}>{accusedId}</span>
        </div>

        {/* Revealed Cards */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px' }}>
          <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
            Claimed Table Rank: {tableRank}
          </span>
          <div style={{ display: 'flex', gap: '8px', justifyContent: 'center', marginTop: '4px' }}>
            {revealedCards.map((card) => (
              <div
                key={card.id}
                data-testid={`revealed-card-${card.id}`}
                style={{
                  width: '48px',
                  height: '70px',
                  borderRadius: '6px',
                  background: 'linear-gradient(180deg, #2a3347 0%, #151924 100%)',
                  border: '1px solid var(--border-gold)',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontWeight: 800,
                  fontSize: '14px',
                  color: card.rank === 'JOKER' ? '#a855f7' : 'var(--text-gold)',
                  boxShadow: '0 4px 10px rgba(0,0,0,0.4)',
                }}
              >
                <span>{card.rank === 'JOKER' ? '★' : card.rank[0]}</span>
                <span style={{ fontSize: '9px', marginTop: '2px' }}>{card.rank}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Verdict */}
        <div
          data-testid="challenge-verdict"
          style={{
            padding: '8px 16px',
            borderRadius: '8px',
            fontWeight: 800,
            fontSize: '16px',
            background: isLie ? 'rgba(229, 169, 59, 0.15)' : 'rgba(59, 130, 246, 0.15)',
            color: isLie ? 'var(--text-gold)' : '#60a5fa',
            border: `1px solid ${isLie ? 'var(--border-gold)' : '#3b82f6'}`,
            width: '100%',
          }}
        >
          {isLie ? '🚨 BLUFF CAUGHT! (LIE)' : '🛡️ HONEST PLAY! (TRUTH)'}
        </div>

        {/* Roulette Consequence */}
        <div
          data-testid="roulette-outcome"
          style={{
            background: isLethal ? 'rgba(201, 59, 59, 0.2)' : 'rgba(34, 197, 94, 0.15)',
            border: `1px solid ${isLethal ? 'var(--border-crimson)' : '#22c55e'}`,
            borderRadius: '10px',
            padding: '12px',
            width: '100%',
          }}
        >
          <div style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
            Shooter: <strong style={{ color: 'var(--text-primary)' }}>{shooterId}</strong>
          </div>
          <div
            style={{
              fontSize: '18px',
              fontWeight: 800,
              marginTop: '4px',
              color: isLethal ? 'var(--text-danger)' : '#4ade80',
            }}
          >
            {isLethal ? '💥 *BANG!* LETHAL BULLET!' : '💨 *CLICK* EMPTY CHAMBER!'}
          </div>
          <div style={{ fontSize: '12px', marginTop: '4px', color: 'var(--text-secondary)' }}>
            {isLethal ? `${shooterId} has been ELIMINATED.` : `${shooterId} survives the chamber.`}
          </div>
        </div>

        {/* Dismiss Button */}
        <button
          data-testid="btn-dismiss-reveal"
          className="btn-primary"
          onClick={onDismiss}
          style={{ width: '100%', marginTop: '4px' }}
        >
          CONTINUE
        </button>
      </div>
    </div>
  );
};
