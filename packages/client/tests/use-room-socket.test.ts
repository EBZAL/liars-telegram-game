import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useRoomSocket, buildRoomWebSocketUrl } from '../src/useRoomSocket.js';
import type { RecipientRoomProjection, GameplayActionEnvelope } from '@liars-telegram-game/room-runtime';

class MockWebSocket {
  public static instances: MockWebSocket[] = [];
  public static OPEN = 1;
  public static CLOSED = 3;

  public url: string;
  public readyState: number = 0; // 0: CONNECTING, 1: OPEN, 2: CLOSING, 3: CLOSED
  public sent: string[] = [];
  public onopen: (() => void) | null = null;
  public onclose: ((event: { code: number; reason: string }) => void) | null = null;
  public onerror: ((event: any) => void) | null = null;
  public onmessage: ((event: { data: string }) => void) | null = null;

  constructor(url: string) {
    this.url = url;
    MockWebSocket.instances.push(this);
  }

  send(data: string) {
    this.sent.push(data);
  }

  close(code = 1000, reason = '') {
    this.readyState = 3;
    if (this.onclose) {
      this.onclose({ code, reason });
    }
  }

  triggerOpen() {
    this.readyState = 1;
    if (this.onopen) this.onopen();
  }

  triggerMessage(data: any) {
    if (this.onmessage) {
      this.onmessage({ data: typeof data === 'string' ? data : JSON.stringify(data) });
    }
  }

  triggerError(err = new Error('Network error')) {
    if (this.onerror) this.onerror(err);
  }

  triggerClose(code = 1006, reason = 'Abnormal closure') {
    this.readyState = 3;
    if (this.onclose) this.onclose({ code, reason });
  }
}

describe('T-046 Client Network Transport & useRoomSocket Hook', () => {
  const originalWebSocket = globalThis.WebSocket;

  beforeEach(() => {
    MockWebSocket.instances = [];
    (globalThis as any).WebSocket = MockWebSocket;
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    globalThis.WebSocket = originalWebSocket;
  });

  describe('buildRoomWebSocketUrl', () => {
    it('constructs correct WebSocket URL with default host and room ID', () => {
      const url = buildRoomWebSocketUrl('r_room123');
      expect(url).toContain('/room/r_room123/ws');
    });

    it('transforms http/https serverUrl to ws/wss', () => {
      const urlHttp = buildRoomWebSocketUrl('r_123', 'http://api.example.com');
      expect(urlHttp).toBe('ws://api.example.com/room/r_123/ws');

      const urlHttps = buildRoomWebSocketUrl('r_123', 'https://api.example.com');
      expect(urlHttps).toBe('wss://api.example.com/room/r_123/ws');
    });

    it('appends initData query parameter when provided', () => {
      const url = buildRoomWebSocketUrl('r_123', 'https://api.example.com', 'user_init_data_hash');
      expect(url).toBe('wss://api.example.com/room/r_123/ws?initData=user_init_data_hash');
    });

    it('appends playerId when initData is absent but playerId is given', () => {
      const url = buildRoomWebSocketUrl('r_123', 'https://api.example.com', undefined, 'player_alice');
      expect(url).toBe('wss://api.example.com/room/r_123/ws?playerId=player_alice');
    });
  });

  describe('useRoomSocket connection and message flow', () => {
    it('initiates connection and transitions from CONNECTING to CONNECTED on open', () => {
      const { result } = renderHook(() =>
        useRoomSocket({
          roomId: 'r_test_1',
          autoConnect: true,
        })
      );

      expect(result.current.connectionStatus).toBe('CONNECTING');
      expect(MockWebSocket.instances.length).toBe(1);
      const ws = MockWebSocket.instances[0];

      act(() => {
        ws.triggerOpen();
      });

      expect(result.current.connectionStatus).toBe('CONNECTED');
      expect(result.current.error).toBeNull();
    });

    it('receives and sets server recipient projections', () => {
      let receivedProjection: any = null;
      const { result } = renderHook(() =>
        useRoomSocket({
          roomId: 'r_test_2',
          onProjection: (proj) => {
            receivedProjection = proj;
          },
        })
      );

      const ws = MockWebSocket.instances[0];
      act(() => {
        ws.triggerOpen();
      });

      const mockProjection: RecipientRoomProjection = {
        publicState: {
          roomId: 'r_test_2',
          lifecycle: 'LOBBY',
          revision: 1,
          memberPlayerIds: ['alice'],
          hostPlayerId: 'alice',
          currentTurnId: null,
          currentTurnDeadline: null,
          match: null,
        },
        privateState: null,
      };

      act(() => {
        ws.triggerMessage({
          type: 'PROJECTION',
          projection: mockProjection,
        });
      });

      expect(result.current.projection).toEqual(mockProjection);
      expect(receivedProjection).toEqual(mockProjection);
    });

    it('handles server error messages and malformed payloads', () => {
      let capturedError: string | null = null;
      const { result } = renderHook(() =>
        useRoomSocket({
          roomId: 'r_test_3',
          onError: (err) => {
            capturedError = err;
          },
        })
      );

      const ws = MockWebSocket.instances[0];
      act(() => {
        ws.triggerOpen();
      });

      act(() => {
        ws.triggerMessage({
          type: 'ERROR',
          error: 'ACTION_REJECTED',
        });
      });

      expect(result.current.error).toBe('ACTION_REJECTED');
      expect(capturedError).toBe('ACTION_REJECTED');

      // Malformed JSON message
      act(() => {
        ws.triggerMessage('NOT_VALID_JSON');
      });

      expect(result.current.error).toContain('Failed to parse message');
    });

    it('handles network error events', () => {
      const { result } = renderHook(() =>
        useRoomSocket({
          roomId: 'r_test_4',
        })
      );

      const ws = MockWebSocket.instances[0];
      act(() => {
        ws.triggerError();
      });

      expect(result.current.connectionStatus).toBe('ERROR');
      expect(result.current.error).toContain('WebSocket connection error');
    });
  });

  describe('Reconnection and Disconnect semantics', () => {
    it('attempts reconnection with backoff upon abnormal close until maxReconnectAttempts', () => {
      const { result } = renderHook(() =>
        useRoomSocket({
          roomId: 'r_test_5',
          maxReconnectAttempts: 2,
          baseReconnectDelayMs: 500,
        })
      );

      expect(MockWebSocket.instances.length).toBe(1);
      const ws1 = MockWebSocket.instances[0];

      act(() => {
        ws1.triggerOpen();
      });
      expect(result.current.connectionStatus).toBe('CONNECTED');

      // 1. First abnormal close -> RECONNECTING
      act(() => {
        ws1.triggerClose();
      });
      expect(result.current.connectionStatus).toBe('RECONNECTING');

      // Advance timer for reconnect
      act(() => {
        vi.advanceTimersByTime(600);
      });
      expect(MockWebSocket.instances.length).toBe(2);
      const ws2 = MockWebSocket.instances[1];

      // 2. Second abnormal close -> RECONNECTING
      act(() => {
        ws2.triggerClose();
      });
      expect(result.current.connectionStatus).toBe('RECONNECTING');

      // Advance timer for 2nd reconnect
      act(() => {
        vi.advanceTimersByTime(1000);
      });
      expect(MockWebSocket.instances.length).toBe(3);
      const ws3 = MockWebSocket.instances[2];

      // 3. Third abnormal close -> maxReconnectAttempts (2) exceeded -> DISCONNECTED
      act(() => {
        ws3.triggerClose();
      });
      expect(result.current.connectionStatus).toBe('DISCONNECTED');
      expect(result.current.error).toContain('Maximum reconnection attempts reached');
    });

    it('explicit disconnect does not trigger automatic reconnection', () => {
      const { result } = renderHook(() =>
        useRoomSocket({
          roomId: 'r_test_6',
          autoConnect: true,
        })
      );

      const ws = MockWebSocket.instances[0];
      act(() => {
        ws.triggerOpen();
      });

      act(() => {
        result.current.disconnect();
      });

      expect(result.current.connectionStatus).toBe('DISCONNECTED');

      // Advance timers to verify no reconnect was scheduled
      act(() => {
        vi.advanceTimersByTime(5000);
      });
      expect(MockWebSocket.instances.length).toBe(1);
    });
  });

  describe('Command dispatch methods', () => {
    it('dispatches JOIN, LEAVE, START_MATCH, and GAMEPLAY_ACTION over open socket', () => {
      const { result } = renderHook(() =>
        useRoomSocket({
          roomId: 'r_test_7',
          autoConnect: true,
        })
      );

      const ws = MockWebSocket.instances[0];
      act(() => {
        ws.triggerOpen();
      });

      // JOIN
      act(() => {
        result.current.joinRoom();
      });
      expect(JSON.parse(ws.sent[0])).toEqual({ type: 'JOIN' });

      // LEAVE
      act(() => {
        result.current.leaveRoom();
      });
      expect(JSON.parse(ws.sent[1])).toEqual({ type: 'LEAVE' });

      // START_MATCH
      act(() => {
        result.current.startMatch('turn-custom-1');
      });
      expect(JSON.parse(ws.sent[2])).toEqual({
        type: 'START_MATCH',
        initialTurnId: 'turn-custom-1',
      });

      // GAMEPLAY_ACTION
      const mockEnvelope: GameplayActionEnvelope = {
        actionId: 'act_101',
        expectedRevision: 3,
        turnId: 'turn-custom-1',
        actionType: 'PLAY_CARDS',
        payload: { cardIds: ['c1'] },
      };
      act(() => {
        result.current.dispatchAction(mockEnvelope);
      });
      expect(JSON.parse(ws.sent[3])).toEqual({
        type: 'GAMEPLAY_ACTION',
        envelope: mockEnvelope,
      });
    });

    it('sets error when attempting to send while socket is not open', () => {
      const { result } = renderHook(() =>
        useRoomSocket({
          roomId: 'r_test_8',
          autoConnect: false,
        })
      );

      act(() => {
        result.current.joinRoom();
      });

      expect(result.current.error).toContain('WebSocket is not open');
    });
  });
});
