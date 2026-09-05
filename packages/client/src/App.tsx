import React, { useEffect, useState } from 'react';
import { getTelegramAdapter, type TelegramAdapterContext } from './telegram.js';
import { RoomProvider } from './room-context.js';

export const App: React.FC = () => {
  const [tg, setTg] = useState<TelegramAdapterContext | null>(null);

  useEffect(() => {
    const adapter = getTelegramAdapter();
    setTg(adapter);
    adapter.ready();
    adapter.expand();
    adapter.enableClosingConfirmation();
  }, []);

  return (
    <RoomProvider>
      <div className="app-viewport">
        <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 4px' }}>
          <h1 style={{ margin: 0, fontSize: '18px', color: 'var(--accent-gold)', letterSpacing: '1px' }}>
            LIAR'S DECK
          </h1>
          {tg?.user && (
            <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
              👤 {tg.user.first_name}
            </span>
          )}
        </header>

        <main style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{
            background: 'var(--bg-surface)',
            border: '1px solid var(--border-subtle)',
            borderRadius: '12px',
            padding: '24px',
            textAlign: 'center',
            maxWidth: '320px',
            width: '90%',
            boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
          }}>
            <p style={{ color: 'var(--text-secondary)', margin: '0 0 16px 0', fontSize: '14px' }}>
              Theatrical Russian Roulette Card Game
            </p>
            <div style={{ display: 'flex', gap: '8px', justifyContent: 'center' }}>
              <span style={{ fontSize: '24px' }}>👑</span>
              <span style={{ fontSize: '24px' }}>🃏</span>
              <span style={{ fontSize: '24px' }}>💀</span>
            </div>
          </div>
        </main>
      </div>
    </RoomProvider>
  );
};
