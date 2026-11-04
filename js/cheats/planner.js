// Works out the next move of a winning line, for the cheats menu.
//
// Every card is known to the client (the face-down ones are just not drawn), so the solver can look at the
// current table and find a way to clear it. The planner remembers that line, and as long as the table keeps
// matching it, answering "what next?" is a lookup. If the table changes in some other way (the partner moved,
// the player did their own thing) it simply solves again from where things stand. When no win can be found
// (the position may already be lost) it answers null and the caller falls back to the ordinary hint.

import { Klondike } from '../core/klondike.js';
import { solve } from '../core/solver.js';

const BUDGET = { maxNodes: 250000, maxMs: 900 };

/** A string that is equal for two tables exactly when they are the same position. */
export function positionKey(s) {
  const tableau = s.tableau.map((col) => col.map((id) => id * 2 + (s.up[id] ? 1 : 0)).join(',')).join('/');
  return `${tableau}|${s.foundations.map((p) => p.join(',')).join('/')}|${s.stock.join(',')}|${s.waste.join(',')}|${s.nextDraw || 0}|${(s.recycles || 0) % 3}`;
}

/** Turn a solver step into what the game and the board understand: { id, dest } or { draw: true }. */
export function toMove(state, step) {
  if (step.k === 'draw') return { draw: true };
  if (step.to === 't') return { id: step.id, dest: { pile: 'tableau', index: step.i } };
  let index = state.foundations.findIndex((p) => p.length && Math.floor(p[0] / 13) === step.i);
  if (index < 0) index = state.foundations.findIndex((p) => p.length === 0);
  return { id: step.id, dest: { pile: 'foundation', index } };
}

export function createPlanner({ budget = BUDGET } = {}) {
  let steps = new Map(); // position key -> the step to take from there
  let failed = null; // key of a position the solver could not crack

  /** @returns {{ id: number, dest: object } | { draw: true } | null} */
  function next(game) {
    const state = game.state;
    const key = positionKey(state);
    if (steps.has(key)) return toMove(state, steps.get(key));
    if (failed === key) return null;

    const result = solve(state, budget);
    if (!result.solved) {
      failed = key;
      return null;
    }

    // Walk the line on a scratch copy to learn the position before every step.
    const scratch = new Klondike(JSON.parse(JSON.stringify(state)));
    steps = new Map();
    for (const step of result.path) {
      steps.set(positionKey(scratch.state), step);
      const move = toMove(scratch.state, step);
      if (move.draw) scratch.draw();
      else scratch.move(move.id, move.dest);
    }
    return toMove(state, steps.get(key));
  }

  return { next, reset: () => ((steps = new Map()), (failed = null)) };
}
