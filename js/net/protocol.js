// What two players say to each other. Everything on the wire is plain JSON with a `t` (type) field.
//
//   guest -> host   hello {v, name}        act {a}            stuck {v}        resign        rematch    ping
//   host  -> guest  welcome {mode, drawCount, host}           reject {reason}
//                   start {round, seed, drawCount, mode, host}                 (both sides build the deal from the seed)
//                   opp {name, score, moves, streak, found}   (PvP: the host's live numbers)
//                   sync {state, canUndo, contrib}            (co-op: the one true game)
//                   resync {state}                            (PvP: "your copy drifted, here is the real one")
//                   end {result}    ping
//
// `a` is an action: { k: 'move', id, dest: { pile, index } } | { k: 'draw' } | { k: 'undo' }.
// The host never trusts an action: it replays it on its own copy of the game and answers with the truth.

export const PROTOCOL_VERSION = 1;

export const MODES = Object.freeze({ PVP: 'pvp', COOP: 'coop' });

/** An action from the other side, checked and rebuilt, or null if it is malformed. */
export function parseAction(a) {
  if (!a || typeof a !== 'object') return null;
  if (a.k === 'draw' || a.k === 'undo') return { k: a.k };
  if (a.k !== 'move' || !Number.isInteger(a.id) || a.id < 0 || a.id > 51 || !a.dest) return null;
  const { pile, index } = a.dest;
  const limit = pile === 'tableau' ? 7 : pile === 'foundation' ? 4 : 0;
  if (!Number.isInteger(index) || index < 0 || index >= limit) return null;
  return { k: 'move', id: a.id, dest: { pile, index } };
}

/** Does this look like a real game state (all 52 cards exactly once, right number of piles)? */
export function isValidState(s) {
  if (!s || !Array.isArray(s.stock) || !Array.isArray(s.waste) || !Array.isArray(s.up) || s.up.length !== 52) return false;
  if (!Array.isArray(s.foundations) || s.foundations.length !== 4 || !s.foundations.every(Array.isArray)) return false;
  if (!Array.isArray(s.tableau) || s.tableau.length !== 7 || !s.tableau.every(Array.isArray)) return false;
  if (![1, 3].includes(s.drawCount) || !Number.isFinite(s.score) || !Number.isFinite(s.moves)) return false;
  const all = [...s.stock, ...s.waste, ...s.foundations.flat(), ...s.tableau.flat()];
  return all.length === 52 && new Set(all).size === 52 && all.every((id) => Number.isInteger(id) && id >= 0 && id < 52);
}

export function cleanName(name, fallback) {
  const text = typeof name === 'string' ? name.replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, 16) : '';
  return text || fallback;
}

export const foundationCount = (state) => state.foundations.reduce((n, pile) => n + pile.length, 0);

/** The numbers shown to the other player. */
export function liveStats(name, state) {
  return { name, score: state.score, moves: state.moves, streak: state.streak ?? 0, found: foundationCount(state) };
}
