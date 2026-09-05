import React from 'react';

export interface ActionControlsProps {
  isOwnTurn: boolean;
  isMandatoryCall: boolean;
  canPlay: boolean;
  canChallenge: boolean;
  selectedCount: number;
  onPlay: () => void;
  onChallenge: () => void;
}

export const ActionControls: React.FC<ActionControlsProps> = ({
  isOwnTurn,
  isMandatoryCall,
  canPlay,
  canChallenge,
  selectedCount,
  onPlay,
  onChallenge,
}) => {
  return (
    <div
      data-testid="action-controls"
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '8px',
        width: '100%',
        maxWidth: '360px',
        margin: '0 auto',
        padding: '0 8px',
      }}
    >
      {/* Mandatory Challenge Banner */}
      {isMandatoryCall && (
        <div
          data-testid="mandatory-call-banner"
          style={{
            background: 'linear-gradient(90deg, #992424 0%, #c93b3b 100%)',
            color: '#fff',
            fontSize: '12px',
            fontWeight: 700,
            padding: '6px 12px',
            borderRadius: '8px',
            textAlign: 'center',
            width: '100%',
            letterSpacing: '0.5px',
            boxShadow: '0 2px 8px rgba(201, 59, 59, 0.4)',
          }}
        >
          ⚠️ MANDATORY CHALLENGE: You must Call Liar!
        </div>
      )}

      {/* Turn Notice if Not Our Turn */}
      {!isOwnTurn && (
        <div
          style={{
            color: 'var(--text-secondary)',
            fontSize: '13px',
            fontStyle: 'italic',
            textAlign: 'center',
            padding: '8px 0',
          }}
        >
          Waiting for other player's move...
        </div>
      )}

      {/* Action Buttons */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: '12px',
          width: '100%',
        }}
      >
        <button
          data-testid="btn-play-cards"
          className="btn-primary"
          disabled={!canPlay}
          onClick={onPlay}
          style={{ width: '100%' }}
        >
          {selectedCount > 0 ? `PLAY (${selectedCount})` : 'PLAY CARDS'}
        </button>

        <button
          data-testid="btn-call-liar"
          className="btn-danger"
          disabled={!canChallenge}
          onClick={onChallenge}
          style={{ width: '100%' }}
        >
          CALL LIAR 👁️
        </button>
      </div>
    </div>
  );
};
