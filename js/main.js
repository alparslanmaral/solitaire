import { Klondike } from './core/klondike.js';
import { newSeed } from './core/rng.js';
import { cardThemes } from './cards/index.js';
import { createSettings } from './services/settings.js';
import { applyAppearance, watchAppearance } from './services/appearance.js';
import { createSound } from './services/sound.js';
import { storage } from './services/storage.js';
import { registerServiceWorker } from './services/pwa.js';
import { Board } from './ui/board.js';
import { createHud, Stopwatch } from './ui/hud.js';
import { initDialogs } from './ui/dialogs.js';
import { showToast } from './ui/toast.js';

const $ = (id) => document.getElementById(id);

// ---- services ------------------------------------------------------------------------

const settings = createSettings();
const sound = createSound(settings);

const look = () => applyAppearance(settings.get('appearance'), settings.get('background'));
look();
watchAppearance(() => ({ appearance: settings.get('appearance'), background: settings.get('background') }));
cardThemes.mountStyles();

// ---- game -------------------------------------------------------------------------------

const hud = createHud();
const stopwatch = new Stopwatch((ms) => hud.showTime(ms));
let game = null;
let winTimer = 0;

const board = new Board($('board'), {
  sound,
  onChange: handleChange,
  onWin: handleWin,
  onStuck: handleStuck,
  onMessage: (text) => showToast(text),
});
board.setCardTheme(cardThemes.get(settings.get('cardTheme')));

function save() {
  if (!game) return;
  storage.set('game', { game: game.toJSON(), elapsed: stopwatch.elapsed });
}

function handleChange() {
  hud.update(game);
  stopwatch.running = game.state.moves > 0 && !game.isWon();
  save();
}

function handleWin() {
  stopwatch.running = false;
  storage.remove('game');
  clearTimeout(winTimer);
  winTimer = setTimeout(() => {
    dialogs.showWin({ elapsed: stopwatch.elapsed, moves: game.state.moves, score: game.state.score });
  }, 1600);
}

// "No more moves" banner: shown a beat after the game runs dry, hidden as soon as it isn't true any more.
const stuckBanner = $('stuck');
let stuckTimer = 0;

function handleStuck(stuck) {
  clearTimeout(stuckTimer);
  if (!stuck) return setStuckVisible(false);
  if (stuckBanner.classList.contains('show')) return;
  stuckTimer = setTimeout(() => {
    setStuckVisible(true);
    sound.play('error');
  }, 700);
}

function setStuckVisible(visible) {
  stuckBanner.classList.toggle('show', visible);
  document.body.classList.toggle('stuck-open', visible);
}

function startGame({ seed = newSeed(), drawCount = settings.get('drawCount') } = {}) {
  clearTimeout(winTimer);
  handleStuck(false);
  dialogs.closeAll();
  game = Klondike.newGame({ seed, drawCount });
  stopwatch.set(0, false);
  return board.show(game, { deal: true });
}

function resume() {
  const saved = storage.get('game');
  if (!saved?.game?.state) return false;
  try {
    game = Klondike.fromJSON(saved.game);
    if (game.isWon()) return false;
  } catch {
    return false;
  }
  stopwatch.set(saved.elapsed ?? 0, false);
  board.show(game, { deal: false });
  return true;
}

// ---- dialogs & controls --------------------------------------------------------------------

const dialogs = initDialogs({
  settings,
  sound,
  themes: cardThemes.list(),
  onDeal: () => startGame(),
  onRestart: () => startGame({ seed: game.state.seed, drawCount: game.state.drawCount }),
  onAgain: () => startGame(),
});

const press = (id, fn) =>
  $(id).addEventListener('click', () => {
    sound.unlock();
    fn();
  });

press('btn-new', () => {
  sound.play('ui');
  dialogs.openNew();
});
press('btn-settings', () => {
  sound.play('ui');
  dialogs.openSettings();
});
press('btn-undo', () => board.undo());
press('btn-hint', () => board.hint());
press('stuck-undo', () => board.undo());
press('stuck-new', () => dialogs.openNew());

document.addEventListener('keydown', (e) => {
  if (e.metaKey || e.ctrlKey || e.altKey || document.querySelector('dialog[open]')) return;
  const key = e.key.toLowerCase();
  if (key === 'u' || key === 'z') board.undo();
  else if (key === 'h') board.hint();
  else if (key === 'n') dialogs.openNew();
  else if (key === ' ' && !e.target.closest('button')) {
    e.preventDefault();
    board.draw();
  }
});

settings.subscribe((key, value) => {
  if (key === 'appearance' || key === 'background') look();
  else if (key === 'cardTheme') board.setCardTheme(cardThemes.get(value));
});

// Keep progress safe when the tab is hidden or closed.
document.addEventListener('visibilitychange', () => document.hidden && save());
window.addEventListener('pagehide', save);

// ---- go ----------------------------------------------------------------------------------------

if (!resume()) startGame();
registerServiceWorker();
