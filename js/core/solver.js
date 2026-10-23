// A Klondike solver, used to make sure multiplayer deals can be won.
//
// It plays the deal with every card visible (depth-first, with a few standard prunings and a table of
// visited positions) and gives up after a budget of positions. "Solved" is always a proof: the winning
// line is replayed on the real game in `verifyWin()`, so a deal that was solved here really is winnable.
// "Not solved" only means "not found within the budget", so the caller just tries another deal.
//
// Not used: moves that pull cards back off the foundations. Skipping them can only miss a few winnable
// deals, never claim an unwinnable one.

import { Klondike } from './klondike.js';

const suitOf = (id) => (id / 13) | 0;
const rankOf = (id) => (id % 13) + 1;
const isRed = (id) => {
  const s = suitOf(id);
  return s === 1 || s === 2;
};

// ---- compact search state (arrays are never mutated in place, only replaced) ----------------------

function fromGame(state) {
  const f = [0, 0, 0, 0];
  for (const pile of state.foundations) if (pile.length) f[suitOf(pile[0])] = pile.length;
  return {
    tab: state.tableau.map((c) => c.slice()),
    down: state.tableau.map((c) => c.filter((id) => !state.up[id]).length),
    stock: state.stock.slice(),
    waste: state.waste.slice(),
    f,
    nextDraw: state.nextDraw || 0,
    recycles: state.recycles || 0,
  };
}

const isWon = (s) => s.f[0] + s.f[1] + s.f[2] + s.f[3] === 52;

/** A card whose foundation move can never hurt: nothing still on the table needs it as a landing spot. */
function isSafe(s, id) {
  const rank = rankOf(id);
  if (rank <= 2) return true;
  const [a, b] = isRed(id) ? [0, 3] : [1, 2];
  return s.f[a] >= rank - 1 && s.f[b] >= rank - 1;
}

function canLand(id, col, down) {
  if (col.length === 0) return rankOf(id) === 13;
  if (down >= col.length) return false; // face-down top (cannot happen after a flip, but be safe)
  const top = col[col.length - 1];
  return isRed(top) !== isRed(id) && rankOf(top) === rankOf(id) + 1;
}

/** Take `count` cards off the end of column c, flipping the new top if it was face down. */
function removeFromColumn(s, c, count) {
  const col = s.tab[c].slice(0, s.tab[c].length - count);
  const tab = s.tab.slice();
  tab[c] = col;
  let down = s.down;
  if (col.length > 0 && down[c] >= col.length) {
    down = down.slice();
    down[c] = col.length - 1;
  }
  return { tab, down };
}

function applyMove(s, m, drawCount) {
  switch (m.k) {
    case 'tf': {
      const id = s.tab[m.c][s.tab[m.c].length - 1];
      const { tab, down } = removeFromColumn(s, m.c, 1);
      const f = s.f.slice();
      f[suitOf(id)]++;
      return { ...s, tab, down, f };
    }
    case 'wf': {
      const id = s.waste[s.waste.length - 1];
      const f = s.f.slice();
      f[suitOf(id)]++;
      return { ...s, waste: s.waste.slice(0, -1), f };
    }
    case 'tt': {
      const run = s.tab[m.c].slice(m.pos);
      const { tab, down } = removeFromColumn(s, m.c, run.length);
      tab[m.d] = tab[m.d].concat(run);
      return { ...s, tab, down };
    }
    case 'wt': {
      const id = s.waste[s.waste.length - 1];
      const tab = s.tab.slice();
      tab[m.d] = tab[m.d].concat(id);
      return { ...s, tab, waste: s.waste.slice(0, -1) };
    }
    default: {
      // draw, or turn the waste over when the stock is empty (same rules as Klondike.draw)
      if (s.stock.length) {
        const n = Math.min(s.nextDraw || drawCount, s.stock.length);
        const stock = s.stock.slice(0, s.stock.length - n);
        const waste = s.waste.concat(s.stock.slice(s.stock.length - n).reverse());
        return { ...s, stock, waste, nextDraw: 0 };
      }
      const recycles = s.recycles + 1;
      return {
        ...s,
        stock: s.waste.slice().reverse(),
        waste: [],
        recycles,
        nextDraw: drawCount === 3 ? ((recycles - 1) % 3) + 1 : 0,
      };
    }
  }
}

/** The position, with the seven columns in a canonical order so mirror-image states match. */
function keyOf(s, drawCount) {
  const cols = s.tab.map((c, i) => `${s.down[i]}:${c.join(',')}`).sort();
  return `${cols.join('/')}|${s.f.join(',')}|${s.stock.join(',')}|${s.waste.join(',')}|${s.nextDraw}|${drawCount === 3 ? s.recycles % 3 : 0}`;
}

/** Candidate moves, best first. Each is { k, ...args, action } where `action` is what gets replayed. */
function generateMoves(s) {
  const flips = [];
  const home = [];
  const fromWaste = [];
  const shuffles = [];

  const wasteTop = s.waste.length ? s.waste[s.waste.length - 1] : -1;

  for (let c = 0; c < 7; c++) {
    const col = s.tab[c];
    if (!col.length) continue;
    const first = s.down[c];
    const last = col[col.length - 1];

    if (rankOf(last) === s.f[suitOf(last)] + 1) {
      home.push({ k: 'tf', c, action: { k: 'm', id: last, to: 'f', i: suitOf(last) } });
    }

    for (let pos = first; pos < col.length; pos++) {
      const id = col[pos];
      for (let d = 0; d < 7; d++) {
        if (d === c || !canLand(id, s.tab[d], s.down[d])) continue;
        const move = { k: 'tt', c, pos, d, action: { k: 'm', id, to: 't', i: d } };
        if (pos === first) {
          if (first > 0) flips.push(move); // uncovers a hidden card
          else if (s.tab[d].length > 0) shuffles.unshift(move); // empties a column
        } else if (rankOf(col[pos - 1]) === s.f[suitOf(col[pos - 1])] + 1) {
          shuffles.push(move); // uncovers a card that can go home
        }
      }
    }
  }

  if (wasteTop >= 0) {
    if (rankOf(wasteTop) === s.f[suitOf(wasteTop)] + 1) {
      home.push({ k: 'wf', action: { k: 'm', id: wasteTop, to: 'f', i: suitOf(wasteTop) } });
    }
    for (let d = 0; d < 7; d++) {
      if (canLand(wasteTop, s.tab[d], s.down[d])) fromWaste.push({ k: 'wt', d, action: { k: 'm', id: wasteTop, to: 't', i: d } });
    }
  }

  const draw = s.stock.length || s.waste.length ? [{ k: 'draw', action: { k: 'draw' } }] : [];
  return [...flips, ...home, ...fromWaste, ...shuffles, ...draw];
}

/**
 * Search for a win from `state` (a Klondike state). Returns
 *   { solved: true, path, nodes }  or  { solved: false, nodes, exhausted }
 * where `exhausted` means the whole reachable space was searched, i.e. the deal truly cannot be won
 * with these moves (as opposed to running out of budget).
 */
export function solve(state, { maxNodes = 200000, maxMs = 2000 } = {}) {
  const drawCount = state.drawCount;
  const visited = new Set();
  const path = [];
  const deadline = performance.now() + maxMs;
  let nodes = 0;
  let aborted = false;

  function dfs(start) {
    if (++nodes > maxNodes || ((nodes & 255) === 0 && performance.now() > deadline)) {
      aborted = true;
      return false;
    }
    const mark = path.length;

    // Moves that can never hurt are made without branching.
    let s = start;
    for (let again = true; again; ) {
      again = false;
      for (let c = 0; c < 7 && !again; c++) {
        const col = s.tab[c];
        if (!col.length) continue;
        const id = col[col.length - 1];
        if (rankOf(id) === s.f[suitOf(id)] + 1 && isSafe(s, id)) {
          path.push({ k: 'm', id, to: 'f', i: suitOf(id) });
          s = applyMove(s, { k: 'tf', c }, drawCount);
          again = true;
        }
      }
      const w = s.waste.length ? s.waste[s.waste.length - 1] : -1;
      if (!again && w >= 0 && rankOf(w) === s.f[suitOf(w)] + 1 && isSafe(s, w)) {
        path.push({ k: 'm', id: w, to: 'f', i: suitOf(w) });
        s = applyMove(s, { k: 'wf' }, drawCount);
        again = true;
      }
    }

    if (isWon(s)) return true;
    const key = keyOf(s, drawCount);
    if (visited.has(key)) {
      path.length = mark;
      return false;
    }
    visited.add(key);

    for (const m of generateMoves(s)) {
      path.push(m.action);
      if (dfs(applyMove(s, m, drawCount))) return true;
      path.pop();
      if (aborted) break;
    }
    path.length = mark;
    return false;
  }

  const solved = dfs(fromGame(state));
  return solved ? { solved: true, path: path.slice(), nodes } : { solved: false, nodes, exhausted: !aborted };
}

/** Replay a solver path on the real game. Returns true only if it ends with every card home. */
export function verifyWin(seed, drawCount, path) {
  const game = Klondike.newGame({ seed, drawCount });
  const s = game.state;
  for (const a of path) {
    if (a.k === 'draw') {
      if (!game.draw()) return false;
      continue;
    }
    let dest;
    if (a.to === 't') dest = { pile: 'tableau', index: a.i };
    else {
      let index = s.foundations.findIndex((p) => p.length && Math.floor(p[0] / 13) === a.i);
      if (index < 0) index = s.foundations.findIndex((p) => p.length === 0);
      dest = { pile: 'foundation', index };
    }
    if (!game.move(a.id, dest)) return false;
  }
  return game.isWon();
}

/** Try one seed. Returns { solved, path?, nodes } and has already verified any win on the real rules. */
export function trySeed(seed, drawCount, budget) {
  const game = Klondike.newGame({ seed, drawCount });
  const result = solve(game.state, budget);
  if (result.solved && !verifyWin(seed, drawCount, result.path)) return { solved: false, nodes: result.nodes, exhausted: false };
  return result;
}
