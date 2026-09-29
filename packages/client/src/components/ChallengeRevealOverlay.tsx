import React, { useEffect } from 'react';
import { RouletteChamber } from './RouletteChamber.js';

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
  shotsUsed?: number;
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
  shotsUsed,
  onDismiss,
}) => {
  const isLethal = rouletteOutcome === 'LETHAL';
  const effectiveShots = shotsUsed !== undefined ? shotsUsed : (isLethal ? 6 : 1);

  // Auto-dismiss after 8 seconds if not dismissed manually
  useEffect(() => {
    const timer = setTimeout(() => {
      onDismiss();
    }, 8000);
    return () => clearTimeout(timer);
  }, [onDismiss]);

  return (
    <div
      data-testid="challenge-reveal-overlay"
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(5, 7, 10, 0.88)',
        backdropFilter: 'blur(8px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1200,
        padding: '16px',
        animation: 'fadeIn 0.25s ease-out',
      }}
    >
      <div
        style={{
          background: 'linear-gradient(180deg, #1f2535 0%, #10141e 100%)',
          border: `2px solid ${isLie ? 'var(--accent-gold, #e5a93b)' : 'var(--accent-crimson, #c93b3b)'}`,
          borderRadius: '18px',
          padding: '24px 20px',
          maxWidth: '370px',
          width: '100%',
          textAlign: 'center',
          boxShadow: '0 16px 48px rgba(0, 0, 0, 0.9)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '14px',
        }}
      >
        {/* Header */}
        <div style={{ fontSize: '12px', textTransform: 'uppercase', color: 'var(--text-secondary)', letterSpacing: '1.5px', fontWeight: 700 }}>
          👁️ LIAR CHALLENGE RESOLUTION
        </div>

        <div data-testid="challenge-title" style={{ fontSize: '15px', color: 'var(--text-primary)', fontWeight: 600 }}>
          <span style={{ color: 'var(--accent-gold)' }}>{callerId}</span> challenged{' '}
          <span style={{ color: 'var(--accent-gold)' }}>{accusedId}</span>
        </div>

        {/* Revealed Cards */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px', width: '100%' }}>
          <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
            Claimed Table Rank: <strong>{tableRank}</strong>
          </span>
          <div style={{ display: 'flex', gap: '10px', justifyContent: 'center', marginTop: '4px' }}>
            {revealedCards.map((card) => {
              const matchesClaim = card.rank === tableRank || card.rank === 'JOKER';
              return (
                <div
                  key={card.id}
                  data-testid={`revealed-card-${card.id}`}
                  style={{
                    width: '56px',
                    height: '80px',
                    borderRadius: '8px',
                    background: 'linear-gradient(180deg, #2a3347 0%, #151924 100%)',
                    border: `2px solid ${matchesClaim ? '#22c55e' : '#ef4444'}`,
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '6px 4px',
                    fontWeight: 800,
                    fontSize: '15px',
                    color: card.rank === 'JOKER' ? '#a855f7' : 'var(--text-gold)',
                    boxShadow: matchesClaim ? '0 0 10px rgba(34, 197, 94, 0.3)' : '0 0 10px rgba(239, 68, 68, 0.4)',
                  }}
                >
                  <div style={{ fontSize: '10px', color: matchesClaim ? '#4ade80' : '#f87171' }}>
                    {matchesClaim ? '✔' : '✖'}
                  </div>
                  <span style={{ fontSize: '18px' }}>{card.rank === 'JOKER' ? '★' : card.rank[0]}</span>
                  <span style={{ fontSize: '9px', letterSpacing: '0.5px' }}>{card.rank}</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Verdict */}
        <div
          data-testid="challenge-verdict"
          style={{
            padding: '10px 16px',
            borderRadius: '10px',
            fontWeight: 800,
            fontSize: '16px',
            background: isLie ? 'rgba(229, 169, 59, 0.18)' : 'rgba(59, 130, 246, 0.18)',
            color: isLie ? 'var(--text-gold)' : '#60a5fa',
            border: `1px solid ${isLie ? 'var(--border-gold)' : '#3b82f6'}`,
            width: '100%',
            letterSpacing: '0.5px',
          }}
        >
          {isLie ? '🚨 BLUFF CAUGHT! (LIE)' : '🛡️ HONEST PLAY! (TRUTH)'}
        </div>

        {/* Russian Roulette Cylinder & Consequence */}
        <div
          data-testid="roulette-outcome"
          style={{
            background: isLethal ? 'rgba(201, 59, 59, 0.22)' : 'rgba(34, 197, 94, 0.16)',
            border: `1px solid ${isLethal ? 'var(--border-crimson)' : '#22c55e'}`,
            borderRadius: '12px',
            padding: '14px',
            width: '100%',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '8px',
          }}
        >
          <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
            Trigger pulled by: <strong style={{ color: 'var(--text-primary)' }}>{shooterId}</strong>
          </div>

          {/* Visual 6-Chamber Revolver Cylinder */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', margin: '2px 0' }}>
            <span style={{ fontSize: '12px', color: 'var(--text-muted)', fontWeight: 600 }}>CYLINDER:</span>
            <RouletteChamber shotsUsed={effectiveShots} isEliminated={isLethal} />
          </div>

          <div
            style={{
              fontSize: '18px',
              fontWeight: 800,
              marginTop: '2px',
              color: isLethal ? 'var(--text-danger)' : '#4ade80',
            }}
          >
            {isLethal ? '💥 *BANG!* LETHAL BULLET!' : '💨 *CLICK* EMPTY CHAMBER!'}
          </div>
          <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
            {isLethal ? `${shooterId} has been ELIMINATED.` : `${shooterId} survives the chamber.`}
          </div>
        </div>

        {/* Dismiss Button */}
        <button
          data-testid="btn-dismiss-reveal"
          className="btn-primary"
          onClick={onDismiss}
          style={{
            width: '100%',
            padding: '12px',
            fontWeight: 700,
            fontSize: '14px',
            borderRadius: '10px',
            cursor: 'pointer',
          }}
        >
          CONTINUE ➔
        </button>
      </div>
    </div>
  );
};
