import React, { createContext, useContext, useState, ReactNode } from 'react';
import type { RecipientRoomProjection } from '@liars-telegram-game/room-runtime';

import type { ConnectionStatus } from './useRoomSocket.js';

export type { ConnectionStatus };

export interface RoomContextValue {
  projection: RecipientRoomProjection | null;
  connectionStatus: ConnectionStatus;
  error: string | null;
  setProjection: (proj: RecipientRoomProjection | null) => void;
  setConnectionStatus: (status: ConnectionStatus) => void;
  setError: (err: string | null) => void;
}

const RoomContext = createContext<RoomContextValue | undefined>(undefined);

export interface RoomProviderProps {
  children: ReactNode;
  initialProjection?: RecipientRoomProjection | null;
  initialStatus?: ConnectionStatus;
}

export const RoomProvider: React.FC<RoomProviderProps> = ({
  children,
  initialProjection = null,
  initialStatus = 'disconnected',
}) => {
  const [projection, setProjection] = useState<RecipientRoomProjection | null>(initialProjection);
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>(initialStatus);
  const [error, setError] = useState<string | null>(null);

  const value: RoomContextValue = {
    projection,
    connectionStatus,
    error,
    setProjection,
    setConnectionStatus,
    setError,
  };

  return <RoomContext.Provider value={value}>{children}</RoomContext.Provider>;
};

export function useRoomProjection(): RoomContextValue {
  const context = useContext(RoomContext);
  if (!context) {
    throw new Error('useRoomProjection must be used within a RoomProvider');
  }
  return context;
}
