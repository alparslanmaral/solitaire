// Turn a folder of images into a card theme, no code needed.
//
// Put your files in a folder (for example assets/cards/my-deck/) named:
//
//   AS.svg 2S.svg ... 10S.svg JS.svg QS.svg KS.svg     (spades)
//   AH.svg ...                                         (hearts)
//   AD.svg ...                                         (diamonds)
//   AC.svg ...                                         (clubs)
//   back.svg
//
// i.e. <rank><suit>.<ext> with rank A,2-10,J,Q,K and suit S,H,D,C.
// SVG, PNG, WebP, JPG and AVIF all work. Use a 5:7 aspect ratio (e.g. 250 x 350).
//
// Then register it in ./index.js:
//
//   imagePack({ id: 'my-deck', name: 'My Deck', path: 'assets/cards/my-deck' })

/**
 * @param {{ id: string, name: string, path: string, ext?: string, backName?: string }} options
 * @returns {import('./registry.js').CardTheme}
 */
export function imagePack({ id, name, path, ext = 'svg', backName = 'back' }) {
  const base = path.replace(/\/+$/, '');
  const img = (file) => `<img class="pack-img" src="${base}/${file}.${ext}" alt="" draggable="false" decoding="async">`;
  return {
    id,
    name,
    face: (card) => img(`${card.label}${card.suit}`),
    back: () => img(backName),
    css: '',
  };
}
