// Light / dark / follow-the-system, plus the background palette.
// Reflected on <html data-theme="..." data-bg="...">; the colours come from css/backgrounds.css.

import { DEFAULT_BACKGROUND, isBackground } from '../backgrounds.js';

const query = window.matchMedia('(prefers-color-scheme: dark)');

export function applyAppearance(choice, background = DEFAULT_BACKGROUND) {
  const resolved = choice === 'system' ? (query.matches ? 'dark' : 'light') : choice;
  const root = document.documentElement;
  root.dataset.theme = resolved;
  root.dataset.appearance = choice;
  root.dataset.bg = isBackground(background) ? background : DEFAULT_BACKGROUND;

  // Colour the browser / status bar to match the page.
  const color = getComputedStyle(root).getPropertyValue('--bg-1').trim();
  if (color) document.querySelector('meta[name="theme-color"]')?.setAttribute('content', color);
}

export function watchAppearance(getSettings) {
  query.addEventListener('change', () => {
    const { appearance, background } = getSettings();
    if (appearance === 'system') applyAppearance(appearance, background);
  });
}
