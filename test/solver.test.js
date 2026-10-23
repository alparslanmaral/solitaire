import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Klondike } from '../js/core/klondike.js';
import { solve, verifyWin, trySeed } from '../js/core/solver.js';
import { findWinnableSeed } from '../js/core/winnable.js';

test('every deal the solver claims to win really is won on the real rules', () => {
  let solved = 0;
  for (const drawCount of [1, 3]) {
    for (let seed = 1; seed <= 25; seed++) {
      const game = Klondike.newGame({ seed: seed * 104729, drawCount });
      const r = solve(game.state, { maxNodes: 100000, maxMs: 2000 });
      if (!r.solved) continue;
      solved++;
      assert.equal(verifyWin(seed * 104729, drawCount, r.path), true, `seed ${seed} draw ${drawCount}`);
    }
  }
  assert.ok(solved >= 20, `only ${solved} of 50 deals solved`);
});

test('verifyWin rejects a path that does not win', () => {
  assert.equal(verifyWin(7, 1, []), false);
  assert.equal(verifyWin(7, 1, [{ k: 'draw' }]), false);
});

test('an incomplete table is never reported as won', () => {
  const up = Array(52).fill(true);
  const state = {
    seed: 1, drawCount: 1, stock: [], waste: [], foundations: [[], [], [], []],
    // Only a few kings and queens are on the table, so there is no way to clear all 52 cards.
    tableau: [[12], [25], [38], [51], [11], [24], [37]],
    up, score: 0, moves: 0, recycles: 0, nextDraw: 0,
  };
  const r = solve(state, { maxNodes: 1000 });
  assert.equal(r.solved, false);
});

test('findWinnableSeed returns a seed whose deal verifies (draw 1 and draw 3)', async () => {
  for (const drawCount of [1, 3]) {
    const seed = await findWinnableSeed({ drawCount });
    assert.equal(typeof seed, 'number');
    assert.equal(trySeed(seed, drawCount, { maxNodes: 200000, maxMs: 4000 }).solved, true);
  }
});

test('findWinnableSeed stops when cancelled', async () => {
  const ctl = new AbortController();
  ctl.abort();
  assert.equal(await findWinnableSeed({ drawCount: 1, signal: ctl.signal }), null);
});
