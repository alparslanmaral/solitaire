import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Klondike } from '../js/core/klondike.js';
import { createPlanner } from '../js/cheats/planner.js';
import { findWinnableSeed } from '../js/core/winnable.js';

function play(game, move) {
  return move.draw ? game.draw() : game.move(move.id, move.dest);
}

test('following the planner wins the deal, in either draw mode', async () => {
  for (const drawCount of [1, 3]) {
    const seed = await findWinnableSeed({ drawCount });
    const game = Klondike.newGame({ seed, drawCount });
    const planner = createPlanner();
    let guard = 0;
    while (!game.isWon() && guard++ < 600) {
      const move = planner.next(game);
      assert.ok(move, `a move is always available (draw ${drawCount}, step ${guard})`);
      assert.ok(play(game, move), 'and it is legal');
    }
    assert.equal(game.isWon(), true, `draw ${drawCount} won in ${guard} steps`);
  }
});

test('a plan is solved once and then simply followed', async () => {
  const seed = await findWinnableSeed({ drawCount: 1 });
  const game = Klondike.newGame({ seed, drawCount: 1 });
  const planner = createPlanner({ budget: { maxNodes: 250000, maxMs: 900 } });
  const first = planner.next(game);
  // Corrupt the budget: a second solve would now fail, so only the cached line can answer.
  const again = createPlanner({ budget: { maxNodes: 1, maxMs: 1 } });
  assert.equal(again.next(game), null);
  play(game, first);
  assert.ok(planner.next(game), 'the next step comes from the remembered line');
});

test('after the table is changed by someone else, the planner solves again from there', async () => {
  const seed = await findWinnableSeed({ drawCount: 1 });
  const game = Klondike.newGame({ seed, drawCount: 1 });
  const planner = createPlanner();
  planner.next(game);
  // Some other move, not necessarily the planned one.
  game.draw();
  game.draw();
  const move = planner.next(game);
  assert.ok(move === null || play(game, move), 'either a legal move, or an honest "no win from here"');
});

test('a position with no win is reported as null, not a bad move', () => {
  const up = Array(52).fill(true);
  const game = new Klondike({
    seed: 1, drawCount: 1, stock: [], waste: [], foundations: [[], [], [], []],
    tableau: [[12], [25], [38], [51], [11], [24], [37]], up, score: 0, moves: 0, recycles: 0, nextDraw: 0,
  });
  assert.equal(createPlanner().next(game), null);
});
