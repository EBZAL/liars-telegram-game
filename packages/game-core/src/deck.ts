import { Card, CardRank } from './cards.js';

let cardIdCounter = 0;

function createCard(rank: CardRank): Card {
  return { id: `c_${++cardIdCounter}`, rank };
}

export function createLiarDeck(): Card[] {
  const deck: Card[] = [];
  
  for (let i = 0; i < 6; i++) deck.push(createCard('KING'));
  for (let i = 0; i < 6; i++) deck.push(createCard('QUEEN'));
  for (let i = 0; i < 6; i++) deck.push(createCard('ACE'));
  for (let i = 0; i < 2; i++) deck.push(createCard('JOKER'));
  
  return deck;
}

export function createTableDeck(): Card[] {
  return [
    createCard('KING'),
    createCard('QUEEN'),
    createCard('ACE')
  ];
}
