// >>> This is the only file you need to touch to add a card design. <<<

import { createRegistry } from './registry.js';
import { imagePack } from './image-pack.js'; // eslint-disable-line no-unused-vars
import classic from './themes/classic.js';
import modern from './themes/modern.js';
import midnight from './themes/midnight.js';
// import myDeck from './themes/my-deck.js';

export const cardThemes = createRegistry([
  classic,
  modern,
  midnight,
  // myDeck,
  // imagePack({ id: 'my-images', name: 'My Images', path: 'assets/cards/my-images' }),
]);

export const DEFAULT_CARD_THEME = classic.id;
