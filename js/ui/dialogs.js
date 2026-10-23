// The shared sheet helpers, plus the New Game and Settings sheets.

import { CARDS } from '../core/cards.js';
import { BACKGROUNDS } from '../backgrounds.js';
import { installMode, promptInstall, onInstallChange } from '../services/pwa.js';

const $ = (id) => document.getElementById(id);

export function openDialog(dlg) {
  if (!dlg.open) dlg.showModal();
}

export function closeDialog(dlg) {
  if (!dlg.open || dlg.classList.contains('closing')) return;
  dlg.classList.add('closing');
  setTimeout(() => {
    dlg.classList.remove('closing');
    dlg.close();
  }, 200);
}

export function wireDialog(dlg) {
  dlg.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', () => closeDialog(dlg)));
  dlg.addEventListener('click', (e) => e.target === dlg && closeDialog(dlg)); // tap on the backdrop
  dlg.addEventListener('cancel', (e) => {
    e.preventDefault();
    closeDialog(dlg);
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
export function initDialogs({ settings, themes, sound, onDeal, onRestart }) {
  const dlgNew = $('dlg-new');
  const dlgSettings = $('dlg-settings');
  [dlgNew, dlgSettings].forEach(wireDialog);

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
    closeDialog(dlgNew);
    onDeal();
  });
  $('btn-restart').addEventListener('click', () => {
    closeDialog(dlgNew);
    onRestart();
  });

  return {
    openNew() {
      syncers.forEach((fn) => fn());
      openDialog(dlgNew);
    },
    openSettings() {
      syncers.forEach((fn) => fn());
      openDialog(dlgSettings);
    },
    /** Re-read every setting into its control (for sheets that live elsewhere but share controls). */
    syncAll() {
      syncers.forEach((fn) => fn());
    },
    closeAll() {
      [dlgNew, dlgSettings, $('dlg-mp'), $('dlg-leave')].forEach(closeDialog);
    },
  };
}
