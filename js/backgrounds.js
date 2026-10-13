// Background palettes offered in Settings. The colours themselves live in css/backgrounds.css;
// to add one, add a CSS block there and an entry here.

export const BACKGROUNDS = [
  { id: 'emerald', name: 'Emerald' },
  { id: 'ocean', name: 'Ocean' },
  { id: 'sunset', name: 'Sunset' },
  { id: 'rose', name: 'Rose' },
  { id: 'lavender', name: 'Lavender' },
  { id: 'graphite', name: 'Graphite' },
];

export const DEFAULT_BACKGROUND = BACKGROUNDS[0].id;

export const isBackground = (id) => BACKGROUNDS.some((b) => b.id === id);
