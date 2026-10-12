// Card identity. A card is a number 0..51: id = suitIndex * 13 + (rank - 1).

export const SUITS = ['S', 'H', 'D', 'C']; // spades, hearts, diamonds, clubs
export const SUIT_NAMES = ['Spades', 'Hearts', 'Diamonds', 'Clubs'];
export const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
const RANK_NAMES = ['Ace', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'Jack', 'Queen', 'King'];

export const suitOf = (id) => Math.floor(id / 13);
export const rankOf = (id) => (id % 13) + 1;
export const isRed = (id) => suitOf(id) === 1 || suitOf(id) === 2;

/**
 * What card themes receive when asked to draw a card.
 * @typedef {Object} CardInfo
 * @property {number} id         0..51
 * @property {'S'|'H'|'D'|'C'} suit
 * @property {number} suitIndex  0..3 (S, H, D, C)
 * @property {number} rank       1..13
 * @property {string} label      'A', '2' ... '10', 'J', 'Q', 'K'
 * @property {'red'|'black'} color
 * @property {string} name       'Queen of Hearts'
 */

/** @returns {CardInfo} */
function makeInfo(id) {
  const suitIndex = suitOf(id);
  const rank = rankOf(id);
  return {
    id,
    suit: SUITS[suitIndex],
    suitIndex,
    rank,
    label: RANKS[rank - 1],
    color: isRed(id) ? 'red' : 'black',
    name: `${RANK_NAMES[rank - 1]} of ${SUIT_NAMES[suitIndex]}`,
  };
}

/** @type {CardInfo[]} */
export const CARDS = Array.from({ length: 52 }, (_, id) => makeInfo(id));
