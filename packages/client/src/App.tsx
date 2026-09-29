import React, { useEffect, useState, useCallback } from 'react';
import { getTelegramAdapter, type TelegramAdapterContext } from './telegram.js';
import { RoomProvider, useRoomProjection } from './room-context.js';
import { TableView } from './components/TableView.js';
import { LobbyView } from './components/LobbyView.js';
import { MatchPausedBanner } from './components/MatchPausedBanner.js';
import { MatchWinnerOverlay } from './components/MatchWinnerOverlay.js';
import { ChallengeRevealOverlay } from './components/ChallengeRevealOverlay.js';
import { soundManager } from './sound.js';
import { useRoomSocket } from './useRoomSocket.js';
import {
  buildPlayCardsEnvelope,
  buildCallLiarEnvelope,
} from './selection-and-actions.js';
import { isValidRoomId, generateRoomId } from '@liars-telegram-game/room-runtime';

export interface AppProps {
  onDispatchAction?: (envelope: unknown) => void;
  onStartMatch?: () => void;
  onLeaveRoom?: () => void;
  roomId?: string;
}

export interface GameContainerProps extends AppProps {
  connectionStatus?: string;
  errorMessage?: string | null;
  onRetry?: () => void;
  onJoinRoomCode?: (code: string) => void;
  onPlayAgain?: () => void;
}

function getEffectiveRoomId(): string {
  const tg = getTelegramAdapter();
  if (tg.startParam && isValidRoomId(tg.startParam)) {
    if (typeof sessionStorage !== 'undefined') {
      sessionStorage.setItem('liars_deck_active_room', tg.startParam);
    }
    return tg.startParam;
  }
  if (typeof window !== 'undefined') {
    const sessionRoom = sessionStorage.getItem('liars_deck_active_room');
    if (sessionRoom && isValidRoomId(sessionRoom)) {
      return sessionRoom;
    }
  }
  const generated = generateRoomId();
  if (typeof sessionStorage !== 'undefined') {
    sessionStorage.setItem('liars_deck_active_room', generated);
  }
  return generated;
}

export const GameContainer: React.FC<GameContainerProps> = ({
  onDispatchAction = () => {},
  onStartMatch = () => {},
  onLeaveRoom = () => {},
  onJoinRoomCode,
  onPlayAgain,
  errorMessage = null,
  onRetry,
}) => {
  const { projection, setProjection } = useRoomProjection();
  const [dismissedChallengeRevision, setDismissedChallengeRevision] = useState<number | null>(null);
  const tg = getTelegramAdapter();
  const ownPlayerId = tg.user?.id ? String(tg.user.id) : (tg.user?.username || 'player_anon');
  const ownDisplayName = tg.user?.first_name || tg.user?.username || ownPlayerId;

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
          height: '100%',
        }}
      >
        <span style={{ fontSize: '36px' }}>🃏</span>
        <span style={{ color: 'var(--text-secondary)', fontSize: '14px', fontWeight: 500 }}>
          {errorMessage ? 'Connection Failed' : 'Connecting to room...'}
        </span>
        {errorMessage && (
          <span style={{ color: 'var(--accent-red, #ff4d4f)', fontSize: '12px', maxWidth: '280px', textAlign: 'center' }}>
            {errorMessage}
          </span>
        )}
        {errorMessage && onRetry && (
          <button
            onClick={onRetry}
            style={{
              marginTop: '8px',
              padding: '8px 20px',
              borderRadius: '8px',
              background: 'var(--accent-gold, #d4af37)',
              color: '#000',
              fontWeight: 700,
              cursor: 'pointer',
              border: 'none',
            }}
          >
            Retry
          </button>
        )}
      </div>
    );
  }

  const { lifecycle, roomId, memberPlayerIds, hostPlayerId, match, playerNames } = projection.publicState;

  if (lifecycle === 'LOBBY') {
    return (
      <LobbyView
        roomId={roomId}
        members={memberPlayerIds}
        hostPlayerId={hostPlayerId}
        ownPlayerId={ownPlayerId}
        ownDisplayName={ownDisplayName}
        playerNames={playerNames}
        botUsername="LIRESBARBOT"
        onStartMatch={onStartMatch}
        onLeaveRoom={onLeaveRoom}
        onJoinRoomCode={onJoinRoomCode}
      />
    );
  }

  const isPaused = lifecycle === 'MATCH_PAUSED_NO_LIVING_CONNECTIONS';
  const isFinished = lifecycle === 'MATCH_FINISHED';
  const winnerId = match?.winnerId ?? null;

  const lastChallenge =
    projection.publicState.lastChallenge ??
    projection.publicState.match?.lastChallenge ??
    null;

  const activeChallenge =
    lastChallenge && lastChallenge.resolvedAtRevision !== dismissedChallengeRevision
      ? lastChallenge
      : null;

  const shooterPlayer = activeChallenge
    ? match?.players.find((p) => p.playerId === activeChallenge.shooterId)
    : null;

  return (
    <div style={{ position: 'relative', height: '100%' }}>
      <MatchPausedBanner visible={isPaused} />

      <TableView
        projection={projection}
        ownPlayerId={ownPlayerId}
        ownDisplayName={ownDisplayName}
        onPlayCards={(cardIds) => onDispatchAction({ type: 'PLAY_CARDS', cardIds })}
        onCallLiar={() => onDispatchAction({ type: 'CALL_LIAR' })}
      />

      {activeChallenge && (
        <ChallengeRevealOverlay
          callerId={activeChallenge.callerId}
          accusedId={activeChallenge.accusedId}
          revealedCards={activeChallenge.revealedCards}
          tableRank={activeChallenge.tableRank}
          isLie={activeChallenge.isLie}
          shooterId={activeChallenge.shooterId}
          rouletteOutcome={activeChallenge.rouletteOutcome}
          shotsUsed={shooterPlayer?.shotsUsed}
          playerNames={playerNames}
          onDismiss={() => setDismissedChallengeRevision(activeChallenge.resolvedAtRevision)}
        />
      )}

      {isFinished && winnerId && !activeChallenge && (
        <MatchWinnerOverlay
          winnerId={winnerId}
          isOwnWin={winnerId === ownPlayerId}
          playerNames={playerNames}
          onPlayAgain={onPlayAgain}
          onReturnToLobby={() => {
            setProjection(null);
            onLeaveRoom();
          }}
        />
      )}
    </div>
  );
};

const ConnectedGame: React.FC<AppProps> = (props) => {
  const { projection, setProjection, setConnectionStatus, setError } = useRoomProjection();
  const [roomId, setRoomId] = useState<string>(() => props.roomId || getEffectiveRoomId());
  const tg = getTelegramAdapter();
  const ownDisplayName = tg.user?.first_name || tg.user?.username || undefined;

  const {
    connectionStatus,
    projection: socketProjection,
    error: socketError,
    joinRoom,
    leaveRoom,
    startMatch,
    playAgain,
    dispatchAction,
    connect,
  } = useRoomSocket({
    roomId,
    autoConnect: true,
  });

  useEffect(() => {
    if (socketProjection) {
      setProjection(socketProjection);
    }
  }, [socketProjection, setProjection]);

  useEffect(() => {
    setConnectionStatus(connectionStatus);
  }, [connectionStatus, setConnectionStatus]);

  useEffect(() => {
    if (socketError) {
      setError(socketError);
    }
  }, [socketError, setError]);

  // When WebSocket opens and no projection yet, automatically send JOIN with displayName
  useEffect(() => {
    if (connectionStatus === 'CONNECTED' && !projection) {
      joinRoom(ownDisplayName);
    }
  }, [connectionStatus, projection, joinRoom, ownDisplayName]);

  const handleDispatchAction = useCallback(
    (actionOrEnvelope: any) => {
      if (props.onDispatchAction) {
        props.onDispatchAction(actionOrEnvelope);
      }
      if (!projection) return;

      if (actionOrEnvelope?.actionId && actionOrEnvelope?.actionType) {
        dispatchAction(actionOrEnvelope);
      } else if (actionOrEnvelope?.type === 'PLAY_CARDS') {
        const envelope = buildPlayCardsEnvelope(projection, actionOrEnvelope.cardIds);
        dispatchAction(envelope);
      } else if (actionOrEnvelope?.type === 'CALL_LIAR') {
        const envelope = buildCallLiarEnvelope(projection);
        dispatchAction(envelope);
      }
    },
    [props.onDispatchAction, projection, dispatchAction]
  );

  const handleStartMatch = useCallback(() => {
    if (props.onStartMatch) {
      props.onStartMatch();
    }
    startMatch();
  }, [props.onStartMatch, startMatch]);

  const handleLeaveRoom = useCallback(() => {
    if (props.onLeaveRoom) {
      props.onLeaveRoom();
    }
    leaveRoom();
    setProjection(null);
  }, [props.onLeaveRoom, leaveRoom, setProjection]);

  const handleJoinRoomCode = useCallback(
    (code: string) => {
      if (isValidRoomId(code)) {
        if (typeof sessionStorage !== 'undefined') {
          sessionStorage.setItem('liars_deck_active_room', code);
        }
        setProjection(null);
        setRoomId(code);
      }
    },
    [setProjection]
  );

  return (
    <GameContainer
      {...props}
      onDispatchAction={handleDispatchAction}
      onStartMatch={handleStartMatch}
      onLeaveRoom={handleLeaveRoom}
      onJoinRoomCode={handleJoinRoomCode}
      onPlayAgain={playAgain}
      connectionStatus={connectionStatus}
      errorMessage={socketError}
      onRetry={connect}
    />
  );
};

export const App: React.FC<AppProps> = (props) => {
  const [tg, setTg] = useState<TelegramAdapterContext | null>(null);
  const [isMuted, setIsMuted] = useState(() => soundManager.isMuted());

  useEffect(() => {
    const adapter = getTelegramAdapter();
    setTg(adapter);
    adapter.ready();
    adapter.expand();
    adapter.enableClosingConfirmation();

    // Attempt immediate background music playback on mount
    soundManager.playBgm();

    // Catch ANY touch or click anywhere on screen to unlock audio immediately
    const unlockAudio = () => {
      soundManager.playBgm();
    };

    const gestureEvents = ['touchstart', 'touchend', 'pointerdown', 'pointerup', 'mousedown', 'click'];
    gestureEvents.forEach((evt) => {
      window.addEventListener(evt, unlockAudio, { capture: true, passive: true });
      document.addEventListener(evt, unlockAudio, { capture: true, passive: true });
    });

    return () => {
      gestureEvents.forEach((evt) => {
        window.removeEventListener(evt, unlockAudio, true);
        document.removeEventListener(evt, unlockAudio, true);
      });
    };
  }, []);

  const handleToggleSound = () => {
    const next = soundManager.toggleMute();
    setIsMuted(next);
  };

  return (
    <RoomProvider>
      <div className="app-viewport">
        <header
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '6px 10px',
            borderBottom: '1px solid var(--border-subtle)',
            marginBottom: '8px',
          }}
        >
          <h1 style={{ margin: 0, fontSize: '16px', color: 'var(--accent-gold)', letterSpacing: '1px' }}>
            LIAR'S DECK
          </h1>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <button
              onClick={handleToggleSound}
              title={isMuted ? 'Unmute Sound' : 'Mute Sound'}
              data-testid="btn-toggle-sound"
              style={{
                background: 'rgba(255, 255, 255, 0.08)',
                border: '1px solid var(--border-subtle)',
                borderRadius: '8px',
                color: 'var(--text-primary)',
                cursor: 'pointer',
                fontSize: '13px',
                padding: '3px 8px',
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
              }}
            >
              <span>{isMuted ? '🔇' : '🔊'}</span>
              <span style={{ fontSize: '10px', color: 'var(--text-secondary)', fontWeight: 600 }}>
                {isMuted ? 'MUTE' : 'SOUND'}
              </span>
            </button>
            {tg?.user && (
              <span style={{ fontSize: '12px', color: 'var(--text-secondary)', fontWeight: 600 }}>
                👤 {tg.user.first_name}
              </span>
            )}
          </div>
        </header>

        <main style={{ flex: 1, overflow: 'hidden' }}>
          <ConnectedGame {...props} />
        </main>
      </div>
    </RoomProvider>
  );
};
