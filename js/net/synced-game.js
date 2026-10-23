// A Klondike game that reports what the local player does, and can be told what really happened.
//
// `undo` says who owns the undo button:
//   'local'  this copy keeps its own history (single player, and the host of a co-op game)
//   'remote' the guest of a co-op game: asks the host, which answers with a fresh state
//   'none'   head-to-head: no undo

import { Klondike } from '../core/klondike.js';

export class SyncedGame extends Klondike {
  /** Called with { k, ... } for every action the local player performs. */
  onAction = null;
  remoteCanUndo = false;
  #quiet = false;

  constructor(state, history = [], undoMode = 'local') {
    super(state, history);
    this.undoMode = undoMode;
  }

  static create({ seed, drawCount, undo = 'local' }) {
    const { state } = Klondike.newGame({ seed, drawCount });
    return new SyncedGame(state, [], undo);
  }

  move(id, dest) {
    const result = super.move(id, dest);
    if (result && !this.#quiet) this.onAction?.({ k: 'move', id, dest });
    return result;
  }

  draw() {
    const result = super.draw();
    if (result && !this.#quiet) this.onAction?.({ k: 'draw' });
    return result;
  }

  undo() {
    if (this.undoMode === 'none') return false;
    if (this.undoMode === 'remote') {
      this.onAction?.({ k: 'undo' }); // the host decides; its answer replaces our state
      return true;
    }
    const ok = super.undo();
    if (ok && !this.#quiet) this.onAction?.({ k: 'undo' });
    return ok;
  }

  get canUndo() {
    if (this.undoMode === 'none') return false;
    return this.undoMode === 'remote' ? this.remoteCanUndo : super.canUndo;
  }

  /** Apply an action that came from the other player. Returns a truthy result if it was legal. */
  applyRemote(action) {
    this.#quiet = true;
    try {
      if (action.k === 'move') return this.move(action.id, action.dest);
      if (action.k === 'draw') return this.draw();
      if (action.k === 'undo') return this.undo();
      return null;
    } finally {
      this.#quiet = false;
    }
  }

  /** Take the host's word for what the game looks like now. */
  replaceState(state, { canUndo = false } = {}) {
    this.state = state;
    this.history = [];
    this.remoteCanUndo = canUndo;
  }
}
