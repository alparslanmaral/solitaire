import { storage } from './storage.js';
import { DEFAULT_CARD_THEME } from '../cards/index.js';
import { DEFAULT_BACKGROUND } from '../backgrounds.js';

const DEFAULTS = {
  appearance: 'system', // 'system' | 'light' | 'dark'
  background: DEFAULT_BACKGROUND,
  cardTheme: DEFAULT_CARD_THEME,
  sound: true,
  playerName: '',
  drawCount: 1, // 1 | 3
};

export function createSettings() {
  let values = { ...DEFAULTS, ...storage.get('settings', {}) };
  const listeners = new Set();

  return {
    get: (key) => values[key],
    set(key, value) {
      if (values[key] === value) return;
      values = { ...values, [key]: value };
      storage.set('settings', values);
      listeners.forEach((fn) => fn(key, value));
    },
    /** fn(key, value) runs after any setting changes. Returns an unsubscribe function. */
    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
  };
}
