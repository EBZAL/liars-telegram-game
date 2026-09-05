import { useEffect, useRef, useState, useCallback } from 'react';
import type { RecipientRoomProjection, GameplayActionEnvelope } from '@liars-telegram-game/room-runtime';
import { getTelegramAdapter } from './telegram.js';

export type ConnectionStatus =
  | 'CONNECTING'
  | 'CONNECTED'
  | 'DISCONNECTED'
  | 'RECONNECTING'
  | 'ERROR'
  | 'connecting'
  | 'connected'
  | 'disconnected'
  | 'error';

export interface UseRoomSocketOptions {
  roomId: string;
  serverUrl?: string;
  initData?: string;
  autoConnect?: boolean;
  maxReconnectAttempts?: number;
  baseReconnectDelayMs?: number;
  maxReconnectDelayMs?: number;
  onProjection?: (projection: RecipientRoomProjection) => void;
  onError?: (error: string) => void;
}

export interface UseRoomSocketResult {
  connectionStatus: ConnectionStatus;
  projection: RecipientRoomProjection | null;
  error: string | null;
  connect: () => void;
  disconnect: () => void;
  joinRoom: () => void;
  leaveRoom: () => void;
  startMatch: (initialTurnId?: string) => void;
  dispatchAction: (envelope: GameplayActionEnvelope) => void;
  sendRaw: (msg: unknown) => void;
}

export function buildRoomWebSocketUrl(
  roomId: string,
  serverUrl?: string,
  initData?: string,
  playerId?: string
): string {
  let base: string;
  if (serverUrl && serverUrl.trim().length > 0) {
    base = serverUrl.replace(/\/+$/, '');
    if (base.startsWith('http://')) {
      base = 'ws://' + base.slice(7);
    } else if (base.startsWith('https://')) {
      base = 'wss://' + base.slice(8);
    }
  } else if (typeof window !== 'undefined' && window.location && window.location.host) {
    const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    base = `${proto}//${window.location.host}`;
  } else {
    base = 'ws://localhost:8787';
  }

  const url = new URL(`${base}/room/${encodeURIComponent(roomId)}/ws`);
  if (initData && initData.trim().length > 0) {
    url.searchParams.set('initData', initData.trim());
  } else if (playerId && playerId.trim().length > 0) {
    url.searchParams.set('playerId', playerId.trim());
  }
  return url.toString();
}

export function useRoomSocket(options: UseRoomSocketOptions): UseRoomSocketResult {
  const {
    roomId,
    serverUrl,
    initData,
    autoConnect = true,
    maxReconnectAttempts = 5,
    baseReconnectDelayMs = 1000,
    maxReconnectDelayMs = 10000,
    onProjection,
    onError,
  } = options;

  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('DISCONNECTED');
  const [projection, setProjection] = useState<RecipientRoomProjection | null>(null);
  const [error, setError] = useState<string | null>(null);

  const socketRef = useRef<WebSocket | null>(null);
  const reconnectAttemptsRef = useRef<number>(0);
  const reconnectTimeoutRef = useRef<any>(null);
  const explicitlyDisconnectedRef = useRef<boolean>(false);

  const onProjectionRef = useRef(onProjection);
  onProjectionRef.current = onProjection;
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;

  const handleMessage = useCallback((event: MessageEvent) => {
    try {
      const data =
        typeof event.data === 'string'
          ? event.data
          : new TextDecoder().decode(event.data as ArrayBuffer);
      const parsed = JSON.parse(data);

      if (parsed.type === 'PROJECTION' && parsed.projection) {
        setProjection(parsed.projection);
        setError(null);
        onProjectionRef.current?.(parsed.projection);
      } else if (parsed.type === 'ERROR') {
        const errorMsg = parsed.error || 'Unknown server error';
        setError(errorMsg);
        onErrorRef.current?.(errorMsg);
      }
    } catch (err) {
      const errMsg = `Failed to parse message: ${(err as Error).message || 'Invalid format'}`;
      setError(errMsg);
      onErrorRef.current?.(errMsg);
    }
  }, []);

  const connect = useCallback(() => {
    if (!roomId || roomId.trim().length === 0) {
      return;
    }

    if (socketRef.current) {
      socketRef.current.onclose = null;
      socketRef.current.onerror = null;
      socketRef.current.onmessage = null;
      socketRef.current.onopen = null;
      try {
        socketRef.current.close();
      } catch {}
      socketRef.current = null;
    }

    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }

    explicitlyDisconnectedRef.current = false;
    setConnectionStatus('CONNECTING');

    const tg = getTelegramAdapter();
    const effectiveInitData = initData ?? (tg.initData || undefined);
    const effectivePlayerId =
      tg.user?.username || (tg.user?.id ? `player_${tg.user.id}` : undefined);
    const wsUrl = buildRoomWebSocketUrl(roomId, serverUrl, effectiveInitData, effectivePlayerId);

    try {
      const ws = new WebSocket(wsUrl);
      socketRef.current = ws;

      ws.onopen = () => {
        reconnectAttemptsRef.current = 0;
        setConnectionStatus('CONNECTED');
        setError(null);
      };

      ws.onmessage = handleMessage;

      ws.onerror = () => {
        const errText = 'WebSocket connection error';
        setError(errText);
        setConnectionStatus('ERROR');
        onErrorRef.current?.(errText);
      };

      ws.onclose = () => {
        if (explicitlyDisconnectedRef.current) {
          setConnectionStatus('DISCONNECTED');
          return;
        }

        if (reconnectAttemptsRef.current < maxReconnectAttempts) {
          setConnectionStatus('RECONNECTING');
          const delay = Math.min(
            baseReconnectDelayMs * Math.pow(1.5, reconnectAttemptsRef.current),
            maxReconnectDelayMs
          );
          reconnectAttemptsRef.current += 1;
          reconnectTimeoutRef.current = setTimeout(() => {
            connect();
          }, delay);
        } else {
          setConnectionStatus('DISCONNECTED');
          const errText = 'Disconnected from room. Maximum reconnection attempts reached.';
          setError(errText);
          onErrorRef.current?.(errText);
        }
      };
    } catch (err) {
      const msg = (err as Error).message || 'Failed to create WebSocket';
      setError(msg);
      setConnectionStatus('ERROR');
      onErrorRef.current?.(msg);
    }
  }, [
    roomId,
    serverUrl,
    initData,
    maxReconnectAttempts,
    baseReconnectDelayMs,
    maxReconnectDelayMs,
    handleMessage,
  ]);

  const disconnect = useCallback(() => {
    explicitlyDisconnectedRef.current = true;
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
    if (socketRef.current) {
      try {
        socketRef.current.close(1000, 'Client disconnected');
      } catch {}
      socketRef.current = null;
    }
    setConnectionStatus('DISCONNECTED');
  }, []);

  const sendRaw = useCallback((data: unknown) => {
    if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
      const payload = typeof data === 'string' ? data : JSON.stringify(data);
      socketRef.current.send(payload);
    } else {
      setError('Cannot send message: WebSocket is not open');
    }
  }, []);

  const joinRoom = useCallback(() => {
    sendRaw({ type: 'JOIN' });
  }, [sendRaw]);

  const leaveRoom = useCallback(() => {
    sendRaw({ type: 'LEAVE' });
  }, [sendRaw]);

  const startMatch = useCallback(
    (initialTurnId?: string) => {
      sendRaw({ type: 'START_MATCH', initialTurnId });
    },
    [sendRaw]
  );

  const dispatchAction = useCallback(
    (envelope: GameplayActionEnvelope) => {
      sendRaw({ type: 'GAMEPLAY_ACTION', envelope });
    },
    [sendRaw]
  );

  useEffect(() => {
    if (autoConnect && roomId) {
      connect();
    }
    return () => {
      disconnect();
    };
  }, [autoConnect, roomId, connect, disconnect]);

  return {
    connectionStatus,
    projection,
    error,
    connect,
    disconnect,
    joinRoom,
    leaveRoom,
    startMatch,
    dispatchAction,
    sendRaw,
  };
}
