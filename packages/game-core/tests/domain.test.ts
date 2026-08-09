import { describe, it, expect } from 'vitest';
import {
  CardRank,
  Card,
  createLiarDeck,
  createTableDeck,
  parsePlayerCount,
  createBaseRevolver,
  RandomSource,
  shuffle
} from '../src/index.js';

describe('Domain Foundation Contracts', () => {
  it('AC-04: Canonical CardRank/Card primitives exist', () => {
    const ranks: CardRank[] = ['KING', 'QUEEN', 'ACE', 'JOKER'];
    const card: Card = { id: 'c_test', rank: 'KING' };
    expect(ranks).toContain(card.rank);
  });

  it('AC-05: Liar Deck factory produces exactly 20 uniquely identified cards with 6K/6Q/6A/2J', () => {
    const deck = createLiarDeck();
    expect(deck.length).toBe(20);

    const counts = { KING: 0, QUEEN: 0, ACE: 0, JOKER: 0 };
    const ids = new Set<string>();

    deck.forEach(c => {
      counts[c.rank]++;
      ids.add(c.id);
    });

    expect(counts).toEqual({ KING: 6, QUEEN: 6, ACE: 6, JOKER: 2 });
    expect(ids.size).toBe(20);
  });

  it('AC-06: Deck factory returns independent mutable containers with deterministic IDs', () => {
    const deck1 = createLiarDeck();
    const table = createTableDeck(); // unrelated call in between
    const deck2 = createLiarDeck();
    
    // Independent containers:
    expect(deck1).not.toBe(deck2);
    expect(deck1[0]).not.toBe(deck2[0]);

    // Modifying one doesn't modify the other:
    deck1.pop();
    expect(deck1.length).toBe(19);
    expect(deck2.length).toBe(20);

    // Deterministic IDs (equivalent calls produce same IDs):
    expect(deck2[0].id).toBe('liar-KING-1');

    // IDs remain unique within one deck:
    const ids = new Set(deck2.map(c => c.id));
    expect(ids.size).toBe(20);
  });

  it('AC-07: Table Deck factory produces exactly one KING, one QUEEN and one ACE', () => {
    const table = createTableDeck();
    expect(table.length).toBe(3);
    
    const counts = { KING: 0, QUEEN: 0, ACE: 0, JOKER: 0 };
    table.forEach(c => { counts[c.rank]++; });
    
    expect(counts).toEqual({ KING: 1, QUEEN: 1, ACE: 1, JOKER: 0 });
  });

  it('AC-08: PlayerCount validation accepts exactly 2, 3 and 4', () => {
    expect(parsePlayerCount(2)).toBe(2);
    expect(parsePlayerCount(3)).toBe(3);
    expect(parsePlayerCount(4)).toBe(4);
    
    expect(() => parsePlayerCount(1)).toThrow();
    expect(() => parsePlayerCount(5)).toThrow();
    expect(() => parsePlayerCount(0)).toThrow();
  });

  it('AC-09: Base Revolver composition contains exactly 1 LETHAL and 5 BLANK outcomes', () => {
    const revolver = createBaseRevolver();
    expect(revolver.length).toBe(6);
    
    const lethals = revolver.filter(r => r === 'LETHAL').length;
    const blanks = revolver.filter(r => r === 'BLANK').length;
    
    expect(lethals).toBe(1);
    expect(blanks).toBe(5);
  });

  it('AC-10 & AC-11: RandomSource contract and deterministic shuffle', () => {
    const arr = [1, 2, 3, 4, 5];
    
    // Always returns 0, so swap with index 0 always.
    class FakeSourceZero implements RandomSource {
      nextInt(max: number) { return 0; }
    }
    
    const shuffled1 = shuffle(arr, new FakeSourceZero());
    const shuffled2 = shuffle(arr, new FakeSourceZero());
    
    // Deterministic:
    expect(shuffled1).toEqual(shuffled2);
    
    // Original untouched:
    expect(arr).toEqual([1, 2, 3, 4, 5]);
    
    // Actually shuffled with logic (reverse shift):
    expect(shuffled1).toEqual([2, 3, 4, 5, 1]);
  });
});

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

describe('Source Verification (AC-12)', () => {
  it('Production source must not contain direct Math.random() calls', () => {
    const srcDir = path.resolve(fileURLToPath(new URL('.', import.meta.url)), '../src');
    const files = fs.readdirSync(srcDir).filter((f: string) => f.endsWith('.ts'));
    
    for (const file of files) {
      const content = fs.readFileSync(path.join(srcDir, file), 'utf-8');
      expect(content).not.toMatch(/Math\.random/);
    }
  });
});
