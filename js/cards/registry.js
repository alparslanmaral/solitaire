// The card theme registry.
//
// A theme is a plain object:
//
//   {
//     id:   'my-deck',                 // unique, used for saving the choice
//     name: 'My Deck',                 // shown in Settings
//     face(card)  -> string            // HTML/SVG for the front of `card` (a CardInfo, see core/cards.js)
//     back()      -> string            // HTML/SVG for the back of every card
//     css?:  string                    // optional CSS, loaded with the app
//   }
//
// The markup you return is stretched to fill the card (5:7 ratio). An <svg viewBox="0 0 250 350">
// scales perfectly; `cqw` units (1cqw = 1% of the card's width) work in `css`.
// Theme CSS is global, so prefix your class names with your theme id (e.g. `.my-deck-back`).
//
// To add a theme: create a file in ./themes/, then add it to THEMES in ./index.js.

/**
 * @typedef {Object} CardTheme
 * @property {string} id
 * @property {string} name
 * @property {(card: import('../core/cards.js').CardInfo) => string} face
 * @property {() => string} back
 * @property {string} [css]
 */

/** @param {CardTheme[]} themes */
export function createRegistry(themes) {
  const byId = new Map();
  for (const t of themes) {
    if (!t?.id || typeof t.face !== 'function' || typeof t.back !== 'function') {
      console.warn('[cards] Skipping an invalid card theme:', t);
    } else if (byId.has(t.id)) {
      console.warn(`[cards] Duplicate card theme id "${t.id}" ignored.`);
    } else {
      byId.set(t.id, t);
    }
  }
  const list = [...byId.values()];

  return {
    list: () => list,
    get: (id) => byId.get(id) ?? list[0],
    has: (id) => byId.has(id),

    /** Inject every theme's CSS once (so previews work too). Prefix your class names with the theme id. */
    mountStyles() {
      for (const t of list) {
        if (!t.css) continue;
        const style = document.createElement('style');
        style.dataset.cardTheme = t.id;
        style.textContent = t.css;
        document.head.append(style);
      }
    },
  };
}
