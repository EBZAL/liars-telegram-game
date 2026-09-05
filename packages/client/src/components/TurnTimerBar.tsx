import React, { useEffect, useState } from 'react';

export interface TurnTimerBarProps {
  deadline: number | null;
  totalDurationMs?: number;
}

export const TurnTimerBar: React.FC<TurnTimerBarProps> = ({
  deadline,
  totalDurationMs = 30000,
}) => {
  const [remainingMs, setRemainingMs] = useState<number>(() => {
    if (!deadline) return 0;
    return Math.max(0, deadline - Date.now());
  });

  useEffect(() => {
    if (!deadline) {
      setRemainingMs(0);
      return;
    }

    const interval = setInterval(() => {
      const remaining = Math.max(0, deadline - Date.now());
      setRemainingMs(remaining);
      if (remaining <= 0) {
        clearInterval(interval);
      }
    }, 200);

    return () => clearInterval(interval);
  }, [deadline]);

  if (!deadline) {
    return null;
  }

  const fraction = Math.min(1, Math.max(0, remainingMs / totalDurationMs));
  const percent = Math.round(fraction * 100);
  const isUrgent = remainingMs <= 5000;
  const secondsLeft = Math.ceil(remainingMs / 1000);

  return (
    <div
      data-testid="turn-timer-bar"
      style={{
        width: '100%',
        maxWidth: '360px',
        margin: '6px auto',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '4px',
      }}
    >
      <div
        style={{
          width: '100%',
          height: '6px',
          background: 'rgba(255, 255, 255, 0.1)',
          borderRadius: '3px',
          overflow: 'hidden',
          position: 'relative',
        }}
      >
        <div
          data-testid="turn-timer-progress"
          style={{
            width: `${percent}%`,
            height: '100%',
            background: isUrgent
              ? 'linear-gradient(90deg, #ff4d4d, #c93b3b)'
              : 'linear-gradient(90deg, #e5a93b, #ffd27d)',
            borderRadius: '3px',
            transition: 'width 0.2s linear',
            boxShadow: isUrgent ? '0 0 8px rgba(255, 77, 77, 0.8)' : 'none',
          }}
        />
      </div>
      <span
        style={{
          fontSize: '11px',
          fontWeight: 600,
          color: isUrgent ? 'var(--text-danger)' : 'var(--text-secondary)',
        }}
      >
        ⏱️ {secondsLeft}s
      </span>
    </div>
  );
};
