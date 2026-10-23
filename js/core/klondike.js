// Klondike rules. Pure logic, no DOM, so it can be tested in Node.
//
// State shape:
//   stock / waste : number[]      (top of the pile is the LAST element)
//   foundations   : number[][4]
//   tableau       : number[][7]   (last element = the card at the bottom of the fan)
//   up            : boolean[52]   (is the card face up?)

import { mulberry32, shuffle } from './rng.js';
import { rankOf, suitOf, isRed } from './cards.js';
import { streakBonus } from './scoring.js';

const HISTORY_LIMIT = 300;
const snapshot = (state) => JSON.parse(JSON.stringify(state));

export class Klondike {
  constructor(state, history = []) {
    this.state = state;
    this.history = history;
  }

  static newGame({ seed, drawCount = 1 }) {
    const ids = shuffle([...Array(52).keys()], mulberry32(seed));
    const tableau = Array.from({ length: 7 }, () => []);
    let n = 0;
    for (let col = 0; col < 7; col++) {
      for (let i = 0; i <= col; i++) tableau[col].push(ids[n++]);
    }
    const up = Array(52).fill(false);
    for (const col of tableau) up[col[col.length - 1]] = true;
    return new Klondike({
      seed,
      drawCount,
      stock: ids.slice(n),
      waste: [],
      foundations: [[], [], [], []],
      tableau,
      up,
      score: 0,
      moves: 0,
      streak: 0, // moves in a row that earned points
      bestStreak: 0,
      recycles: 0, // how many times the waste has been turned back into the stock
      nextDraw: 0, // 0 = draw the normal amount; otherwise the size of the next draw (see draw())
    });
  }

  toJSON() {
    return { state: this.state, history: this.history.slice(-60) };
  }

  static fromJSON(data) {
    return new Klondike(data.state, data.history ?? []);
  }

  // ---- queries -----------------------------------------------------------

  /** Where is a card? -> { pile, index, pos } */
  locate(id) {
    const s = this.state;
    let pos = s.stock.indexOf(id);
    if (pos >= 0) return { pile: 'stock', index: 0, pos };
    pos = s.waste.indexOf(id);
    if (pos >= 0) return { pile: 'waste', index: 0, pos };
    for (let i = 0; i < 4; i++) {
      pos = s.foundations[i].indexOf(id);
      if (pos >= 0) return { pile: 'foundation', index: i, pos };
    }
    for (let i = 0; i < 7; i++) {
      pos = s.tableau[i].indexOf(id);
      if (pos >= 0) return { pile: 'tableau', index: i, pos };
    }
    return null;
  }

  pileOf(loc) {
    const s = this.state;
    if (loc.pile === 'stock') return s.stock;
    if (loc.pile === 'waste') return s.waste;
    if (loc.pile === 'foundation') return s.foundations[loc.index];
    return s.tableau[loc.index];
  }

  /** Cards that would travel together if `id` is picked up. */
  sequenceFrom(id) {
    const loc = this.locate(id);
    if (!loc) return [];
    return this.pileOf(loc).slice(loc.pos);
  }

  /** Can this card be picked up at all? */
  isMovable(id) {
    const loc = this.locate(id);
    if (!loc || loc.pile === 'stock' || !this.state.up[id]) return false;
    if (loc.pile === 'tableau') return true;
    return loc.pos === this.pileOf(loc).length - 1; // waste / foundation: top only
  }

  /** dest: { pile: 'tableau' | 'foundation', index } */
  canMove(id, dest) {
    if (!this.isMovable(id)) return false;
    const s = this.state;
    const loc = this.locate(id);
    const count = this.pileOf(loc).length - loc.pos;

    if (dest.pile === 'foundation') {
      if (count !== 1) return false;
      if (loc.pile === 'foundation') return false;
      const pile = s.foundations[dest.index];
      if (pile.length === 0) return rankOf(id) === 1;
      const top = pile[pile.length - 1];
      return suitOf(top) === suitOf(id) && rankOf(id) === rankOf(top) + 1;
    }

    if (dest.pile === 'tableau') {
      if (loc.pile === 'tableau' && loc.index === dest.index) return false;
      const pile = s.tableau[dest.index];
      if (pile.length === 0) return rankOf(id) === 13;
      const top = pile[pile.length - 1];
      return s.up[top] && isRed(top) !== isRed(id) && rankOf(top) === rankOf(id) + 1;
    }
    return false;
  }

  isWon() {
    return this.state.foundations.every((f) => f.length === 13);
  }

  /** Stock is gone and nothing is hidden: the rest is mechanical. */
  canAutoComplete() {
    const s = this.state;
    return !this.isWon() && s.stock.length === 0 && s.tableau.every((col) => col.every((id) => s.up[id]));
  }

  // ---- moves -------------------------------------------------------------

  #push() {
    this.history.push(snapshot(this.state));
    if (this.history.length > HISTORY_LIMIT) this.history.shift();
  }

  get canUndo() {
    return this.history.length > 0;
  }

  undo() {
    const prev = this.history.pop();
    if (!prev) return false;
    this.state = prev;
    return true;
  }

  /** Flip the stock to the waste, or recycle the waste back into the stock. */
  draw() {
    const s = this.state;
    if (s.stock.length > 0) {
      this.#push();
      const n = Math.min(s.nextDraw || s.drawCount, s.stock.length);
      s.nextDraw = 0;
      const cards = [];
      for (let i = 0; i < n; i++) {
        const id = s.stock.pop();
        s.up[id] = true;
        s.waste.push(id);
        cards.push(id);
      }
      s.moves++;
      return { type: 'draw', cards };
    }
    if (s.waste.length > 0) {
      this.#push();
      while (s.waste.length) {
        const id = s.waste.pop();
        s.up[id] = false;
        s.stock.push(id);
      }
      s.score = Math.max(0, s.score - (s.drawCount === 1 ? 100 : 20));
      // Draw 3: the order is kept, but the first draw of each new pass takes 1, then 2, then 3 cards.
      // That shifts the groups of three, so a different card lands on top each time round.
      s.streak = 0;
      s.recycles = (s.recycles ?? 0) + 1;
      s.nextDraw = s.drawCount === 3 ? ((s.recycles - 1) % 3) + 1 : 0;
      s.moves++;
      return { type: 'recycle' };
    }
    return null;
  }

  /** Move `id` (and everything on top of it) to `dest`. Returns a result or null. */
  move(id, dest) {
    if (!this.canMove(id, dest)) return null;
    const s = this.state;
    this.#push();

    const from = this.locate(id);
    const source = this.pileOf(from);
    const cards = source.splice(from.pos);
    const target = dest.pile === 'foundation' ? s.foundations[dest.index] : s.tableau[dest.index];
    target.push(...cards);

    // Points for the move itself ...
    let gain = 0;
    if (dest.pile === 'foundation') gain += 10;
    else if (from.pile === 'waste') gain += 5;
    else if (from.pile === 'foundation') gain -= 15;

    let flipped = null;
    if (from.pile === 'tableau' && source.length > 0) {
      const top = source[source.length - 1];
      if (!s.up[top]) {
        s.up[top] = true;
        gain += 5;
        flipped = top;
      }
    }
    s.score = Math.max(0, s.score + gain);

    // ... and the streak: every scoring move extends it, anything else ends it.
    let bonus = 0;
    if (gain > 0) {
      s.streak = (s.streak ?? 0) + 1;
      s.bestStreak = Math.max(s.bestStreak ?? 0, s.streak);
      bonus = streakBonus(s.streak);
      s.score += bonus;
    } else {
      s.streak = 0;
    }
    s.moves++;
    return { type: 'move', from, dest, cards, flipped, toFoundation: dest.pile === 'foundation', gain, streak: s.streak, streakBonus: bonus };
  }

  // ---- helpers for tap-to-move, hints and auto-complete -------------------

  /** Best destination for a tapped card, or null. */
  autoTarget(id) {
    if (!this.isMovable(id)) return null;
    const s = this.state;
    const loc = this.locate(id);

    // Foundation first: prefer the pile that already holds this suit.
    const foundationOrder = [0, 1, 2, 3].sort(
      (a, b) => Number(s.foundations[b].length > 0) - Number(s.foundations[a].length > 0),
    );
    for (const index of foundationOrder) {
      const dest = { pile: 'foundation', index };
      if (this.canMove(id, dest)) return dest;
    }

    // Don't shuffle a card away from a sequence it already sits happily in.
    if (loc.pile === 'tableau' && loc.pos > 0 && s.up[s.tableau[loc.index][loc.pos - 1]]) return null;

    let empty = null;
    for (let index = 0; index < 7; index++) {
      const dest = { pile: 'tableau', index };
      if (!this.canMove(id, dest)) continue;
      if (s.tableau[index].length > 0) return dest;
      // A king already at the bottom of a column gains nothing from an empty one.
      if (!(loc.pile === 'tableau' && loc.pos === 0)) empty ??= dest;
    }
    return empty;
  }

  /** A sensible next move: { id, dest } | { draw: true } | null. */
  hint() {
    const s = this.state;
    const tops = [];
    if (s.waste.length) tops.push(s.waste[s.waste.length - 1]);
    for (const col of s.tableau) if (col.length) tops.push(col[col.length - 1]);

    for (const id of tops) {
      for (let index = 0; index < 4; index++) {
        const dest = { pile: 'foundation', index };
        if (this.canMove(id, dest)) return { id, dest };
      }
    }

    // Tableau moves that uncover a hidden card or empty a column.
    for (let c = 0; c < 7; c++) {
      const col = s.tableau[c];
      const first = col.findIndex((id) => s.up[id]);
      if (first < 0) continue;
      const id = col[first];
      for (let index = 0; index < 7; index++) {
        const dest = { pile: 'tableau', index };
        if (!this.canMove(id, dest)) continue;
        if (first === 0 && s.tableau[index].length === 0) continue; // king to empty, no gain
        return { id, dest };
      }
    }

    if (s.waste.length) {
      const id = s.waste[s.waste.length - 1];
      for (let index = 0; index < 7; index++) {
        const dest = { pile: 'tableau', index };
        if (this.canMove(id, dest)) return { id, dest };
      }
    }

    // Tableau moves between face-up cards that are at least not pointless.
    for (let c = 0; c < 7; c++) {
      const col = s.tableau[c];
      const first = col.findIndex((id) => s.up[id]);
      if (first < 0) continue;
      for (let pos = first + 1; pos < col.length; pos++) {
        const id = col[pos];
        for (let index = 0; index < 7; index++) {
          if (s.tableau[index].length === 0) continue;
          const dest = { pile: 'tableau', index };
          if (this.canMove(id, dest)) return { id, dest };
        }
      }
    }

    if (s.stock.length > 0 || s.waste.length > 0) return { draw: true };
    return null;
  }

  // ---- dead-end detection --------------------------------------------------

  #fitsFoundation(id) {
    return this.state.foundations.some((pile) => {
      if (pile.length === 0) return rankOf(id) === 1;
      const top = pile[pile.length - 1];
      return suitOf(top) === suitOf(id) && rankOf(top) + 1 === rankOf(id);
    });
  }

  #fitsOn(id, pile) {
    if (pile.length === 0) return rankOf(id) === 13;
    const top = pile[pile.length - 1];
    return this.state.up[top] && isRed(top) !== isRed(id) && rankOf(top) === rankOf(id) + 1;
  }

  /**
   * Is there a move on the table right now (ignoring the stock) that gets somewhere?
   * Shuffling a card between two equal columns doesn't count.
   */
  hasProductiveMove() {
    const s = this.state;
    const wasteTop = s.waste[s.waste.length - 1];
    if (wasteTop !== undefined && (this.#fitsFoundation(wasteTop) || s.tableau.some((p) => this.#fitsOn(wasteTop, p)))) {
      return true;
    }
    for (let c = 0; c < 7; c++) {
      const col = s.tableau[c];
      if (!col.length) continue;
      if (this.#fitsFoundation(col[col.length - 1])) return true;
      const first = col.findIndex((id) => s.up[id]);
      for (let pos = first; pos < col.length; pos++) {
        for (let d = 0; d < 7; d++) {
          if (d === c || !this.#fitsOn(col[pos], s.tableau[d])) continue;
          if (pos === first) {
            if (first > 0) return true; // uncovers a hidden card
            if (s.tableau[d].length > 0) return true; // empties a column
          } else if (this.#fitsFoundation(col[pos - 1])) {
            return true; // exposes a card that can go home
          }
        }
      }
    }
    return false;
  }

  /**
   * True when nothing useful can be done any more: no productive move on the table, and no card
   * that turns up on the waste (however many times the stock is cycled) opens one.
   */
  isStuck() {
    if (this.isWon()) return false;
    const sim = new Klondike(snapshot(this.state));
    const maxRecycles = this.state.drawCount === 3 ? 3 : 1; // Draw 3 has three different groupings
    let recycles = 0;
    for (let guard = 0; guard < 400; guard++) {
      if (sim.hasProductiveMove()) return false;
      const result = sim.draw();
      if (!result) return true;
      if (result.type === 'recycle' && ++recycles > maxRecycles) return true;
    }
    return true;
  }

  /** The next card auto-complete would send to a foundation: { id, dest } | null. */
  nextAutoMove() {
    const s = this.state;
    const candidates = [];
    if (s.waste.length) candidates.push(s.waste[s.waste.length - 1]);
    for (const col of s.tableau) if (col.length) candidates.push(col[col.length - 1]);
    // Lowest rank first keeps the foundations growing evenly.
    candidates.sort((a, b) => rankOf(a) - rankOf(b));
    for (const id of candidates) {
      for (let index = 0; index < 4; index++) {
        const dest = { pile: 'foundation', index };
        if (this.canMove(id, dest)) return { id, dest };
      }
    }
    return null;
  }

  autoCompleteStep() {
    const next = this.nextAutoMove();
    return next ? this.move(next.id, next.dest) : null;
  }
}
