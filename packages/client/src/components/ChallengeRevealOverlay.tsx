import React, { useEffect } from 'react';
import { RouletteChamber } from './RouletteChamber.js';
import { soundManager } from '../sound.js';
import { getPlayerDisplayName } from '../player-names.js';

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
  playerNames?: Record<string, string>;
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
  playerNames,
  onDismiss,
}) => {
  const isLethal = rouletteOutcome === 'LETHAL';
  const effectiveShots = shotsUsed !== undefined ? shotsUsed : (isLethal ? 6 : 1);

  const callerName = getPlayerDisplayName(callerId, playerNames);
  const accusedName = getPlayerDisplayName(accusedId, playerNames);
  const shooterName = getPlayerDisplayName(shooterId, playerNames);

  // Play gunshot sound immediately upon mount
  useEffect(() => {
    if (isLethal) {
      soundManager.playGunBang();
      const elimTimer = setTimeout(() => {
        soundManager.playElimination();
      }, 700);
      return () => clearTimeout(elimTimer);
    } else {
      soundManager.playGunClick();
    }
  }, [isLethal]);

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
          <span style={{ color: 'var(--accent-gold)' }}>{callerName}</span> challenged{' '}
          <span style={{ color: 'var(--accent-gold)' }}>{accusedName}</span>
        </div>

        {/* Revealed Cards */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px', width: '100%' }}>
          <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
            Claimed Table Rank: <strong style={{ color: 'var(--text-gold)' }}>{tableRank}</strong>
          </span>
          <div style={{ display: 'flex', gap: '14px', justifyContent: 'center', marginTop: '6px', flexWrap: 'wrap' }}>
            {revealedCards.map((card) => {
              const matchesClaim = card.rank === tableRank || card.rank === 'JOKER';
              const rank = card.rank.toLowerCase();
              return (
                <div
                  key={card.id}
                  data-testid={`revealed-card-${card.id}`}
                  style={{
                    width: '68px',
                    height: '95px',
                    aspectRatio: '1060 / 1484',
                    borderRadius: '8px',
                    position: 'relative',
                    border: `2.5px solid ${matchesClaim ? '#22c55e' : '#ef4444'}`,
                    boxShadow: matchesClaim
                      ? '0 0 16px rgba(34, 197, 94, 0.6), 0 4px 12px rgba(0,0,0,0.5)'
                      : '0 0 16px rgba(239, 68, 68, 0.6), 0 4px 12px rgba(0,0,0,0.5)',
                    backgroundColor: '#1b1f2b',
                    overflow: 'visible',
                  }}
                >
                  <picture style={{ width: '100%', height: '100%', display: 'block' }}>
                    <source srcSet={`/cards/${rank}.webp`} type="image/webp" />
                    <img
                      src={`/cards/${rank}.png`}
                      alt={card.rank}
                      style={{
                        width: '100%',
                        height: '100%',
                        objectFit: 'cover',
                        borderRadius: '5px',
                        display: 'block',
                      }}
                    />
                  </picture>

                  {/* Verdict Badge */}
                  <div
                    style={{
                      position: 'absolute',
                      top: '-10px',
                      left: '50%',
                      transform: 'translateX(-50%)',
                      background: matchesClaim ? '#166534' : '#991b1b',
                      color: '#fff',
                      borderRadius: '10px',
                      padding: '2px 8px',
                      fontSize: '10px',
                      fontWeight: 800,
                      letterSpacing: '0.5px',
                      border: `1px solid ${matchesClaim ? '#4ade80' : '#f87171'}`,
                      boxShadow: '0 2px 4px rgba(0,0,0,0.6)',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {matchesClaim ? '✔ TRUTH' : '✖ LIE'}
                  </div>
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
            Trigger pulled by: <strong style={{ color: 'var(--text-primary)' }}>{shooterName}</strong>
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
            {isLethal ? `${shooterName} has been ELIMINATED.` : `${shooterName} survives the chamber.`}
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
