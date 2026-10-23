import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Klondike } from '../js/core/klondike.js';
import { streakBonus, timeBonus, moveBonus, finalScore } from '../js/core/scoring.js';

const card = (suit, rank) => suit * 13 + (rank - 1);

function table(overrides = {}) {
  return new Klondike({
    seed: 1, drawCount: 1, stock: [], waste: [],
    foundations: [[], [], [], []],
    tableau: [[], [], [], [], [], [], []],
    up: Array(52).fill(true),
    score: 0, moves: 0, streak: 0, bestStreak: 0, recycles: 0, nextDraw: 0,
    ...overrides,
  });
}

test('streak bonus pays at every fifth move in a row', () => {
  assert.deepEqual([1, 4, 5, 6, 9, 10, 15].map(streakBonus), [0, 0, 25, 0, 0, 50, 75]);
});

test('time bonus: faster is always better, and it halves every four minutes', () => {
  assert.equal(timeBonus(0), 3000);
  assert.equal(timeBonus(240), 1500);
  assert.equal(timeBonus(480), 750);
  let last = Infinity;
  for (let s = 0; s <= 1800; s += 15) {
    const b = timeBonus(s);
    assert.ok(b <= last);
    last = b;
  }
});

test('move bonus: fewer moves score more, with a floor and a ceiling', () => {
  assert.equal(moveBonus(40), 2000);
  assert.equal(moveBonus(80), 2000);
  assert.equal(moveBonus(170), 1000);
  assert.equal(moveBonus(260), 0);
  assert.equal(moveBonus(400), 0);
  assert.ok(moveBonus(120) > moveBonus(130));
});

test('finalScore adds both bonuses to the in-game score', () => {
  const f = finalScore({ score: 500, moves: 80, seconds: 240 });
  assert.deepEqual(f, { score: 500, timeBonus: 1500, moveBonus: 2000, total: 4000 });
});

test('five scoring moves in a row pay the streak bonus', () => {
  // Five aces waiting on top of five columns (a spare suit stands in for the fifth).
  const g = table({
    tableau: [[card(0, 1)], [card(1, 1)], [card(2, 1)], [card(3, 1)], [], [], []],
    waste: [card(0, 2)],
  });
  const gains = [];
  for (const [id, index] of [[card(0, 1), 0], [card(1, 1), 1], [card(2, 1), 2], [card(3, 1), 3]]) {
    gains.push(g.move(id, { pile: 'foundation', index }));
  }
  assert.deepEqual(gains.map((r) => r.streak), [1, 2, 3, 4]);
  const fifth = g.move(card(0, 2), { pile: 'foundation', index: 0 });
  assert.equal(fifth.streak, 5);
  assert.equal(fifth.streakBonus, 25);
  assert.equal(g.state.score, 5 * 10 + 25);
  assert.equal(g.state.bestStreak, 5);
});

test('a move that earns nothing ends the streak', () => {
  const g = table({
    tableau: [[card(0, 1)], [card(1, 7)], [card(0, 6)], [], [], [], []],
  });
  g.move(card(0, 1), { pile: 'foundation', index: 0 });
  assert.equal(g.state.streak, 1);
  const shuffle = g.move(card(0, 6), { pile: 'tableau', index: 1 }); // black 6 on red 7, no flip
  assert.equal(shuffle.gain, 0);
  assert.equal(g.state.streak, 0);
  assert.equal(g.state.bestStreak, 1);
});

test('drawing keeps the streak, turning the waste over breaks it', () => {
  const g = table({ stock: [card(0, 9), card(0, 8)], tableau: [[card(0, 1)], [], [], [], [], [], []], streak: 3 });
  g.draw();
  assert.equal(g.state.streak, 3);
  g.draw();
  g.draw(); // stock is empty: recycle
  assert.equal(g.state.streak, 0);
});

test('undo brings the streak back too', () => {
  const g = table({ tableau: [[card(0, 1)], [], [], [], [], [], []], streak: 4 });
  g.move(card(0, 1), { pile: 'foundation', index: 0 });
  assert.equal(g.state.streak, 5);
  g.undo();
  assert.equal(g.state.streak, 4);
  assert.equal(g.state.score, 0);
});
