import { useState } from 'react';
import { formatTelegramInviteLink, isValidRoomId } from '@liars-telegram-game/room-runtime';
import { getPlayerDisplayName } from '../player-names.js';

export interface LobbyViewProps {
  roomId: string;
  members: string[];
  hostPlayerId: string | null;
  ownPlayerId: string;
  ownDisplayName?: string;
  playerNames?: Record<string, string>;
  playerWins?: Record<string, number>;
  botUsername?: string;
  onStartMatch: () => void;
  onLeaveRoom?: () => void;
  onJoinRoomCode?: (code: string) => void;
}

export const LobbyView: React.FC<LobbyViewProps> = ({
  roomId,
  members,
  hostPlayerId,
  ownPlayerId,
  ownDisplayName,
  playerNames,
  playerWins,
  botUsername = 'LiarsDeckBot',
  onStartMatch,
  onLeaveRoom,
  onJoinRoomCode,
}) => {
  const [copied, setCopied] = useState(false);
  const [codeCopied, setCodeCopied] = useState(false);
  const [manualCode, setManualCode] = useState('');
  const [joinError, setJoinError] = useState<string | null>(null);

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

  const handleCopyCode = async () => {
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard) {
        await navigator.clipboard.writeText(roomId);
        setCodeCopied(true);
        setTimeout(() => setCodeCopied(false), 2000);
      }
    } catch {
      // Fallback
    }
  };

  const handleShareInvite = () => {
    const cleanBot = botUsername.replace(/^@/, '').trim();
    const botStartLink = `https://t.me/${cleanBot}?start=${encodeURIComponent(roomId.trim())}`;
    const text = `🃏 Join my Liar's Deck table!\nRoom Code: ${roomId}\n`;
    const shareUrl = `https://t.me/share/url?url=${encodeURIComponent(botStartLink)}&text=${encodeURIComponent(text)}`;
    if (typeof window !== 'undefined' && window.Telegram?.WebApp?.openTelegramLink) {
      window.Telegram.WebApp.openTelegramLink(shareUrl);
    } else if (typeof window !== 'undefined') {
      window.open(shareUrl, '_blank');
    }
  };

  const handleManualJoin = () => {
    const code = manualCode.trim();
    if (!isValidRoomId(code)) {
      setJoinError('Invalid room code (e.g. r_12345678)');
      return;
    }
    setJoinError(null);
    if (onJoinRoomCode) {
      onJoinRoomCode(code);
    }
  };

  return (
    <div
      data-testid="lobby-view"
      className="bg-lobby"
      style={{
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        height: '100%',
        maxWidth: '420px',
        margin: '0 auto',
        padding: '16px 12px',
        borderRadius: '16px',
        boxShadow: '0 8px 32px rgba(0,0,0,0.6)',
        overflowY: 'auto',
      }}
    >
      {/* Top Header */}
      <div style={{ textAlign: 'center' }}>
        <div
          data-testid="lobby-room-badge"
          onClick={handleCopyCode}
          title="Click to copy Room Code"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '8px',
            background: 'rgba(23, 28, 40, 0.85)',
            backdropFilter: 'blur(10px)',
            WebkitBackdropFilter: 'blur(10px)',
            border: '1px solid var(--border-gold)',
            borderRadius: '20px',
            padding: '6px 16px',
            boxShadow: '0 4px 16px rgba(0,0,0,0.6)',
            cursor: 'pointer',
          }}
        >
          <span style={{ fontSize: '14px' }}>🚪</span>
          <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-gold)', letterSpacing: '1px' }}>
            {codeCopied ? 'Code Copied!' : `ROOM: ${roomId}`}
          </span>
          <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>📋</span>
        </div>
        <p style={{ margin: '12px 0 0 0', fontSize: '13px', color: 'var(--text-secondary)' }}>
          Waiting for players (2 to 4 required)
        </p>
        {playerWins && Object.values(playerWins).reduce((a, b) => a + b, 0) > 0 && (
          <div
            style={{
              marginTop: '8px',
              fontSize: '11px',
              color: 'var(--text-gold)',
              fontWeight: 700,
              letterSpacing: '0.5px',
              background: 'rgba(229, 169, 59, 0.12)',
              border: '1px solid rgba(229, 169, 59, 0.3)',
              borderRadius: '12px',
              padding: '3px 10px',
              display: 'inline-block',
            }}
          >
            🔥 ROOM SCOREBOARD: {Object.values(playerWins).reduce((a, b) => a + b, 0)} {Object.values(playerWins).reduce((a, b) => a + b, 0) === 1 ? 'MATCH' : 'MATCHES'} PLAYED
          </div>
        )}
      </div>

      {/* Member Slots (up to 4) */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', margin: '20px 0' }}>
        {Array.from({ length: maxSlots }).map((_, index) => {
          const memberId = members[index];
          const isMemberHost = memberId && memberId === hostPlayerId;
          const isSelf = memberId && memberId === ownPlayerId;
          const wins = memberId && playerWins ? (playerWins[memberId] ?? 0) : 0;

          if (memberId) {
            return (
              <div
                key={memberId}
                data-testid={`lobby-member-${memberId}`}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  background: isSelf
                    ? 'linear-gradient(90deg, rgba(38, 48, 66, 0.90) 0%, rgba(22, 27, 38, 0.94) 100%)'
                    : 'rgba(22, 27, 38, 0.82)',
                  backdropFilter: 'blur(10px)',
                  WebkitBackdropFilter: 'blur(10px)',
                  border: isSelf ? '1.5px solid var(--accent-gold)' : '1px solid var(--border-subtle)',
                  borderRadius: '12px',
                  padding: '12px 16px',
                  boxShadow: '0 4px 14px rgba(0,0,0,0.4)',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <span style={{ fontSize: '14px', color: 'var(--text-muted)', fontWeight: 600 }}>
                    #{index + 1}
                  </span>
                  <span style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text-primary)' }}>
                    {getPlayerDisplayName(memberId, playerNames, ownPlayerId, ownDisplayName)}{' '}
                    {isSelf && <span style={{ fontSize: '12px', color: 'var(--accent-gold)' }}>(You)</span>}
                  </span>
                  {wins > 0 && (
                    <span
                      data-testid={`lobby-member-wins-${memberId}`}
                      style={{
                        background: 'linear-gradient(135deg, rgba(229, 169, 59, 0.25) 0%, rgba(184, 124, 30, 0.35) 100%)',
                        border: '1px solid var(--accent-gold)',
                        borderRadius: '12px',
                        padding: '2px 8px',
                        fontSize: '11px',
                        fontWeight: 800,
                        color: 'var(--text-gold)',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '3px',
                        boxShadow: '0 2px 6px rgba(0,0,0,0.4)',
                      }}
                    >
                      🏆 {wins} {wins === 1 ? 'Win' : 'Wins'}
                    </span>
                  )}
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
                border: '1px dashed rgba(255, 255, 255, 0.22)',
                background: 'rgba(10, 13, 20, 0.50)',
                backdropFilter: 'blur(6px)',
                WebkitBackdropFilter: 'blur(6px)',
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
        {/* Invite Buttons */}
        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            data-testid="btn-copy-invite"
            onClick={handleCopyInvite}
            style={{
              flex: 1,
              background: 'rgba(23, 28, 40, 0.85)',
              backdropFilter: 'blur(10px)',
              WebkitBackdropFilter: 'blur(10px)',
              border: '1px solid var(--border-subtle)',
              borderRadius: '10px',
              color: 'var(--text-primary)',
              padding: '12px 8px',
              fontSize: '13px',
              fontWeight: 600,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px',
            }}
          >
            <span>🔗</span>
            <span>{copied ? 'Link Copied!' : 'Copy Invite'}</span>
          </button>

          <button
            data-testid="btn-share-invite"
            onClick={handleShareInvite}
            style={{
              flex: 1,
              background: 'linear-gradient(135deg, #2aabee 0%, #229ed9 100%)',
              border: 'none',
              borderRadius: '10px',
              color: '#fff',
              padding: '12px 8px',
              fontSize: '13px',
              fontWeight: 700,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px',
            }}
          >
            <span>✈️</span>
            <span>Share to Chat</span>
          </button>
        </div>

        {/* Join by Room Code */}
        {onJoinRoomCode && (
          <div
            style={{
              background: 'rgba(23, 28, 40, 0.85)',
              backdropFilter: 'blur(10px)',
              WebkitBackdropFilter: 'blur(10px)',
              border: '1px solid var(--border-subtle)',
              borderRadius: '10px',
              padding: '10px',
            }}
          >
            <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginBottom: '6px' }}>
              Have a friend's room code?
            </div>
            <div style={{ display: 'flex', gap: '8px' }}>
              <input
                type="text"
                placeholder="e.g. r_12345678"
                value={manualCode}
                onChange={(e) => {
                  setManualCode(e.target.value);
                  setJoinError(null);
                }}
                style={{
                  flex: 1,
                  padding: '8px 10px',
                  borderRadius: '6px',
                  border: '1px solid var(--border-subtle)',
                  background: 'rgba(0,0,0,0.3)',
                  color: '#fff',
                  fontSize: '13px',
                  fontFamily: 'monospace',
                }}
              />
              <button
                onClick={handleManualJoin}
                style={{
                  padding: '8px 14px',
                  borderRadius: '6px',
                  background: 'var(--accent-gold, #d4af37)',
                  color: '#000',
                  fontWeight: 700,
                  fontSize: '12px',
                  cursor: 'pointer',
                  border: 'none',
                }}
              >
                Join
              </button>
            </div>
            {joinError && (
              <div style={{ fontSize: '11px', color: 'var(--accent-red, #ff4d4f)', marginTop: '4px' }}>
                {joinError}
              </div>
            )}
          </div>
        )}

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
