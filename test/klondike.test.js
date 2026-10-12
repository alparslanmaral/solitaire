import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Klondike } from '../js/core/klondike.js';
import { rankOf, suitOf } from '../js/core/cards.js';

const card = (suit, rank) => suit * 13 + (rank - 1); // suit: 0 S, 1 H, 2 D, 3 C

/** A bare table to set up specific situations. */
function emptyGame(overrides = {}) {
  const up = Array(52).fill(true);
  return new Klondike({
    seed: 1,
    drawCount: 1,
    stock: [],
    waste: [],
    foundations: [[], [], [], []],
    tableau: [[], [], [], [], [], [], []],
    up,
    score: 0,
    moves: 0,
    ...overrides,
  });
}

test('a new deal has 52 unique cards in the right places', () => {
  const g = Klondike.newGame({ seed: 42 });
  const s = g.state;
  assert.deepEqual(s.tableau.map((c) => c.length), [1, 2, 3, 4, 5, 6, 7]);
  assert.equal(s.stock.length, 24);
  const all = [...s.stock, ...s.waste, ...s.foundations.flat(), ...s.tableau.flat()];
  assert.equal(new Set(all).size, 52);
  // Only the last card of each column starts face up.
  for (const col of s.tableau) {
    col.forEach((id, i) => assert.equal(s.up[id], i === col.length - 1));
  }
});

test('the same seed gives the same deal', () => {
  const a = Klondike.newGame({ seed: 7 }).state;
  const b = Klondike.newGame({ seed: 7 }).state;
  assert.deepEqual(a.tableau, b.tableau);
  assert.deepEqual(a.stock, b.stock);
});

test('tableau needs alternating colours and descending rank', () => {
  const g = emptyGame({ tableau: [[card(1, 6)], [card(0, 5)], [card(1, 5)], [], [], [], []] });
  assert.equal(g.canMove(card(0, 5), { pile: 'tableau', index: 0 }), true); // black 5 on red 6
  assert.equal(g.canMove(card(1, 5), { pile: 'tableau', index: 0 }), false); // red on red
  assert.equal(g.canMove(card(0, 5), { pile: 'tableau', index: 3 }), false); // not a king
});

test('only kings go to empty columns', () => {
  const g = emptyGame({ tableau: [[card(0, 13)], [card(1, 12)], [], [], [], [], []] });
  assert.equal(g.canMove(card(0, 13), { pile: 'tableau', index: 2 }), true);
  assert.equal(g.canMove(card(1, 12), { pile: 'tableau', index: 2 }), false);
});

test('foundations build up by suit starting from the ace', () => {
  const g = emptyGame({
    tableau: [[card(0, 1)], [card(0, 2)], [card(1, 2)], [], [], [], []],
  });
  assert.equal(g.canMove(card(0, 2), { pile: 'foundation', index: 0 }), false);
  assert.ok(g.move(card(0, 1), { pile: 'foundation', index: 0 }));
  assert.equal(g.canMove(card(0, 2), { pile: 'foundation', index: 0 }), true);
  assert.equal(g.canMove(card(1, 2), { pile: 'foundation', index: 0 }), false); // wrong suit
});

test('moving a stack carries every card on top of it and flips the card below', () => {
  const up = Array(52).fill(true);
  const hidden = card(2, 9);
  up[hidden] = false;
  const g = emptyGame({
    up,
    tableau: [[hidden, card(0, 5), card(1, 4), card(3, 3)], [card(1, 6)], [], [], [], [], []],
  });
  const result = g.move(card(0, 5), { pile: 'tableau', index: 1 });
  assert.ok(result);
  assert.deepEqual(g.state.tableau[1], [card(1, 6), card(0, 5), card(1, 4), card(3, 3)]);
  assert.deepEqual(g.state.tableau[0], [hidden]);
  assert.equal(g.state.up[hidden], true);
  assert.equal(result.flipped, hidden);
});

test('face-down cards cannot be moved', () => {
  const up = Array(52).fill(true);
  up[card(0, 5)] = false;
  const g = emptyGame({ up, tableau: [[card(0, 5)], [card(1, 6)], [], [], [], [], []] });
  assert.equal(g.canMove(card(0, 5), { pile: 'tableau', index: 1 }), false);
});

test('draw 1 / draw 3 and recycling the waste', () => {
  const g1 = Klondike.newGame({ seed: 3, drawCount: 1 });
  g1.draw();
  assert.equal(g1.state.waste.length, 1);
  assert.equal(g1.state.stock.length, 23);

  const g3 = Klondike.newGame({ seed: 3, drawCount: 3 });
  const stockBefore = [...g3.state.stock];
  g3.draw();
  assert.equal(g3.state.waste.length, 3);
  assert.deepEqual(g3.state.waste, [stockBefore.at(-1), stockBefore.at(-2), stockBefore.at(-3)]);

  while (g3.state.stock.length) g3.draw();
  const wasteBefore = [...g3.state.waste];
  const r = g3.draw();
  assert.equal(r.type, 'recycle');
  assert.equal(g3.state.waste.length, 0);
  assert.equal(g3.state.stock.length, 24);
  // Recycling keeps the original order: the first card drawn comes out first again.
  assert.equal(g3.state.stock.at(-1), wasteBefore[0]);
  assert.ok(g3.state.stock.every((id) => !g3.state.up[id]));
});

test('undo restores the previous state exactly', () => {
  const g = Klondike.newGame({ seed: 11 });
  const before = JSON.stringify(g.state);
  g.draw();
  assert.notEqual(JSON.stringify(g.state), before);
  assert.equal(g.undo(), true);
  assert.equal(JSON.stringify(g.state), before);
  assert.equal(g.undo(), false);
});

test('waste and foundation cards can only be moved from the top', () => {
  const g = emptyGame({ waste: [card(0, 4), card(1, 3)], foundations: [[card(0, 1), card(0, 2)], [], [], []] });
  assert.equal(g.isMovable(card(1, 3)), true);
  assert.equal(g.isMovable(card(0, 4)), false);
  assert.equal(g.isMovable(card(0, 1)), false);
  assert.equal(g.isMovable(card(0, 2)), true);
});

test('autoTarget prefers the foundation, then a non-empty column', () => {
  const g = emptyGame({
    tableau: [[card(0, 1)], [card(1, 2)], [card(3, 2)], [], [], [], []],
  });
  assert.deepEqual(g.autoTarget(card(0, 1)), { pile: 'foundation', index: 0 });

  const h = emptyGame({ tableau: [[card(1, 6)], [card(0, 5)], [], [], [], [], []] });
  assert.deepEqual(h.autoTarget(card(0, 5)), { pile: 'tableau', index: 0 });
});

test('a lone king in its column does not hop to another empty column', () => {
  const g = emptyGame({ tableau: [[card(0, 13)], [], [], [], [], [], []] });
  assert.equal(g.autoTarget(card(0, 13)), null);
});

test('hint finds foundation moves first and falls back to drawing', () => {
  const g = emptyGame({ tableau: [[card(2, 1)], [], [], [], [], [], []] });
  const hint = g.hint();
  assert.equal(hint.id, card(2, 1));
  assert.equal(hint.dest.pile, 'foundation');

  const stuck = emptyGame({ stock: [card(0, 9)], tableau: [[card(0, 5)], [card(0, 7)], [], [], [], [], []] });
  assert.deepEqual(stuck.hint(), { draw: true });

  assert.equal(emptyGame().hint(), null);
});

test('auto-complete plays everything to the foundations and wins', () => {
  // Spades 1..13 distributed over the tableau in reverse, all face up, stock empty.
  const tableau = [[], [], [], [], [], [], []];
  for (let r = 13; r >= 1; r--) tableau[(r - 1) % 7].push(card(0, r));
  const g = emptyGame({ tableau });
  g.state.foundations = [[], [], [], []];
  // Other suits already done.
  for (const s of [1, 2, 3]) {
    for (let r = 1; r <= 13; r++) g.state.foundations[s].push(card(s, r));
  }
  assert.equal(g.canAutoComplete(), true);
  let steps = 0;
  while (g.autoCompleteStep()) steps++;
  assert.equal(steps, 13);
  assert.equal(g.isWon(), true);
});

test('state survives a JSON round trip', () => {
  const g = Klondike.newGame({ seed: 99, drawCount: 3 });
  g.draw();
  g.draw();
  const copy = Klondike.fromJSON(JSON.parse(JSON.stringify(g.toJSON())));
  assert.deepEqual(copy.state, g.state);
  copy.undo();
  assert.equal(copy.state.waste.length, 3);
});

test('card helpers', () => {
  assert.equal(suitOf(card(2, 7)), 2);
  assert.equal(rankOf(card(2, 7)), 7);
});
