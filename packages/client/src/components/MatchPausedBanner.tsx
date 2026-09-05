import React from 'react';

export interface MatchPausedBannerProps {
  visible: boolean;
}

export const MatchPausedBanner: React.FC<MatchPausedBannerProps> = ({ visible }) => {
  if (!visible) {
    return null;
  }

  return (
    <div
      data-testid="match-paused-banner"
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        backgroundColor: '#b45309',
        color: '#ffffff',
        padding: '10px 16px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '8px',
        fontWeight: 700,
        fontSize: '13px',
        zIndex: 900,
        boxShadow: '0 4px 12px rgba(0, 0, 0, 0.4)',
        textAlign: 'center',
      }}
    >
      <span style={{ fontSize: '16px' }}>⏸️</span>
      <span>MATCH PAUSED: No active players connected. Turn timer is halted. Reconnect to resume.</span>
    </div>
  );
};
