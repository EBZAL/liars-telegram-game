export type CardRank = 'KING' | 'QUEEN' | 'ACE' | 'JOKER';

export interface Card {
  readonly id: string;
  readonly rank: CardRank;
}
