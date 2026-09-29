/**
 * Resolves player display names, favoring Telegram profile names / usernames over raw numeric IDs.
 */
export function getPlayerDisplayName(
  playerId: string,
  playerNames?: Record<string, string>,
  ownPlayerId?: string,
  ownDisplayName?: string
): string {
  if (!playerId) return 'Player';

  // If this is the local user and we have their Telegram name, use it
  if (ownPlayerId && playerId === ownPlayerId && ownDisplayName) {
    return ownDisplayName;
  }

  // If server provided a mapped profile name for this ID, use it
  if (playerNames && playerNames[playerId] && playerNames[playerId].trim().length > 0) {
    return playerNames[playerId];
  }

  return playerId;
}
