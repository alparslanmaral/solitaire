// Shared SVG building blocks for card themes. Everything is drawn on the same
// 250 x 350 canvas that card faces use, and shapes inherit `fill` / `stroke`
// from whoever contains them.

export const CARD_W = 250;
export const CARD_H = 350;

// Suit glyphs on a 100 x 100 grid, in SVG order: S, H, D, C.
const SHAPES = [
  // spade
  '<path d="M50 4C58 24 92 40 92 64C92 80 80 90 66 90C58 90 52 86 50 82C51 90 54 94 60 98L40 98C46 94 49 90 50 82C48 86 42 90 34 90C20 90 8 80 8 64C8 40 42 24 50 4Z"/>',
  // heart
  '<path d="M50 92C22 70 6 54 6 34C6 18 18 8 31 8C40 8 47 13 50 20C53 13 60 8 69 8C82 8 94 18 94 34C94 54 78 70 50 92Z"/>',
  // diamond
  '<path d="M50 3C58 22 76 38 92 50C76 62 58 78 50 97C42 78 24 62 8 50C24 38 42 22 50 3Z"/>',
  // club
  '<circle cx="50" cy="30" r="23"/><circle cx="27" cy="62" r="23"/><circle cx="73" cy="62" r="23"/><path d="M44 55H56C56 76 60 88 68 97H32C40 88 44 76 44 55Z"/>',
];

/**
 * A suit glyph centred on (x, y), `size` units wide.
 * `attrs` is appended to the wrapping <g> (fill, stroke, opacity ...).
 */
export function suit(suitIndex, x, y, size, attrs = '') {
  const s = size / 100;
  return `<g transform="translate(${x - size / 2} ${y - size / 2}) scale(${s})" ${attrs}>${SHAPES[suitIndex]}</g>`;
}

/** Wrap content in the standard card-sized <svg>. */
export function cardSvg(content, attrs = '') {
  return `<svg viewBox="0 0 ${CARD_W} ${CARD_H}" xmlns="http://www.w3.org/2000/svg" ${attrs} aria-hidden="true">${content}</svg>`;
}

/** Rotate content half a turn around the card centre (for the bottom-right index). */
export const flipped = (content) => `<g transform="rotate(180 ${CARD_W / 2} ${CARD_H / 2})">${content}</g>`;

// ---- pip layouts (cards 1..10) ------------------------------------------
// [column, row]: column 0 = left, 1 = middle, 2 = right; row 0 = top .. 1 = bottom.
const L = 0, M = 1, R = 2;
const six = [[L, 0], [R, 0], [L, 0.5], [R, 0.5], [L, 1], [R, 1]];
const nine = [[L, 0], [R, 0], [L, 1 / 3], [R, 1 / 3], [L, 2 / 3], [R, 2 / 3], [L, 1], [R, 1]];

export const PIP_LAYOUT = {
  1: [[M, 0.5]],
  2: [[M, 0], [M, 1]],
  3: [[M, 0], [M, 0.5], [M, 1]],
  4: [[L, 0], [R, 0], [L, 1], [R, 1]],
  5: [[L, 0], [R, 0], [M, 0.5], [L, 1], [R, 1]],
  6: six,
  7: [...six, [M, 0.25]],
  8: [...six, [M, 0.25], [M, 0.75]],
  9: [...nine, [M, 0.5]],
  10: [...nine, [M, 1 / 6], [M, 5 / 6]],
};

export const PIP_COLS = [76, 125, 174];
export const PIP_TOP = 76;
export const PIP_BOTTOM = 274;

/** Draw the pips for a numbered card. Lower-half pips are turned upside down, as on real cards. */
export function pips(card, size, attrs = '') {
  const layout = PIP_LAYOUT[card.rank];
  if (!layout) return '';
  return layout
    .map(([col, row]) => {
      const x = PIP_COLS[col];
      const y = PIP_TOP + row * (PIP_BOTTOM - PIP_TOP);
      const glyph = suit(card.suitIndex, x, y, card.rank === 1 ? size * 2.4 : size, attrs);
      return row > 0.5 ? `<g transform="rotate(180 ${x} ${y})">${glyph}</g>` : glyph;
    })
    .join('');
}
