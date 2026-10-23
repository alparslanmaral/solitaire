import { Klondike } from './core/klondike.js';
import { newSeed } from './core/rng.js';
import { finalScore } from './core/scoring.js';
import { findWinnableSeed } from './core/winnable.js';
import { cardThemes } from './cards/index.js';
import { createSettings } from './services/settings.js';
import { applyAppearance, watchAppearance } from './services/appearance.js';
import { createSound } from './services/sound.js';
import { storage } from './services/storage.js';
import { registerServiceWorker } from './services/pwa.js';
import { MODES } from './net/protocol.js';
import { Board } from './ui/board.js';
import { createHud, Stopwatch } from './ui/hud.js';
import { initDialogs, openDialog, closeDialog, wireDialog } from './ui/dialogs.js';
import { initMultiplayer } from './ui/multiplayer.js';
import { showResult, closeResult, setResultExtra } from './ui/results.js';
import { showToast } from './ui/toast.js';

const $ = (id) => document.getElementById(id);
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// ---- services ------------------------------------------------------------------------

const settings = createSettings();
const sound = createSound(settings);

const look = () => applyAppearance(settings.get('appearance'), settings.get('background'));
look();
watchAppearance(() => ({ appearance: settings.get('appearance'), background: settings.get('background') }));
cardThemes.mountStyles();

// ---- state -------------------------------------------------------------------------------

const hud = createHud();
const stopwatch = new Stopwatch((ms) => hud.showTime(ms));

let game = null; // the game on the board
let mode = null; // what the board is showing: 'single' | 'pvp' | 'coop' | null
let winTimer = 0;
let resultTimer = 0;

/** Everything about the current multiplayer match. */
const mp = {
  match: null,
  room: null, // host only: the open room (closing it drops the connection)
  role: null, // 'host' | 'guest'
  me: 0, // 0 = host, 1 = guest
  ended: true,
  token: 0, // bumps when a round starts or the match is left, so stale countdowns stop
  lastResult: null,
  nextSeed: null, // host: a winnable deal being prepared for the rematch
  abort: null,
  contrib: [0, 0],
  rematchAsked: false,
  lastStuck: false, // what the other side was last told
};

const board = new Board($('board'), {
  sound,
  onChange: handleChange,
  onWin: handleWin,
  onStuck: handleStuck,
  onMessage: (text) => showToast(text),
});
board.setCardTheme(cardThemes.get(settings.get('cardTheme')));

const setView = (view) => (document.body.dataset.view = view);

function setModeUi(next) {
  mode = next;
  document.body.dataset.mode = next ?? '';
  $('stuck-new').textContent = next === 'single' ? 'New Game' : 'Give Up';
  $('stuck-undo').hidden = next === 'pvp';
  board.autoplay = !(next === MODES.COOP && mp.role === 'guest'); // only one side runs auto-complete
  if (next === 'single' || next === null) hud.setOpponent(null);
}

// ---- reacting to the board ---------------------------------------------------------------------

function save() {
  if (mode !== 'single' || !game) return;
  storage.set('game', { game: game.toJSON(), elapsed: stopwatch.elapsed });
}

function handleChange(result) {
  if (!game) return;
  hud.update(game);
  if (mode === 'single') {
    stopwatch.running = game.state.moves > 0 && !game.isWon();
    save();
  } else {
    showPartner();
  }
  if (result?.streakBonus) {
    hud.pop(`Streak x${result.streak}  +${result.streakBonus}`);
    sound.play('streak');
  }
}

/** The strip under the status bar: the other player's numbers. */
function showPartner() {
  const { match } = mp;
  if (!match || mode === 'single' || mode === null) return;
  if (mode === MODES.COOP) {
    const name = mp.role === 'host' ? match.guestName : match.hostName;
    const moves = mp.role === 'host' ? match.contrib[1] : mp.contrib[0];
    hud.setOpponent({ name, moves }, 'coop');
  }
}

// "No more moves": shown a beat after the game runs dry, hidden as soon as it isn't true any more.
const stuckBanner = $('stuck');
let stuckTimer = 0;

function handleStuck(stuck) {
  clearTimeout(stuckTimer);
  if (mode !== 'single' && mode !== null && mp.match && mp.lastStuck !== stuck) {
    mp.lastStuck = stuck;
    mp.match.setStuck(stuck);
  }
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

// ---- single player --------------------------------------------------------------------------------

function startSingle({ seed = newSeed(), drawCount = settings.get('drawCount') } = {}) {
  clearTimeout(winTimer);
  handleStuck(false);
  dialogs.closeAll();
  closeResult();
  setModeUi('single');
  setView('game');
  game = Klondike.newGame({ seed, drawCount });
  stopwatch.set(0, false);
  board.freeze(false);
  return board.show(game, { deal: true });
}

function resumeSingle() {
  const saved = storage.get('game');
  if (!saved?.game?.state) return false;
  try {
    const restored = Klondike.fromJSON(saved.game);
    if (restored.isWon()) return false;
    game = restored;
  } catch {
    return false;
  }
  setModeUi('single');
  setView('game');
  stopwatch.set(saved.elapsed ?? 0, false);
  board.freeze(false);
  board.show(game, { deal: false });
  return true;
}

function playSingle() {
  if (mode === 'single' && game && !game.isWon()) {
    setView('game');
    stopwatch.running = game.state.moves > 0;
    return;
  }
  if (!resumeSingle()) startSingle();
}

function handleWin() {
  if (mode !== 'single') return; // matches are scored by the host and reported through the 'end' event
  stopwatch.running = false;
  storage.remove('game');
  const { state } = game;
  const seconds = stopwatch.elapsed / 1000;
  const final = finalScore({ score: state.score, moves: state.moves, seconds });
  clearTimeout(winTimer);
  winTimer = setTimeout(() => {
    showResult({
      title: 'You won!',
      subtitle: 'Every card is home. Nicely played.',
      players: [{ name: 'You', seconds, moves: state.moves, bestStreak: state.bestStreak ?? 0, finished: true, ...final }],
      actions: [
        { label: 'Play Again', primary: true, onClick: () => startSingle() },
        { label: 'Main Menu', onClick: () => (closeResult(), showMenu()) },
      ],
    });
  }, 1600);
}

// ---- main menu --------------------------------------------------------------------------------------

function showMenu() {
  if (mode === 'single') stopwatch.running = false;
  const current = mode === 'single' && game && !game.isWon() ? game.state : storage.get('game')?.game?.state;
  $('menu-single-sub').textContent = current?.moves > 0 ? `Continue · ${current.moves} moves` : 'Classic Klondike';
  setView('menu');
}

// ---- multiplayer ---------------------------------------------------------------------------------------

function attachMatch({ role, match, seed, room }) {
  dropMatch();
  Object.assign(mp, { match, room: room ?? null, role, me: role === 'host' ? 0 : 1, ended: false, contrib: [0, 0], rematchAsked: false });

  match.on('opponent', (stats) => hud.setOpponent(stats, 'pvp'));
  match.on('end', handleMatchEnd);
  match.on('closed', handleMatchClosed);

  if (role === 'host') {
    match.on('remote', () => board.sync());
    match.on('rematch', () => mp.ended && $('dlg-result').open && setResultExtra(`${match.guestName} wants a rematch`));
    startHostRound(seed);
  } else {
    match.on('start', beginRound);
    match.on('sync', (e) => {
      mp.contrib = e.contrib ?? mp.contrib;
      board.sync();
    });
  }
}

function startHostRound(seed) {
  const g = mp.match.startRound(seed);
  beginRound({ game: g, mode: mp.match.mode });
  // Line up a winnable deal for the rematch while this one is played.
  mp.abort?.abort();
  mp.abort = new AbortController();
  mp.nextSeed = findWinnableSeed({ drawCount: mp.match.drawCount, signal: mp.abort.signal });
}

async function beginRound({ game: g, mode: next }) {
  const token = ++mp.token;
  clearTimeout(winTimer);
  clearTimeout(resultTimer);
  Object.assign(mp, { ended: false, lastResult: null, rematchAsked: false, contrib: [0, 0], lastStuck: false });
  dialogs.closeAll();
  mpUi.closeDialog();
  closeResult();
  handleStuck(false);
  hud.setOpponent(null);
  game = g;
  setModeUi(next);
  setView('game');
  board.freeze(true);
  stopwatch.set(0, false);
  if (next === MODES.PVP && mp.role === 'host') hud.setOpponent(mp.match.stats(1), 'pvp');
  await board.show(g, { deal: true });
  if (token !== mp.token) return;
  showPartner();
  await countdown(token);
}

/** 3, 2, 1, Go: the table is held still until the very end, so both players start together. */
async function countdown(token) {
  const label = $('countdown').firstElementChild;
  const flash = (text) => {
    label.textContent = text;
    label.classList.remove('tick');
    void label.offsetWidth;
    label.classList.add('tick');
  };
  for (const n of ['3', '2', '1']) {
    flash(n);
    sound.play('tick');
    await wait(900);
    if (token !== mp.token) return label.classList.remove('tick');
  }
  board.freeze(false);
  stopwatch.set(0, true);
  if (mp.role === 'host') mp.match.beginClock();
  flash('Go!');
  sound.play('go');
}

function handleMatchEnd(result) {
  mp.ended = true;
  mp.lastResult = result;
  stopwatch.running = false;
  board.freeze(true);
  handleStuck(false);
  clearTimeout(resultTimer);
  resultTimer = setTimeout(presentResult, result.reason === 'cleared' ? 1800 : 400);
}

function handleMatchClosed() {
  if (!mp.match || mode === 'single' || mode === null) return;
  if (!mp.ended) {
    // The guest's side of a dropped connection: there is no verdict from the host, so show where we got to.
    mp.ended = true;
    stopwatch.running = false;
    board.freeze(true);
    handleStuck(false);
    const { state } = game;
    showResult({
      title: 'Connection lost',
      subtitle: `You and ${mp.match.hostName ?? 'the host'} got disconnected.`,
      players: [{ name: 'You', seconds: stopwatch.elapsed / 1000, moves: state.moves, bestStreak: state.bestStreak ?? 0, finished: false, score: state.score, timeBonus: 0, moveBonus: 0, total: state.score }],
      actions: [{ label: 'Main Menu', primary: true, onClick: leaveMatch }],
    });
  } else if ($('dlg-result').open) {
    presentResult(); // the other player left: no rematch any more
  }
}

/** Turn the host's verdict into the sheet each player sees. */
function presentResult() {
  const result = mp.lastResult;
  if (!result || !mp.match) return;
  const pvp = result.mode === MODES.PVP;
  const otherName = mp.role === 'host' ? mp.match.guestName : mp.match.hostName;
  const won = result.winner === mp.me;
  let title;
  let subtitle = '';
  let extra = '';

  if (pvp) {
    title = result.winner === -1 ? "It's a draw" : won ? 'You win!' : 'You lost';
    if (result.reason === 'cleared') subtitle = won ? 'You cleared the deal first.' : `${otherName} cleared the deal first.`;
    else if (result.reason === 'resign') subtitle = won ? `${otherName} gave up.` : 'You gave up.';
    else if (result.reason === 'left') subtitle = `${otherName} left the match.`;
    else subtitle = result.winner === -1 ? 'You both ran out of moves with the same score.' : 'You both ran out of moves. The higher score wins.';
  } else if (result.reason === 'cleared') {
    title = 'Solved together!';
    subtitle = 'Every card is home. Nicely done, team.';
    extra = result.contrib.map((c) => `${c.name} ${c.moves} moves`).join('  ·  ');
  } else if (result.reason === 'left') {
    title = 'Your partner left';
    subtitle = `${otherName} left the game.`;
  } else {
    title = 'Game over';
    subtitle = 'No more moves. Try a fresh deal together.';
  }

  const gone = mp.match.closed;
  const actions = gone
    ? [{ label: 'Main Menu', primary: true, onClick: leaveMatch }]
    : mp.role === 'host'
      ? [
          { label: 'Rematch', primary: true, onClick: rematch },
          { label: 'Leave Room', onClick: leaveMatch },
        ]
      : [
          { label: mp.rematchAsked ? 'Rematch requested…' : 'Ask for Rematch', primary: true, disabled: mp.rematchAsked, onClick: askRematch },
          { label: 'Leave Room', onClick: leaveMatch },
        ];

  showResult({ title, subtitle, players: result.players, winner: pvp ? result.winner : undefined, extra, actions });
}

function askRematch() {
  mp.match.requestRematch();
  mp.rematchAsked = true;
  presentResult();
  setResultExtra(`Waiting for ${mp.match.hostName} to start another round…`);
}

async function rematch() {
  closeResult();
  const seed = await (mp.nextSeed ?? findWinnableSeed({ drawCount: mp.match.drawCount }));
  if (!mp.match || mp.match.closed || seed === null) return;
  startHostRound(seed);
}

function giveUp() {
  mp.match?.resign();
}

/** Disconnect and clean up, without touching the screen. */
function dropMatch() {
  mp.token++;
  mp.abort?.abort();
  mp.abort = null;
  mp.nextSeed = null;
  clearTimeout(resultTimer);
  try {
    mp.match?.destroy();
  } catch {
    /* already gone */
  }
  mp.room?.close();
  Object.assign(mp, { match: null, room: null, ended: true, lastResult: null });
}

function leaveMatch() {
  dropMatch();
  mpUi.cancel();
  closeResult();
  dialogs.closeAll();
  handleStuck(false);
  stopwatch.running = false;
  board.freeze(false);
  hud.setOpponent(null);
  mode = null;
  document.body.dataset.mode = '';
  showMenu();
}

// ---- dialogs & controls --------------------------------------------------------------------------------------

const dialogs = initDialogs({
  settings,
  sound,
  themes: cardThemes.list(),
  onDeal: () => startSingle(),
  onRestart: () => startSingle({ seed: game.state.seed, drawCount: game.state.drawCount }),
});

const mpUi = initMultiplayer({
  settings,
  sound,
  syncControls: () => dialogs.syncAll(),
  onReady: attachMatch,
});

wireDialog($('dlg-leave'));
$('dlg-result').addEventListener('cancel', (e) => e.preventDefault()); // the result sheet only closes through its buttons

const press = (id, fn) =>
  $(id).addEventListener('click', () => {
    sound.unlock();
    fn();
  });

press('menu-single', () => {
  sound.play('ui');
  playSingle();
});
press('menu-multi', () => {
  sound.play('ui');
  mpUi.open('home');
});
press('menu-settings', () => {
  sound.play('ui');
  dialogs.openSettings();
});

press('btn-menu', () => {
  sound.play('ui');
  if (mode === 'single' || mode === null) return showMenu();
  if (mp.ended || mp.match?.closed) return leaveMatch();
  $('leave-text').textContent =
    mode === MODES.PVP
      ? 'Leaving counts as a loss. You can also give up this round and stay in the room for a rematch.'
      : 'Leaving ends the game for both of you. You can also give up this deal and try a new one together.';
  openDialog($('dlg-leave'));
});
press('leave-stay', () => closeDialog($('dlg-leave')));
press('leave-giveup', () => {
  closeDialog($('dlg-leave'));
  giveUp();
});
press('leave-leave', () => {
  closeDialog($('dlg-leave'));
  leaveMatch();
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
press('stuck-new', () => (mode === 'single' ? dialogs.openNew() : giveUp()));

document.addEventListener('keydown', (e) => {
  if (e.metaKey || e.ctrlKey || e.altKey || document.querySelector('dialog[open]') || document.body.dataset.view !== 'game') return;
  const key = e.key.toLowerCase();
  if (key === 'u' || key === 'z') board.undo();
  else if (key === 'h') board.hint();
  else if (key === 'n' && mode === 'single') dialogs.openNew();
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

// ---- go -------------------------------------------------------------------------------------------------------

showMenu();
registerServiceWorker();
document.documentElement.dataset.ready = '1'; // lets tests know the app is wired up

// An invite link (…/?room=ABCDE) opens the join sheet with the code filled in.
const invited = new URLSearchParams(location.search).get('room');
if (invited) {
  history.replaceState(null, '', location.pathname);
  mpUi.open('join', { code: invited });
}

// Handy for poking around in the console, and used by the end-to-end tests: open the game with ?debug.
if (new URLSearchParams(location.search).has('debug')) {
  window.__app = {
    get game() {
      return game;
    },
    get mode() {
      return mode;
    },
    mp,
    board,
  };
}
