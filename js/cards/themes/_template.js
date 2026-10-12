// Copy this file to start a new card design, e.g. `my-deck.js`, then register it in ../index.js.
// Files starting with an underscore are never loaded automatically.

import { suit, cardSvg, flipped } from '../suits.js';

/** @type {import('../registry.js').CardTheme} */
export default {
  id: 'template', // must be unique
  name: 'Template',

  /**
   * Front of a card. `card` has: id, suit ('S'|'H'|'D'|'C'), suitIndex (0-3), rank (1-13),
   * label ('A'..'K'), color ('red'|'black') and name ('Queen of Hearts').
   * Draw on a 250 x 350 canvas. `suit()` draws a suit symbol, `flipped()` rotates half a turn.
   */
  face(card) {
    const ink = card.color === 'red' ? '#c0392b' : '#222';
    const corner = `
      <text x="30" y="52" text-anchor="middle" font-size="44" font-weight="700" fill="${ink}">${card.label}</text>
      ${suit(card.suitIndex, 30, 78, 26, `fill="${ink}"`)}`;
    return cardSvg(`
      <rect width="250" height="350" fill="#fff"/>
      ${corner}${flipped(corner)}
      ${suit(card.suitIndex, 125, 175, 90, `fill="${ink}"`)}
    `);
  },

  /** Back of every card. HTML + the `css` below works well (cqw = 1% of the card's width). */
  back() {
    return '<div class="template-back"></div>';
  },

  /** Optional. Injected while this theme is selected. */
  css: `
    .template-back { position: absolute; inset: 0; background: #444; }
    .template-back::before { content: ''; position: absolute; inset: 6cqw; border: .8cqw solid #fff8; border-radius: 5cqw; }
  `,
};
