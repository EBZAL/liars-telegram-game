import React, { useEffect, useState } from 'react';
import { getTelegramAdapter, type TelegramAdapterContext } from './telegram.js';
import { RoomProvider, useRoomProjection } from './room-context.js';
import { TableView } from './components/TableView.js';
import { LobbyView } from './components/LobbyView.js';
import { MatchPausedBanner } from './components/MatchPausedBanner.js';
import { MatchWinnerOverlay } from './components/MatchWinnerOverlay.js';

export interface AppProps {
  onDispatchAction?: (envelope: unknown) => void;
  onStartMatch?: () => void;
  onLeaveRoom?: () => void;
}

export const GameContainer: React.FC<AppProps> = ({
  onDispatchAction = () => {},
  onStartMatch = () => {},
  onLeaveRoom = () => {},
}) => {
  const { projection, setProjection } = useRoomProjection();
  const tg = getTelegramAdapter();
  const ownPlayerId = tg.user?.username || `player_${tg.user?.id || 'anon'}`;

  if (!projection) {
    return (
      <div
        data-testid="connecting-screen"
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '12px',
        }}
      >
        <span style={{ fontSize: '32px' }}>🃏</span>
        <span style={{ color: 'var(--text-secondary)', fontSize: '14px' }}>Connecting to room...</span>
      </div>
    );
  }

  const { lifecycle, roomId, memberPlayerIds, hostPlayerId, match } = projection.publicState;

  if (lifecycle === 'LOBBY') {
    return (
      <LobbyView
        roomId={roomId}
        members={memberPlayerIds}
        hostPlayerId={hostPlayerId}
        ownPlayerId={ownPlayerId}
        onStartMatch={onStartMatch}
        onLeaveRoom={onLeaveRoom}
      />
    );
  }

  const isPaused = lifecycle === 'MATCH_PAUSED_NO_LIVING_CONNECTIONS';
  const isFinished = lifecycle === 'MATCH_FINISHED';
  const winnerId = match?.winnerId ?? null;

  return (
    <div style={{ position: 'relative', height: '100%' }}>
      <MatchPausedBanner visible={isPaused} />

      <TableView
        projection={projection}
        ownPlayerId={ownPlayerId}
        onPlayCards={(cardIds) => onDispatchAction({ type: 'PLAY_CARDS', cardIds })}
        onCallLiar={() => onDispatchAction({ type: 'CALL_LIAR' })}
      />

      {isFinished && winnerId && (
        <MatchWinnerOverlay
          winnerId={winnerId}
          isOwnWin={winnerId === ownPlayerId}
          onReturnToLobby={() => {
            setProjection(null);
            onLeaveRoom();
          }}
        />
      )}
    </div>
  );
};

export const App: React.FC<AppProps> = (props) => {
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
        <header
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '4px 8px',
            borderBottom: '1px solid var(--border-subtle)',
            marginBottom: '8px',
          }}
        >
          <h1 style={{ margin: 0, fontSize: '16px', color: 'var(--accent-gold)', letterSpacing: '1px' }}>
            LIAR'S DECK
          </h1>
          {tg?.user && (
            <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
              👤 {tg.user.first_name}
            </span>
          )}
        </header>

        <main style={{ flex: 1, overflow: 'hidden' }}>
          <GameContainer {...props} />
        </main>
      </div>
    </RoomProvider>
  );
};
