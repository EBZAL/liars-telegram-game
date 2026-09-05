import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { RoomProvider, useRoomProjection } from '../src/room-context.js';
import type { RecipientRoomProjection } from '@liars-telegram-game/room-runtime';

const TestConsumer: React.FC = () => {
  const { projection, connectionStatus, setProjection, setConnectionStatus, error, setError } = useRoomProjection();

  return (
    <div>
      <span data-testid="status">{connectionStatus}</span>
      <span data-testid="room-id">{projection?.publicState.roomId ?? 'none'}</span>
      <span data-testid="error">{error ?? 'none'}</span>
      <button
        onClick={() =>
          setProjection({
            publicState: {
              roomId: 'room-abc',
              lifecycle: 'LOBBY',
              revision: 1,
              memberPlayerIds: ['p1'],
              hostPlayerId: 'p1',
              currentTurnId: null,
              currentTurnDeadline: null,
              match: null,
            },
            privateState: null,
          })
        }
      >
        Set Projection
      </button>
      <button onClick={() => setConnectionStatus('connected')}>Connect</button>
      <button onClick={() => setError('Test Error')}>Set Error</button>
    </div>
  );
};

describe('T-035 RoomContext Provider and Hook', () => {
  it('throws error when useRoomProjection is called outside RoomProvider', () => {
    // Suppress console.error during expected throw
    const originalConsoleError = console.error;
    console.error = () => {};

    expect(() => render(<TestConsumer />)).toThrow(
      'useRoomProjection must be used within a RoomProvider'
    );

    console.error = originalConsoleError;
  });

  it('provides default state and updates projection/status via hook', () => {
    render(
      <RoomProvider>
        <TestConsumer />
      </RoomProvider>
    );

    expect(screen.getByTestId('status').textContent).toBe('disconnected');
    expect(screen.getByTestId('room-id').textContent).toBe('none');
    expect(screen.getByTestId('error').textContent).toBe('none');

    act(() => {
      screen.getByText('Connect').click();
    });
    expect(screen.getByTestId('status').textContent).toBe('connected');

    act(() => {
      screen.getByText('Set Projection').click();
    });
    expect(screen.getByTestId('room-id').textContent).toBe('room-abc');

    act(() => {
      screen.getByText('Set Error').click();
    });
    expect(screen.getByTestId('error').textContent).toBe('Test Error');
  });

  it('initializes with custom initial values', () => {
    const initialProjection: RecipientRoomProjection = {
      publicState: {
        roomId: 'init-room',
        lifecycle: 'MATCH_ACTIVE',
        revision: 5,
        memberPlayerIds: ['a', 'b'],
        hostPlayerId: 'a',
        currentTurnId: 'turn-1',
        currentTurnDeadline: 50000,
        match: null,
      },
      privateState: null,
    };

    render(
      <RoomProvider initialProjection={initialProjection} initialStatus="connected">
        <TestConsumer />
      </RoomProvider>
    );

    expect(screen.getByTestId('status').textContent).toBe('connected');
    expect(screen.getByTestId('room-id').textContent).toBe('init-room');
  });
});
