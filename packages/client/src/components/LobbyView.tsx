import { useState } from 'react';
import { formatTelegramInviteLink, isValidRoomId } from '@liars-telegram-game/room-runtime';

export interface LobbyViewProps {
  roomId: string;
  members: string[];
  hostPlayerId: string | null;
  ownPlayerId: string;
  botUsername?: string;
  onStartMatch: () => void;
  onLeaveRoom?: () => void;
}

export const LobbyView: React.FC<LobbyViewProps> = ({
  roomId,
  members,
  hostPlayerId,
  ownPlayerId,
  botUsername = 'LiarsDeckBot',
  onStartMatch,
  onLeaveRoom,
}) => {
  const [copied, setCopied] = useState(false);
  const isHost = ownPlayerId === hostPlayerId;
  const canStart = isHost && members.length >= 2 && members.length <= 4;
  const maxSlots = 4;

  let inviteLink = '';
  try {
    if (isValidRoomId(roomId)) {
      inviteLink = formatTelegramInviteLink({
        botUsername,
        roomId,
      });
    }
  } catch {
    inviteLink = '';
  }

  const handleCopyInvite = async () => {
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard) {
        await navigator.clipboard.writeText(inviteLink);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }
    } catch {
      // Fallback
    }
  };

  return (
    <div
      data-testid="lobby-view"
      style={{
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        height: '100%',
        maxWidth: '380px',
        margin: '0 auto',
        padding: '16px 8px',
      }}
    >
      {/* Top Header */}
      <div style={{ textAlign: 'center' }}>
        <div
          data-testid="lobby-room-badge"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '8px',
            background: 'var(--bg-surface)',
            border: '1px solid var(--border-gold)',
            borderRadius: '20px',
            padding: '6px 16px',
            boxShadow: '0 4px 12px rgba(0,0,0,0.5)',
          }}
        >
          <span style={{ fontSize: '14px' }}>🚪</span>
          <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-gold)', letterSpacing: '1px' }}>
            ROOM: {roomId}
          </span>
        </div>
        <p style={{ margin: '12px 0 0 0', fontSize: '13px', color: 'var(--text-secondary)' }}>
          Waiting for players (2 to 4 required)
        </p>
      </div>

      {/* Member Slots (up to 4) */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', margin: '20px 0' }}>
        {Array.from({ length: maxSlots }).map((_, index) => {
          const memberId = members[index];
          const isMemberHost = memberId && memberId === hostPlayerId;
          const isSelf = memberId && memberId === ownPlayerId;

          if (memberId) {
            return (
              <div
                key={memberId}
                data-testid={`lobby-member-${memberId}`}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  background: isSelf ? 'linear-gradient(90deg, #242c3d 0%, #171b26 100%)' : 'var(--bg-surface)',
                  border: isSelf ? '1px solid var(--accent-gold)' : '1px solid var(--border-subtle)',
                  borderRadius: '12px',
                  padding: '12px 16px',
                  boxShadow: '0 4px 10px rgba(0,0,0,0.3)',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <span style={{ fontSize: '14px', color: 'var(--text-muted)', fontWeight: 600 }}>
                    #{index + 1}
                  </span>
                  <span style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text-primary)' }}>
                    {memberId} {isSelf && <span style={{ fontSize: '12px', color: 'var(--accent-gold)' }}>(You)</span>}
                  </span>
                </div>

                {isMemberHost && (
                  <span
                    data-testid="host-badge"
                    style={{
                      background: 'rgba(229, 169, 59, 0.2)',
                      color: 'var(--text-gold)',
                      border: '1px solid var(--border-gold)',
                      borderRadius: '12px',
                      padding: '2px 8px',
                      fontSize: '11px',
                      fontWeight: 700,
                    }}
                  >
                    👑 HOST
                  </span>
                )}
              </div>
            );
          }

          return (
            <div
              key={`empty-${index}`}
              data-testid={`lobby-empty-slot-${index}`}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                border: '1px dashed var(--border-subtle)',
                borderRadius: '12px',
                padding: '12px 16px',
                color: 'var(--text-muted)',
                fontSize: '13px',
              }}
            >
              Slot #{index + 1}: Waiting for player...
            </div>
          );
        })}
      </div>

      {/* Controls & Invite Flow */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        {/* Copy Invite Link */}
        <button
          data-testid="btn-copy-invite"
          onClick={handleCopyInvite}
          style={{
            background: 'var(--bg-surface)',
            border: '1px solid var(--border-subtle)',
            borderRadius: '10px',
            color: 'var(--text-primary)',
            padding: '12px',
            fontSize: '14px',
            fontWeight: 600,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px',
          }}
        >
          <span>🔗</span>
          <span>{copied ? 'Link Copied!' : 'Copy Invite Link'}</span>
        </button>

        {/* Start Match / Waiting Notice */}
        {isHost ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <button
              data-testid="btn-start-match"
              className="btn-primary"
              disabled={!canStart}
              onClick={onStartMatch}
              style={{ width: '100%', padding: '14px' }}
            >
              START MATCH
            </button>
            {members.length < 2 && (
              <span style={{ fontSize: '11px', color: 'var(--text-muted)', textAlign: 'center' }}>
                Need at least 2 players to begin match
              </span>
            )}
          </div>
        ) : (
          <div
            data-testid="waiting-host-notice"
            style={{
              background: 'rgba(255, 255, 255, 0.05)',
              border: '1px solid var(--border-subtle)',
              borderRadius: '10px',
              padding: '12px',
              textAlign: 'center',
              color: 'var(--text-secondary)',
              fontSize: '13px',
            }}
          >
            ⏳ Waiting for Host to start match...
          </div>
        )}

        {onLeaveRoom && (
          <button
            data-testid="btn-leave-lobby"
            onClick={onLeaveRoom}
            style={{
              background: 'transparent',
              border: 'none',
              color: 'var(--text-muted)',
              padding: '8px',
              fontSize: '13px',
              cursor: 'pointer',
              textDecoration: 'underline',
            }}
          >
            Leave Room
          </button>
        )}
      </div>
    </div>
  );
};
