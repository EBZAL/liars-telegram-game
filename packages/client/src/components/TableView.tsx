import React from 'react';
import type { RecipientRoomProjection, PublicPlayerProjection } from '@liars-telegram-game/room-runtime';
import { TableRankBanner } from './TableRankBanner.js';
import { TurnTimerBar } from './TurnTimerBar.js';
import { CentralClaimBanner } from './CentralClaimBanner.js';
import { OpponentSeat } from './OpponentSeat.js';
import { PlayerHand } from './PlayerHand.js';
import { ActionControls } from './ActionControls.js';
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
  onPlayCards: (cardIds: string[]) => void;
  onCallLiar: () => void;
}

export const TableView: React.FC<TableViewProps> = ({
  projection,
  ownPlayerId,
  onPlayCards,
  onCallLiar,
}) => {
  const { publicState, privateState } = projection;
  const match = publicState.match;

  const currentTurnId = publicState.currentTurnId;
  const { selectedCardIds, toggleCard, clearSelection } = useCardSelection(currentTurnId);

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

  // Filter opponents
  const opponents = match.players.filter((p) => p.playerId !== ownPlayerId);

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
      style={{
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        height: '100%',
        maxWidth: '480px',
        margin: '0 auto',
        position: 'relative',
      }}
    >
      {/* Top Header: Table Rank Banner & Top Opponent(s) */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
        <TableRankBanner tableRank={tableRank} />

        {/* Top-seated opponents */}
        <div style={{ display: 'flex', gap: '12px', justifyContent: 'center', marginTop: '4px' }}>
          {positionedOpponents
            .filter((o) => o.position === 'top')
            .map((o) => (
              <OpponentSeat
                key={o.player.playerId}
                player={o.player}
                isCurrentTurn={o.player.playerId === currentActorId}
                position={o.position}
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
          margin: '12px 0',
          position: 'relative',
        }}
      >
        {/* Left Opponent */}
        <div style={{ minWidth: '90px', display: 'flex', justifyContent: 'center' }}>
          {positionedOpponents
            .filter((o) => o.position === 'left')
            .map((o) => (
              <OpponentSeat
                key={o.player.playerId}
                player={o.player}
                isCurrentTurn={o.player.playerId === currentActorId}
                position={o.position}
              />
            ))}
        </div>

        {/* Central Claim & Turn Timer */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <CentralClaimBanner previousPlay={previousPlay} />
          <TurnTimerBar deadline={publicState.currentTurnDeadline} />
        </div>

        {/* Right Opponent */}
        <div style={{ minWidth: '90px', display: 'flex', justifyContent: 'center' }}>
          {positionedOpponents
            .filter((o) => o.position === 'right')
            .map((o) => (
              <OpponentSeat
                key={o.player.playerId}
                player={o.player}
                isCurrentTurn={o.player.playerId === currentActorId}
                position={o.position}
              />
            ))}
        </div>
      </div>

      {/* Bottom: Player's Hand & Action Controls */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', paddingBottom: '8px' }}>
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
