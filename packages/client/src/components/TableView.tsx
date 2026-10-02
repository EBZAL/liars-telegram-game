import React from 'react';
import type { RecipientRoomProjection, PublicPlayerProjection } from '@liars-telegram-game/room-runtime';
import { TableRankBanner } from './TableRankBanner.js';
import { TurnTimerBar } from './TurnTimerBar.js';
import { CentralClaimBanner } from './CentralClaimBanner.js';
import { OpponentSeat } from './OpponentSeat.js';
import { PlayerHand } from './PlayerHand.js';
import { ActionControls } from './ActionControls.js';
import { RouletteChamber } from './RouletteChamber.js';
import { getPlayerDisplayName } from '../player-names.js';
import {
  useCardSelection,
  isOwnTurn,
  isMandatoryCall,
  canPlayCards,
  canCallLiar,
} from '../selection-and-actions.js';

export interface TableViewProps {
  projection: RecipientRoomProjection;
  ownPlayerId: string;
  ownDisplayName?: string;
  onPlayCards: (cardIds: string[]) => void;
  onCallLiar: () => void;
  onTimeout?: () => void;
}

export const TableView: React.FC<TableViewProps> = ({
  projection,
  ownPlayerId,
  ownDisplayName,
  onPlayCards,
  onCallLiar,
  onTimeout,
}) => {
  const { publicState, privateState } = projection;
  const match = publicState.match;

  const currentTurnId = publicState.currentTurnId;
  const { selectedCardIds, toggleCard, clearSelection } = useCardSelection(currentTurnId);
  const playerWins = publicState.playerWins;
  const ownWins = playerWins?.[ownPlayerId] ?? 0;

  if (!match) {
    return (
      <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-secondary)' }}>
        Waiting for match initialization...
      </div>
    );
  }

  const tableRank = match.round.tableRank;
  const previousPlay = match.round.previousPlay;
  const currentActorId = match.round.currentPlayerId;

  // Filter opponents and find own player
  const opponents = match.players.filter((p) => p.playerId !== ownPlayerId);
  const ownPlayer = match.players.find((p) => p.playerId === ownPlayerId);

  // Position opponents based on count (1, 2, or 3 opponents)
  const positionedOpponents: { player: PublicPlayerProjection; position: 'top' | 'left' | 'right' }[] = [];
  if (opponents.length === 1) {
    positionedOpponents.push({ player: opponents[0], position: 'top' });
  } else if (opponents.length === 2) {
    positionedOpponents.push({ player: opponents[0], position: 'left' });
    positionedOpponents.push({ player: opponents[1], position: 'right' });
  } else if (opponents.length >= 3) {
    positionedOpponents.push({ player: opponents[0], position: 'left' });
    positionedOpponents.push({ player: opponents[1], position: 'top' });
    positionedOpponents.push({ player: opponents[2], position: 'right' });
  }

  const ownTurn = isOwnTurn(projection, ownPlayerId);
  const mandatoryCall = isMandatoryCall(projection, ownPlayerId);
  const playEligible = canPlayCards(projection, ownPlayerId, selectedCardIds);
  const challengeEligible = canCallLiar(projection, ownPlayerId);

  const playFromPosition: 'bottom' | 'top' | 'left' | 'right' =
    previousPlay?.playerId === ownPlayerId
      ? 'bottom'
      : positionedOpponents.find((o) => o.player.playerId === previousPlay?.playerId)?.position ?? 'top';

  const handlePlayClick = () => {
    if (playEligible) {
      onPlayCards(selectedCardIds);
      clearSelection();
    }
  };

  const handleChallengeClick = () => {
    if (challengeEligible) {
      onCallLiar();
      clearSelection();
    }
  };

  return (
    <div
      data-testid="table-view"
      className="bg-table"
      style={{
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        height: '100%',
        maxWidth: '480px',
        margin: '0 auto',
        position: 'relative',
        borderRadius: '16px',
        boxShadow: '0 8px 32px rgba(0,0,0,0.6)',
        overflow: 'hidden',
        padding: '6px 4px',
      }}
    >
      {/* Top Header: Table Rank Banner & Top Opponent(s) */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
        <TableRankBanner tableRank={tableRank} />

        {/* Top-seated opponents */}
        <div style={{ display: 'flex', gap: '8px', justifyContent: 'center', marginTop: '2px', width: '100%', padding: '0 4px' }}>
          {positionedOpponents
            .filter((o) => o.position === 'top')
            .map((o) => (
              <OpponentSeat
                key={o.player.playerId}
                player={o.player}
                isCurrentTurn={o.player.playerId === currentActorId}
                position={o.position}
                displayName={getPlayerDisplayName(o.player.playerId, publicState.playerNames)}
                wins={playerWins?.[o.player.playerId]}
              />
            ))}
        </div>
      </div>

      {/* Middle Arena: Left/Right Opponents & Central Claim */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          margin: '4px 0',
          padding: '0 4px',
          width: '100%',
          boxSizing: 'border-box',
          position: 'relative',
        }}
      >
        {/* Left Opponent */}
        <div style={{ flex: '0 0 auto', maxWidth: '96px', display: 'flex', justifyContent: 'center' }}>
          {positionedOpponents
            .filter((o) => o.position === 'left')
            .map((o) => (
              <OpponentSeat
                key={o.player.playerId}
                player={o.player}
                isCurrentTurn={o.player.playerId === currentActorId}
                position={o.position}
                displayName={getPlayerDisplayName(o.player.playerId, publicState.playerNames)}
                wins={playerWins?.[o.player.playerId]}
              />
            ))}
        </div>

        {/* Central Claim & Turn Timer */}
        <div style={{ flex: '1 1 auto', minWidth: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '0 4px' }}>
          <CentralClaimBanner
            previousPlay={previousPlay}
            playerNames={publicState.playerNames}
            fromPosition={playFromPosition}
            playRevision={publicState.revision}
          />
          <TurnTimerBar deadline={publicState.currentTurnDeadline} onExpire={onTimeout} />
        </div>

        {/* Right Opponent */}
        <div style={{ flex: '0 0 auto', maxWidth: '96px', display: 'flex', justifyContent: 'center' }}>
          {positionedOpponents
            .filter((o) => o.position === 'right')
            .map((o) => (
              <OpponentSeat
                key={o.player.playerId}
                player={o.player}
                isCurrentTurn={o.player.playerId === currentActorId}
                position={o.position}
                displayName={getPlayerDisplayName(o.player.playerId, publicState.playerNames)}
                wins={playerWins?.[o.player.playerId]}
              />
            ))}
        </div>
      </div>

      {/* Bottom: Player's Hand & Action Controls */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', paddingBottom: '8px' }}>
        {/* Own Player Status & Revolver */}
        <div
          data-testid="own-player-status"
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '6px 14px',
            background: 'rgba(23, 28, 40, 0.85)',
            backdropFilter: 'blur(8px)',
            WebkitBackdropFilter: 'blur(8px)',
            border: '1px solid var(--border-subtle)',
            borderRadius: '12px',
            margin: '0 8px',
            boxShadow: '0 4px 14px rgba(0, 0, 0, 0.45)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ fontSize: '13px' }}>
              {ownPlayer?.lifeStatus === 'ELIMINATED' ? '💀' : ownTurn ? '🎯' : '👤'}
            </span>
            <span
              style={{
                fontSize: '12px',
                fontWeight: 700,
                color: ownTurn ? 'var(--text-gold)' : 'var(--text-primary)',
              }}
            >
              {ownPlayer?.lifeStatus === 'ELIMINATED'
                ? `${ownDisplayName || 'You'} (Eliminated)`
                : `${ownDisplayName || 'Your'} Revolver`}
            </span>
            {ownWins > 0 && (
              <span
                style={{
                  fontSize: '10px',
                  fontWeight: 800,
                  color: 'var(--text-gold)',
                  background: 'rgba(229, 169, 59, 0.22)',
                  border: '1px solid rgba(229, 169, 59, 0.4)',
                  borderRadius: '8px',
                  padding: '1px 5px',
                }}
              >
                🏆 {ownWins} {ownWins === 1 ? 'Win' : 'Wins'}
              </span>
            )}
          </div>

          <RouletteChamber
            shotsUsed={ownPlayer?.shotsUsed ?? 0}
            isEliminated={ownPlayer?.lifeStatus === 'ELIMINATED'}
          />
        </div>

        {privateState && (
          <PlayerHand
            hand={privateState.hand}
            selectedCardIds={selectedCardIds}
            onToggleCard={toggleCard}
            disabled={!ownTurn}
          />
        )}

        <ActionControls
          isOwnTurn={ownTurn}
          isMandatoryCall={mandatoryCall}
          canPlay={playEligible}
          canChallenge={challengeEligible}
          selectedCount={selectedCardIds.length}
          onPlay={handlePlayClick}
          onChallenge={handleChallengeClick}
        />
      </div>
    </div>
  );
};
