// The playing surface: lays cards out, animates them, and turns pointer input into game moves.
//
// Every card is a persistent DOM element that is only ever moved with `transform`, so all
// motion (dealing, moving, flipping, undoing) is a CSS transition between two layouts.

import { CARDS } from '../core/cards.js';

const CARD_RATIO = 1.4;
const MAX_CARD_W = 132;
const DRAG_THRESHOLD = 6;
const FOUNDATION_COL = 3; // foundations sit in columns 3..6 of the top row

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

const RECYCLE_ICON =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M8 16H3v5"/></svg>';

export class Board {
  /**
   * @param {HTMLElement} el
   * @param {{ sound: any, onChange: (result?: object) => void, onWin: () => void, onStuck: (stuck: boolean) => void, onMessage: (text: string) => void }} hooks
   */
  constructor(el, { sound, onChange, onWin, onStuck, onMessage }) {
    this.el = el;
    this.sound = sound;
    this.hooks = { onChange, onWin, onStuck, onMessage };
    this.game = null;
    this.theme = null;
    this.locked = false; // busy with an animation of our own
    this.frozen = false; // held still from outside (countdown, end of a match)
    this.autoplay = true; // run auto-complete after the final cards are exposed
    this.run = 0; // bumps whenever a long animation must stop (new game, ...)
    this.press = null;
    this.drag = null;
    this.hintTimer = 0;
    this.L = null;
    this.pos = [];

    this.#build();
    new ResizeObserver(() => this.#onResize()).observe(el);
    el.addEventListener('pointerdown', (e) => this.#onPointerDown(e));
    el.addEventListener('pointermove', (e) => this.#onPointerMove(e));
    el.addEventListener('pointerup', (e) => this.#onPointerUp(e));
    el.addEventListener('pointercancel', () => this.#cancelPress());
    el.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  // ---- setup ---------------------------------------------------------------

  #build() {
    const frag = document.createDocumentFragment();
    const slot = (className, pile, index = 0, content = '') => {
      const s = document.createElement('div');
      s.className = `slot ${className}`;
      s.dataset.pile = pile;
      s.dataset.index = index;
      s.innerHTML = content;
      frag.append(s);
      return s;
    };
    this.slots = {
      stock: slot('slot-stock', 'stock', 0, RECYCLE_ICON),
      waste: slot('slot-waste', 'waste'),
      foundation: [0, 1, 2, 3].map((i) => slot('slot-foundation', 'foundation', i, '<b>A</b>')),
      tableau: [0, 1, 2, 3, 4, 5, 6].map((i) => slot('slot-tableau', 'tableau', i, '<b>K</b>')),
    };

    this.cards = CARDS.map((info) => {
      const card = document.createElement('div');
      card.className = 'card';
      card.dataset.id = info.id;
      card.setAttribute('role', 'img');
      card.innerHTML = '<div class="card-inner"><div class="card-face card-front"></div><div class="card-face card-back"></div></div>';
      card._front = card.querySelector('.card-front');
      card._back = card.querySelector('.card-back');
      card._inner = card.querySelector('.card-inner');
      frag.append(card);
      return card;
    });
    this.el.append(frag);
  }

  setCardTheme(theme) {
    this.theme = theme;
    this.el.dataset.cardTheme = theme.id;
    for (const card of this.cards) {
      const info = CARDS[card.dataset.id];
      card._front.innerHTML = theme.face(info);
      card._back.innerHTML = theme.back();
    }
  }

  // ---- layout ----------------------------------------------------------------

  #measure() {
    const W = this.el.clientWidth;
    const H = this.el.clientHeight;
    const gap = W < 480 ? 5 : W < 900 ? 10 : 14;
    const sidePad = W < 480 ? 6 : 10;
    const byWidth = (W - 2 * sidePad - 6 * gap) / 7;
    const byHeight = H / 4.2 / CARD_RATIO;
    const cardW = Math.max(28, Math.floor(Math.min(byWidth, byHeight, MAX_CARD_W)));
    const cardH = Math.round(cardW * CARD_RATIO);
    const padX = Math.round((W - (7 * cardW + 6 * gap)) / 2);
    const topY = 4;
    const tabY = topY + cardH + Math.max(10, Math.round(cardH * 0.17));
    const availTab = H - tabY - 4;
    // On tall screens there is room to fan the columns out further, which makes ranks easier to read.
    const roomy = clamp((availTab / cardH - 4.5) / 3, 0, 1);
    this.L = {
      W, H, gap, cardW, cardH, padX, topY, tabY, availTab,
      fanDown: Math.max(5, Math.round(cardH * (0.1 + 0.04 * roomy))),
      fanUp: Math.round(cardH * (0.3 + 0.14 * roomy)),
      wasteFan: Math.round(cardW * 0.22),
    };

    const { style } = this.el;
    style.setProperty('--cw', `${cardW}px`);
    style.setProperty('--ch', `${cardH}px`);
    style.setProperty('--cr', `${Math.round(cardW * 0.085)}px`);

    const place = (slot, x, y) => (slot.style.transform = `translate3d(${x}px, ${y}px, 0)`);
    place(this.slots.stock, this.#colX(0), topY);
    place(this.slots.waste, this.#colX(1), topY);
    this.slots.foundation.forEach((s, i) => place(s, this.#colX(FOUNDATION_COL + i), topY));
    this.slots.tableau.forEach((s, i) => place(s, this.#colX(i), tabY));
  }

  #colX(col) {
    return this.L.padX + col * (this.L.cardW + this.L.gap);
  }

  /** Target { x, y, z, up } of every card for the current game state. */
  #computePositions() {
    const { state } = this.game;
    const { cardH, topY, tabY, availTab, fanDown, fanUp, wasteFan } = this.L;
    const pos = new Array(52);

    state.stock.forEach((id, i) => (pos[id] = { x: this.#colX(0), y: topY, z: i + 1 }));

    const fanned = state.drawCount === 3 ? 3 : 1;
    const n = state.waste.length;
    state.waste.forEach((id, i) => {
      const k = i - (n - fanned);
      pos[id] = { x: this.#colX(1) + (k > 0 ? k * wasteFan : 0), y: topY, z: i + 1 };
    });

    state.foundations.forEach((pile, f) => {
      pile.forEach((id, i) => (pos[id] = { x: this.#colX(FOUNDATION_COL + f), y: topY, z: i + 1 }));
    });

    state.tableau.forEach((col, c) => {
      const ys = [];
      let y = 0;
      for (const id of col) {
        ys.push(y);
        y += state.up[id] ? fanUp : fanDown;
      }
      const last = ys[ys.length - 1] ?? 0;
      const room = availTab - cardH;
      const scale = last > room ? Math.max(0.42, room / last) : 1;
      col.forEach((id, i) => (pos[id] = { x: this.#colX(c), y: tabY + Math.round(ys[i] * scale), z: i + 1 }));
    });

    return pos;
  }

  /** Move every card element to where the state says it belongs. */
  #render({ delays } = {}) {
    let movedCards = 0;
    this.pos = this.#computePositions();
    const { up, stock, waste, foundations } = this.game.state;

    // Piles that sit squarely on top of each other would stack their shadows into a black smudge,
    // so only the top couple of cards in each keep one.
    const buried = new Set();
    for (const pile of [stock, waste, ...foundations]) pile.slice(0, -2).forEach((id) => buried.add(id));

    CARDS.forEach((info, id) => {
      const card = this.cards[id];
      const p = this.pos[id];
      card.classList.toggle('buried', buried.has(id));
      const moved = card._x !== p.x || card._y !== p.y;
      if (moved) movedCards++;
      card._x = p.x;
      card._y = p.y;
      card._z = p.z;
      card.style.transform = `translate3d(${p.x}px, ${p.y}px, 0)`;

      if (moved) {
        // Travelling cards float above everything until they land.
        card.style.zIndex = 500 + p.z;
        card._floating = true;
        clearTimeout(card._zTimer);
        card._zTimer = setTimeout(() => {
          card._floating = false;
          card.style.zIndex = card._z;
        }, 460);
      } else if (!card._floating) {
        card.style.zIndex = p.z;
      }

      if (card._up !== up[id]) {
        card._up = up[id];
        card.classList.toggle('up', up[id]);
        card.setAttribute('aria-label', up[id] ? info.name : 'Face-down card');
      }

      const d = delays?.get(id);
      card.style.transitionDelay = d ? `${d.move}ms` : '';
      card._inner.style.transitionDelay = d ? `${d.flip}ms` : '';
    });
    return movedCards;
  }

  #onResize() {
    if (!this.game || this.el.clientWidth === 0) return;
    this.#measure();
    this.el.classList.add('no-anim');
    this.#render();
    requestAnimationFrame(() => requestAnimationFrame(() => this.el.classList.remove('no-anim')));
  }

  // ---- game lifecycle -----------------------------------------------------------

  /** Show a game. With `deal: true` the cards are dealt out with an animation. */
  async show(game, { deal = false } = {}) {
    this.run++;
    const run = this.run;
    this.game = game;
    this.#clearHint();
    this.#cancelPress();
    this.#resetCards();
    this.#measure();

    if (!deal) {
      this.locked = false;
      this.el.classList.add('no-anim');
      this.#render();
      void this.el.offsetWidth;
      this.el.classList.remove('no-anim');
      this.hooks.onChange();
      this.#reportStuck();
      return;
    }

    this.hooks.onStuck(false);
    this.locked = true;
    // Stage: the whole deck face down on the stock pile, no transitions.
    this.el.classList.add('no-anim');
    const stagePos = this.#computePositions();
    this.cards.forEach((card, id) => {
      card.classList.remove('up');
      card._up = false;
      card.style.transform = `translate3d(${this.#colX(0)}px, ${this.L.topY}px, 0)`;
      card.style.zIndex = stagePos[id].z;
      card._x = this.#colX(0);
      card._y = this.L.topY;
    });
    void this.el.offsetWidth;
    this.el.classList.remove('no-anim');

    // Deal row by row, like at a real table.
    const STEP = 55;
    const delays = new Map();
    let n = 0;
    const { tableau } = game.state;
    for (let row = 0; row < 7; row++) {
      for (let col = row; col < 7; col++) {
        delays.set(tableau[col][row], { move: n * STEP, flip: n * STEP + 260 });
        this.sound.play('deal', { at: (n * STEP) / 1000 });
        n++;
      }
    }
    this.#render({ delays });
    this.hooks.onChange();

    await wait(n * STEP + 700);
    if (run !== this.run) return;
    this.cards.forEach((card) => {
      card.style.transitionDelay = '';
      card._inner.style.transitionDelay = '';
    });
    this.locked = false;
    this.#reportStuck();
  }

  #resetCards() {
    for (const card of this.cards) {
      card.classList.remove('flying', 'dragging', 'hint', 'hint-target', 'drop-glow', 'shake');
      card.style.visibility = '';
      card.style.transitionDelay = '';
      card._inner.style.transitionDelay = '';
    }
  }

  // ---- actions ---------------------------------------------------------------------

  /** Called after any change to the game: re-layout, play sounds, check for the end. */
  #afterAction(result) {
    this.#clearHint();
    this.#render();

    if (result.type === 'move') {
      this.sound.play(result.toFoundation ? 'foundation' : 'place');
      if (result.flipped !== null) setTimeout(() => this.sound.play('flip'), 140);
    } else if (result.type === 'draw') {
      this.sound.play('draw');
    } else if (result.type === 'recycle') {
      this.sound.play('recycle');
    }

    this.hooks.onChange(result);

    if (this.game.isWon()) this.#celebrate();
    else if (this.autoplay && this.game.canAutoComplete() && this.game.nextAutoMove()) this.#autoComplete();
    else this.#reportStuck();
  }

  /** Tell the page whether the game has run out of useful moves. */
  #reportStuck() {
    this.hooks.onStuck(this.game.isStuck());
  }

  get #busy() {
    return this.locked || this.frozen;
  }

  draw() {
    if (this.#busy) return;
    const result = this.game.draw();
    if (result) this.#afterAction(result);
    else this.sound.play('error');
  }

  undo() {
    if (this.#busy || !this.game.undo()) return false;
    this.#clearHint();
    this.#render();
    this.sound.play('undo');
    this.hooks.onChange();
    this.#reportStuck();
    return true;
  }

  /** Hold the table still (countdown, end of a match). Anything in the player's hand is put back. */
  freeze(on) {
    this.frozen = on;
    if (on) this.#cancelPress();
  }

  /**
   * The game was changed from outside (the other player moved, or the host corrected us): show it.
   * Whatever the player was dragging is put back first, since the cards may no longer be where it was.
   */
  sync() {
    if (!this.game) return;
    this.#cancelPress();
    this.#clearHint();
    const moved = this.#render();
    if (moved) this.sound.play('place');
    this.hooks.onChange();
    if (this.game.isWon()) this.#celebrate();
    else this.#reportStuck();
  }

  hint() {
    if (this.#busy) return;
    this.#clearHint();
    const hint = this.game.hint();
    if (!hint || (hint.draw && this.game.isStuck())) {
      this.hooks.onMessage('No moves left. Try undo, or start a new game.');
      this.sound.play('error');
      return;
    }
    this.sound.play('hint');
    if (hint.draw) {
      const { stock } = this.game.state;
      if (stock.length) this.cards[stock[stock.length - 1]].classList.add('hint');
      else this.slots.stock.classList.add('hint-target');
      this.hooks.onMessage(stock.length ? 'Try drawing a card.' : 'Turn the waste back over.');
    } else {
      for (const id of this.game.sequenceFrom(hint.id)) this.cards[id].classList.add('hint');
      this.#destElement(hint.dest).classList.add('hint-target');
    }
    this.hintTimer = setTimeout(() => this.#clearHint(), 2200);
  }

  #clearHint() {
    clearTimeout(this.hintTimer);
    this.el.querySelectorAll('.hint, .hint-target').forEach((n) => n.classList.remove('hint', 'hint-target'));
  }

  /** The element that represents a destination: its top card, or the empty slot. */
  #destElement(dest) {
    const pile = dest.pile === 'foundation' ? this.game.state.foundations[dest.index] : this.game.state.tableau[dest.index];
    return pile.length ? this.cards[pile[pile.length - 1]] : this.slots[dest.pile][dest.index];
  }

  #tapCard(id) {
    const { state } = this.game;
    const loc = this.game.locate(id);
    if (loc.pile === 'stock') return this.draw();
    if (!state.up[id] || loc.pile === 'foundation') return;
    const dest = this.game.autoTarget(id);
    if (!dest) return this.#shake(id);
    this.#afterAction(this.game.move(id, dest));
  }

  #shake(id) {
    const card = this.cards[id];
    card.classList.remove('shake');
    void card.offsetWidth;
    card.classList.add('shake');
    this.sound.play('error');
  }

  async #autoComplete() {
    if (!this.game.nextAutoMove()) return;
    const run = this.run;
    this.locked = true;
    await wait(350);
    while (run === this.run) {
      const result = this.game.autoCompleteStep();
      if (!result) break;
      this.#render();
      this.sound.play('foundation');
      this.hooks.onChange(result);
      await wait(120);
    }
    if (run !== this.run) return;
    this.locked = false;
    if (this.game.isWon()) this.#celebrate();
    else this.#reportStuck();
  }

  /** Cards bounce off the table, one after another, king first. */
  #celebrate() {
    const run = this.run;
    this.locked = true;
    this.sound.play('win');
    this.hooks.onWin();

    const { foundations } = this.game.state;
    const flyers = [];
    for (let rank = 12; rank >= 0; rank--) {
      for (let f = 0; f < 4; f++) {
        const id = foundations[f][rank];
        if (id === undefined) continue;
        const dir = Math.random() < 0.5 ? -1 : 1;
        flyers.push({
          card: this.cards[id],
          x: this.pos[id].x,
          y: this.pos[id].y,
          vx: dir * (2.5 + Math.random() * 6),
          vy: -(3 + Math.random() * 9),
          startAt: flyers.length * 130,
          started: false,
          done: false,
        });
      }
    }

    const { W, H, cardW, cardH } = this.L;
    const gravity = Math.max(0.5, H / 900);
    const t0 = performance.now();
    let last = t0;
    const frame = (now) => {
      if (run !== this.run) return;
      const dt = Math.min(2, (now - last) / 16.67);
      last = now;
      let alive = 0;
      flyers.forEach((f, i) => {
        if (f.done) return;
        alive++;
        if (now - t0 < f.startAt) return;
        if (!f.started) {
          f.started = true;
          f.card.classList.add('flying');
          f.card.style.zIndex = 2000 + i;
        }
        f.vy += gravity * dt;
        f.x += f.vx * dt;
        f.y += f.vy * dt;
        if (f.y + cardH > H) {
          f.y = H - cardH;
          f.vy *= -0.74;
        }
        if (f.x < -cardW * 1.2 || f.x > W + cardW * 0.2) {
          f.done = true;
          f.card.style.visibility = 'hidden';
        }
        f.card.style.transform = `translate3d(${f.x}px, ${f.y}px, 0)`;
      });
      if (alive) requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  }

  // ---- pointer input ---------------------------------------------------------------

  #onPointerDown(e) {
    if (this.#busy || this.press) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    this.sound.unlock();

    const cardEl = e.target.closest('.card');
    const slotEl = e.target.closest('.slot');
    if (cardEl) this.press = { id: +cardEl.dataset.id };
    else if (slotEl?.dataset.pile === 'stock') this.press = { stock: true };
    else return;

    Object.assign(this.press, { x: e.clientX, y: e.clientY, pointerId: e.pointerId });
    this.el.setPointerCapture(e.pointerId);
  }

  #onPointerMove(e) {
    const press = this.press;
    if (!press || press.pointerId !== e.pointerId) return;
    const dx = e.clientX - press.x;
    const dy = e.clientY - press.y;

    if (!this.drag) {
      if (press.stock || Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
      if (!this.game.isMovable(press.id)) return;
      this.#startDrag(press.id);
    }
    this.#moveDrag(dx, dy);
  }

  #onPointerUp(e) {
    const press = this.press;
    if (!press || press.pointerId !== e.pointerId) return;
    this.press = null;
    if (this.el.hasPointerCapture(e.pointerId)) this.el.releasePointerCapture(e.pointerId);

    if (this.drag) return this.#endDrag();
    if (this.#busy) return;
    if (press.stock) this.draw();
    else this.#tapCard(press.id);
  }

  #cancelPress() {
    if (this.drag) this.#endDrag({ cancelled: true });
    this.press = null;
  }

  #startDrag(id) {
    const ids = this.game.sequenceFrom(id);
    this.drag = { ids, base: ids.map((cid) => ({ x: this.pos[cid].x, y: this.pos[cid].y })), dx: 0, dy: 0, target: null };
    ids.forEach((cid, i) => {
      const card = this.cards[cid];
      card.classList.add('dragging');
      card.style.zIndex = 1000 + i;
    });
    this.sound.play('pick');
  }

  #moveDrag(dx, dy) {
    const drag = this.drag;
    drag.dx = dx;
    drag.dy = dy;
    drag.ids.forEach((cid, i) => {
      this.cards[cid].style.transform = `translate3d(${drag.base[i].x + dx}px, ${drag.base[i].y + dy}px, 0)`;
    });
    this.#setDropTarget(this.#findDropTarget());
  }

  #endDrag({ cancelled = false } = {}) {
    const drag = this.drag;
    this.press = null;
    const dest = cancelled ? null : this.#findDropTarget(drag);
    this.drag = null;
    this.#setDropTarget(null);
    for (const cid of drag.ids) {
      const card = this.cards[cid];
      card.classList.remove('dragging');
      card.style.zIndex = card._z;
    }

    const result = dest && this.game.move(drag.ids[0], dest);
    if (result) this.#afterAction(result);
    else this.#render(); // glide back
  }

  /** The legal destination whose area overlaps the dragged cards the most. */
  #findDropTarget(drag = this.drag) {
    const { cardW, cardH, tabY, topY, H } = this.L;
    const id = drag.ids[0];
    const rect = { x: drag.base[0].x + drag.dx, y: drag.base[0].y + drag.dy, w: cardW, h: cardH };

    const candidates = [];
    if (drag.ids.length === 1) {
      for (let f = 0; f < 4; f++) {
        candidates.push({ dest: { pile: 'foundation', index: f }, x: this.#colX(FOUNDATION_COL + f), y: topY, h: cardH });
      }
    }
    // A tableau column accepts a drop anywhere along its full height, not just on its cards.
    for (let c = 0; c < 7; c++) {
      candidates.push({ dest: { pile: 'tableau', index: c }, x: this.#colX(c), y: tabY, h: Math.max(cardH, H - tabY) });
    }

    let best = null;
    let bestArea = cardW * cardH * 0.1;
    for (const c of candidates) {
      const w = Math.min(rect.x + rect.w, c.x + cardW) - Math.max(rect.x, c.x);
      const h = Math.min(rect.y + rect.h, c.y + c.h) - Math.max(rect.y, c.y);
      if (w <= 0 || h <= 0 || w * h <= bestArea) continue;
      if (!this.game.canMove(id, c.dest)) continue;
      best = c.dest;
      bestArea = w * h;
    }
    return best;
  }

  #setDropTarget(dest) {
    const drag = this.drag;
    const same = drag?.target && dest && drag.target.pile === dest.pile && drag.target.index === dest.index;
    if (same) return;
    this.el.querySelectorAll('.drop-glow').forEach((n) => n.classList.remove('drop-glow'));
    if (drag) drag.target = dest;
    if (dest) this.#destElement(dest).classList.add('drop-glow');
  }
}
