import { Card, CardRank } from './cards.js';

function createCard(kind: string, rank: CardRank, index: number): Card {
  return { id: `${kind}-${rank}-${index}`, rank };
}

export function createLiarDeck(): Card[] {
  const deck: Card[] = [];
  
  for (let i = 1; i <= 6; i++) deck.push(createCard('liar', 'KING', i));
  for (let i = 1; i <= 6; i++) deck.push(createCard('liar', 'QUEEN', i));
  for (let i = 1; i <= 6; i++) deck.push(createCard('liar', 'ACE', i));
  for (let i = 1; i <= 2; i++) deck.push(createCard('liar', 'JOKER', i));
  
  return deck;
}

export function createTableDeck(): Card[] {
  return [
    createCard('table', 'KING', 1),
    createCard('table', 'QUEEN', 1),
    createCard('table', 'ACE', 1)
  ];
}
