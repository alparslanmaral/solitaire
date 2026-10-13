// The three sheets: New Game, Settings and the win screen.

import { CARDS } from '../core/cards.js';
import { BACKGROUNDS } from '../backgrounds.js';
import { installMode, promptInstall, onInstallChange } from '../services/pwa.js';
import { formatTime } from './hud.js';

const $ = (id) => document.getElementById(id);

function open(dlg) {
  if (!dlg.open) dlg.showModal();
}

function close(dlg) {
  if (!dlg.open || dlg.classList.contains('closing')) return;
  dlg.classList.add('closing');
  setTimeout(() => {
    dlg.classList.remove('closing');
    dlg.close();
  }, 200);
}

function wire(dlg) {
  dlg.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', () => close(dlg)));
  dlg.addEventListener('click', (e) => e.target === dlg && close(dlg)); // tap on the backdrop
  dlg.addEventListener('cancel', (e) => {
    e.preventDefault();
    close(dlg);
  });
}

/** A pill-shaped radio group driven by a setting. Returns a function that re-reads the setting. */
function bindSegmented(el, settings) {
  const key = el.dataset.setting;
  const buttons = [...el.querySelectorAll('button')];
  el.style.setProperty('--n', buttons.length);

  const sync = () => {
    const current = String(settings.get(key));
    buttons.forEach((b, i) => {
      const on = b.dataset.value === current;
      b.setAttribute('aria-checked', on);
      if (on) el.style.setProperty('--i', i);
    });
  };
  el.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    settings.set(key, el.dataset.type === 'number' ? Number(b.dataset.value) : b.dataset.value);
    sync();
  });
  sync();
  return sync;
}

function buildThemeGrid(grid, themes, settings) {
  const mini = (html) => `<div class="mini"><div class="card-face">${html}</div></div>`;
  const tiles = themes.map((theme) => {
    const tile = document.createElement('button');
    tile.type = 'button';
    tile.className = 'theme-tile';
    tile.setAttribute('role', 'radio');
    tile.dataset.id = theme.id;
    tile.innerHTML = `<div class="theme-preview">${mini(theme.back())}${mini(theme.face(CARDS[24]))}${mini(theme.face(CARDS[0]))}</div>`;
    const name = document.createElement('span');
    name.textContent = theme.name;
    tile.append(name);
    return tile;
  });
  grid.replaceChildren(...tiles);

  const sync = () => tiles.forEach((t) => t.setAttribute('aria-checked', t.dataset.id === settings.get('cardTheme')));
  grid.addEventListener('click', (e) => {
    const tile = e.target.closest('.theme-tile');
    if (!tile) return;
    settings.set('cardTheme', tile.dataset.id);
    sync();
  });
  sync();
  return sync;
}

function buildBackgroundGrid(grid, settings) {
  const swatches = BACKGROUNDS.map(({ id, name }) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'bg-swatch';
    btn.setAttribute('role', 'radio');
    btn.dataset.id = id;
    btn.innerHTML = '<i></i><span></span>';
    btn.firstChild.dataset.bgPreview = id;
    btn.lastChild.textContent = name;
    return btn;
  });
  grid.replaceChildren(...swatches);

  const sync = () => swatches.forEach((b) => b.setAttribute('aria-checked', b.dataset.id === settings.get('background')));
  grid.addEventListener('click', (e) => {
    const btn = e.target.closest('.bg-swatch');
    if (!btn) return;
    settings.set('background', btn.dataset.id);
    sync();
  });
  sync();
  return sync;
}

/**
 * @param {{ settings: any, themes: any[], sound: any,
 *           onDeal: () => void, onRestart: () => void, onAgain: () => void }} deps
 */
export function initDialogs({ settings, themes, sound, onDeal, onRestart, onAgain }) {
  const dlgNew = $('dlg-new');
  const dlgSettings = $('dlg-settings');
  const dlgWin = $('dlg-win');
  [dlgNew, dlgSettings, dlgWin].forEach(wire);

  const syncers = [...document.querySelectorAll('.segmented')].map((el) => bindSegmented(el, settings));
  syncers.push(buildBackgroundGrid($('bg-grid'), settings));
  syncers.push(buildThemeGrid($('theme-grid'), themes, settings));

  const soundSwitch = $('sound-switch');
  const syncSound = () => soundSwitch.setAttribute('aria-checked', settings.get('sound'));
  soundSwitch.addEventListener('click', () => {
    settings.set('sound', !settings.get('sound'));
    syncSound();
    sound.play('ui');
  });
  syncers.push(syncSound);

  const installSection = $('install-section');
  const installBtn = $('install-btn');
  const installIos = $('install-ios');
  const syncInstall = () => {
    const mode = installMode();
    installSection.hidden = !mode;
    installBtn.hidden = mode !== 'prompt';
    installIos.hidden = mode !== 'ios';
  };
  installBtn.addEventListener('click', () => promptInstall());
  onInstallChange(syncInstall);
  syncers.push(syncInstall);

  $('btn-deal').addEventListener('click', () => {
    close(dlgNew);
    onDeal();
  });
  $('btn-restart').addEventListener('click', () => {
    close(dlgNew);
    onRestart();
  });
  $('btn-again').addEventListener('click', () => {
    close(dlgWin);
    onAgain();
  });

  return {
    openNew() {
      syncers.forEach((fn) => fn());
      open(dlgNew);
    },
    openSettings() {
      syncers.forEach((fn) => fn());
      open(dlgSettings);
    },
    showWin({ elapsed, moves, score }) {
      $('win-time').textContent = formatTime(elapsed);
      $('win-moves').textContent = moves;
      $('win-score').textContent = score;
      open(dlgWin);
    },
    closeAll() {
      [dlgNew, dlgSettings, dlgWin].forEach(close);
    },
  };
}
