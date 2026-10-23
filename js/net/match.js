// The two ends of a multiplayer match. No DOM and no WebRTC in here, only a `link` (see transport.js)
// that sends and receives JSON, so all of it runs under Node tests with an in-memory link.
//
// The host is the authority (a "listen server"):
//   - it chooses the deal and tells the guest the seed,
//   - it keeps the real game (co-op) or a shadow copy of the guest's game (PvP) and replays every action
//     the guest sends, answering with the truth whenever the guest's copy disagrees,
//   - it keeps the clock, decides who won, and works out the final scores.
// The guest applies its own moves immediately so the game feels instant, and gets corrected if needed.

import { Emitter } from './emitter.js';
import { MODES, PROTOCOL_VERSION, parseAction, isValidState, cleanName, liveStats, foundationCount } from './protocol.js';
import { SyncedGame } from './synced-game.js';
import { finalScore } from '../core/scoring.js';

const PING_EVERY = 4000;
const SILENCE_LIMIT = 12000;

/** Shared plumbing: a link, heartbeat pings, and a clean way to notice the other side is gone. */
class Side extends Emitter {
  closed = false;
  #timer = 0;

  constructor({ link, heartbeat = true, now = () => Date.now() }) {
    super();
    this.link = link;
    this.now = now;
    this.lastSeen = now();
    link.onmessage = (msg) => {
      this.lastSeen = this.now();
      if (msg && typeof msg.t === 'string') this.handle(msg);
    };
    link.onclose = () => this.drop();
    if (heartbeat) {
      this.#timer = setInterval(() => {
        if (this.closed) return;
        if (this.now() - this.lastSeen > SILENCE_LIMIT) {
          this.link.close();
          this.drop();
        } else {
          this.send({ t: 'ping' });
        }
      }, PING_EVERY);
    }
  }

  send(msg) {
    if (!this.closed) this.link.send(msg);
  }

  drop() {
    if (this.closed) return;
    this.closed = true;
    clearInterval(this.#timer);
    this.onDrop();
  }

  destroy() {
    this.closed = true;
    clearInterval(this.#timer);
    this.link.onmessage = null;
    this.link.onclose = null;
    this.link.close();
  }

  handle() {}
  onDrop() {}
}

// =====================================================================================================
//  Host
// =====================================================================================================

/**
 * Events: 'guest' {name} · 'opponent' stats (PvP) · 'remote' {action, result} (co-op: the shared game
 *         changed because of the guest) · 'end' result · 'rematch' · 'closed'
 */
export class HostMatch extends Emitter {
  /** @param {{ link: any, mode: 'pvp' | 'coop', drawCount: 1 | 3, name?: string, heartbeat?: boolean, now?: () => number }} o */
  constructor({ link, mode, drawCount, name = 'Host', heartbeat = true, now = () => Date.now() }) {
    super();
    this.mode = mode;
    this.drawCount = drawCount;
    this.hostName = cleanName(name, 'Host');
    this.guestName = null;
    this.now = now;

    this.round = 0;
    this.game = null; // the host's own game (the shared game in co-op)
    this.shadow = null; // PvP: the guest's game, replayed here
    this.ended = true;
    this.startedAt = null;
    this.stuck = [false, false];
    this.contrib = [0, 0];
    this.finishedAt = [null, null];
    this.result = null;

    const side = new Side({ link, heartbeat, now });
    side.handle = (m) => this.#handle(m);
    side.onDrop = () => this.#onDrop();
    this.side = side;
  }

  get closed() {
    return this.side.closed;
  }

  /** Begin a round: build the deal from `seed`, tell the guest, and return the host's game. */
  startRound(seed) {
    this.round++;
    this.seed = seed;
    this.ended = false;
    this.result = null;
    this.startedAt = null;
    this.stuck = [false, false];
    this.contrib = [0, 0];
    this.finishedAt = [null, null];

    const undo = this.mode === MODES.PVP ? 'none' : 'local';
    this.game = SyncedGame.create({ seed, drawCount: this.drawCount, undo });
    this.game.onAction = (a) => this.#hostAction(a);
    this.shadow = this.mode === MODES.PVP ? SyncedGame.create({ seed, drawCount: this.drawCount, undo: 'none' }) : null;

    this.side.send({ t: 'start', round: this.round, seed, drawCount: this.drawCount, mode: this.mode, host: this.hostName, guest: this.guestName });
    if (this.mode === MODES.PVP) this.#sendOpponent();
    return this.game;
  }

  /** The clock starts when the countdown ends. */
  beginClock() {
    this.startedAt = this.now();
  }

  elapsed() {
    return this.startedAt === null ? 0 : (this.now() - this.startedAt) / 1000;
  }

  /** Numbers for player 0 (host) or 1 (guest). */
  stats(player) {
    const name = player === 0 ? this.hostName : this.guestName;
    if (this.mode === MODES.COOP) return { ...liveStats(name, this.game.state), moves: this.contrib[player] };
    return liveStats(name, (player === 0 ? this.game : this.shadow).state);
  }

  setStuck(stuck) {
    this.#setStuck(0, stuck);
  }

  resign() {
    this.#resign(0);
  }

  destroy() {
    this.side.destroy();
  }

  // ---- incoming ---------------------------------------------------------------------------------

  #handle(m) {
    switch (m.t) {
      case 'hello':
        return this.#hello(m);
      case 'act':
        return this.#guestAct(m);
      case 'stuck':
        return this.#setStuck(1, m.v === true);
      case 'resign':
        return this.#resign(1);
      case 'rematch':
        return this.emit('rematch');
    }
  }

  #hello(m) {
    if (m.v !== PROTOCOL_VERSION) {
      this.side.send({ t: 'reject', reason: 'version' });
      return;
    }
    let name = cleanName(m.name, 'Guest');
    if (name === this.hostName) name = `${name} (2)`;
    this.guestName = name;
    this.side.send({ t: 'welcome', mode: this.mode, drawCount: this.drawCount, host: this.hostName, guest: name });
    this.emit('guest', { name });
  }

  #guestAct(m) {
    const action = parseAction(m.a);
    if (!this.game || this.ended || this.startedAt === null || !action) return this.#correct();

    if (this.mode === MODES.PVP) {
      if (!this.shadow.applyRemote(action)) return this.#correct();
      this.emit('opponent', this.stats(1));
      if (this.shadow.isWon()) {
        this.finishedAt[1] = this.elapsed();
        this.#finish({ winner: 1, reason: 'cleared' });
      }
      return;
    }

    if (!this.game.applyRemote(action)) return this.#correct();
    if (action.k !== 'undo') this.contrib[1]++;
    this.#sendSync();
    this.emit('remote', { action });
    if (this.game.isWon()) this.#won();
  }

  /** The guest did something the real game does not allow: send it the truth. */
  #correct() {
    if (!this.game) return;
    if (this.mode === MODES.PVP) this.side.send({ t: 'resync', state: this.shadow.state });
    else this.#sendSync({ reject: true });
  }

  #setStuck(player, stuck) {
    if (this.ended || this.mode !== MODES.PVP) return;
    this.stuck[player] = stuck;
    if (this.stuck[0] && this.stuck[1]) this.#finishByScore('stuck');
  }

  #resign(player) {
    if (this.ended || !this.game) return;
    if (this.mode === MODES.PVP) this.#finish({ winner: 1 - player, reason: 'resign' });
    else this.#finish({ winner: -1, reason: 'resign' });
  }

  // ---- outgoing ---------------------------------------------------------------------------------

  /** The host's own player did something. */
  #hostAction(a) {
    if (this.ended) return;
    if (this.mode === MODES.PVP) {
      this.#sendOpponent();
      if (this.game.isWon()) {
        this.finishedAt[0] = this.elapsed();
        this.#finish({ winner: 0, reason: 'cleared' });
      }
      return;
    }
    if (a.k !== 'undo') this.contrib[0]++;
    this.#sendSync();
    if (this.game.isWon()) this.#won();
  }

  #sendOpponent() {
    this.side.send({ t: 'opp', ...this.stats(0) });
  }

  #sendSync({ reject = false } = {}) {
    this.side.send({ t: 'sync', state: this.game.state, canUndo: this.game.canUndo, contrib: this.contrib, reject });
  }

  // ---- the end of a round -----------------------------------------------------------------------

  #won() {
    this.finishedAt[0] = this.finishedAt[1] = this.elapsed();
    this.#finish({ winner: -1, reason: 'cleared' });
  }

  #finishByScore(reason) {
    const [a, b] = [this.game.state.score, this.shadow.state.score];
    this.#finish({ winner: a === b ? -1 : a > b ? 0 : 1, reason });
  }

  #tally(game, name, finishedAt, seconds) {
    const finished = game.isWon();
    const secs = finished ? finishedAt ?? seconds : seconds;
    const { state } = game;
    const base = { name, seconds: secs, moves: state.moves, found: foundationCount(state), bestStreak: state.bestStreak ?? 0, finished };
    return finished
      ? { ...base, ...finalScore({ score: state.score, moves: state.moves, seconds: secs }) }
      : { ...base, score: state.score, timeBonus: 0, moveBonus: 0, total: state.score };
  }

  #finish({ winner, reason }, { notify = true } = {}) {
    if (this.ended) return;
    this.ended = true;
    const seconds = this.elapsed();
    const pvp = this.mode === MODES.PVP;

    const result = {
      mode: this.mode,
      round: this.round,
      winner,
      reason,
      seconds,
      players: pvp
        ? [this.#tally(this.game, this.hostName, this.finishedAt[0], seconds), this.#tally(this.shadow, this.guestName, this.finishedAt[1], seconds)]
        : [this.#tally(this.game, 'Team', this.finishedAt[0], seconds)],
      contrib: pvp ? null : [{ name: this.hostName, moves: this.contrib[0] }, { name: this.guestName, moves: this.contrib[1] }],
    };
    this.result = result;
    if (notify) this.side.send({ t: 'end', result });
    this.emit('end', result);
  }

  #onDrop() {
    if (!this.ended && this.game) {
      this.#finish({ winner: this.mode === MODES.PVP ? 0 : -1, reason: 'left' }, { notify: false });
    }
    this.emit('closed');
  }
}

// =====================================================================================================
//  Guest
// =====================================================================================================

/**
 * Events: 'welcome' {mode, drawCount, host} · 'rejected' reason · 'start' {game, mode, seed, drawCount, round, host}
 *         'opponent' stats (PvP) · 'sync' {reject, contrib} (the game changed under us) · 'end' result · 'closed'
 */
export class GuestMatch extends Emitter {
  /** @param {{ link: any, name?: string, heartbeat?: boolean, now?: () => number }} o */
  constructor({ link, name = 'Guest', heartbeat = true, now = () => Date.now() }) {
    super();
    this.name = cleanName(name, 'Guest');
    this.hostName = null;
    this.mode = null;
    this.drawCount = 1;
    this.game = null;
    this.ended = true;

    const side = new Side({ link, heartbeat, now });
    side.handle = (m) => this.#handle(m);
    side.onDrop = () => this.emit('closed');
    this.side = side;
  }

  get closed() {
    return this.side.closed;
  }

  hello() {
    this.side.send({ t: 'hello', v: PROTOCOL_VERSION, name: this.name });
  }

  setStuck(stuck) {
    this.side.send({ t: 'stuck', v: stuck });
  }

  resign() {
    this.side.send({ t: 'resign' });
  }

  requestRematch() {
    this.side.send({ t: 'rematch' });
  }

  destroy() {
    this.side.destroy();
  }

  #handle(m) {
    switch (m.t) {
      case 'welcome':
        this.mode = m.mode;
        this.drawCount = m.drawCount;
        this.hostName = cleanName(m.host, 'Host');
        if (typeof m.guest === 'string') this.name = m.guest;
        return this.emit('welcome', { mode: this.mode, drawCount: this.drawCount, host: this.hostName });
      case 'reject':
        return this.emit('rejected', m.reason);
      case 'start':
        return this.#start(m);
      case 'opp':
        return this.emit('opponent', { name: cleanName(m.name, this.hostName ?? 'Host'), score: m.score, moves: m.moves, streak: m.streak, found: m.found });
      case 'sync':
        return this.#sync(m);
      case 'resync':
        if (this.game && isValidState(m.state)) {
          this.game.replaceState(m.state);
          this.emit('sync', { reject: true });
        }
        return;
      case 'end':
        this.ended = true;
        return this.emit('end', m.result);
    }
  }

  #start(m) {
    if (![MODES.PVP, MODES.COOP].includes(m.mode) || !Number.isInteger(m.seed) || ![1, 3].includes(m.drawCount)) return;
    this.mode = m.mode;
    this.drawCount = m.drawCount;
    this.ended = false;
    if (typeof m.host === 'string') this.hostName = cleanName(m.host, 'Host');
    this.game = SyncedGame.create({ seed: m.seed, drawCount: m.drawCount, undo: m.mode === MODES.PVP ? 'none' : 'remote' });
    this.game.onAction = (a) => this.side.send({ t: 'act', a });
    this.emit('start', { game: this.game, mode: this.mode, seed: m.seed, drawCount: m.drawCount, round: m.round, host: this.hostName });
  }

  #sync(m) {
    if (!this.game || !isValidState(m.state)) return;
    this.game.replaceState(m.state, { canUndo: m.canUndo === true });
    this.emit('sync', { reject: m.reject === true, contrib: Array.isArray(m.contrib) ? m.contrib : [0, 0] });
  }
}
