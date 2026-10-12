import { suit, cardSvg, flipped, pips } from '../suits.js';

const INK = { red: '#d3283b', black: '#1a1d29' };
const SERIF = "Georgia, 'Times New Roman', serif";

function index(card, color) {
  const size = card.label === '10' ? 38 : 46;
  return `
    <text x="31" y="54" text-anchor="middle" font-family="${SERIF}" font-weight="700"
          font-size="${size}" letter-spacing="${card.label === '10' ? -3 : 0}" fill="${color}">${card.label}</text>
    ${suit(card.suitIndex, 31, 80, 28, `fill="${color}"`)}`;
}

function crown(card, color) {
  if (card.label === 'K') {
    return `<path d="M95 86L100 62L113 74L125 56L137 74L150 62L155 86Z" fill="${color}"/>
            <rect x="95" y="88" width="60" height="6" rx="2" fill="${color}"/>`;
  }
  if (card.label === 'Q') {
    return `<path d="M97 86L100 66L112 77L125 60L138 77L150 66L153 86Z" fill="${color}"/>
            <circle cx="100" cy="62" r="5" fill="${color}"/><circle cx="125" cy="55" r="5" fill="${color}"/><circle cx="150" cy="62" r="5" fill="${color}"/>
            <rect x="97" y="88" width="56" height="6" rx="2" fill="${color}"/>`;
  }
  // Jack
  return `<path d="M125 56L142 74L125 92L108 74Z" fill="${color}"/>`;
}

// J, Q and K: a framed panel, mirrored top and bottom like a real court card.
// The letter's baseline sits well above the centre line so the J's tail never touches the divider.
function courtCard(card, color) {
  const half = `<g transform="translate(0 -5)">${crown(card, color)}</g>
    <text x="125" y="150" text-anchor="middle" font-family="${SERIF}" font-weight="700" font-size="78" fill="${color}">${card.label}</text>`;
  return `
    <rect x="60" y="40" width="130" height="270" rx="14" fill="${color}" fill-opacity=".05"
          stroke="${color}" stroke-opacity=".35" stroke-width="2"/>
    ${half}${flipped(half)}
    <path d="M76 175H174" stroke="${color}" stroke-opacity=".35" stroke-width="2"/>
    ${suit(card.suitIndex, 125, 175, 24, `fill="${color}" stroke="#fffefa" stroke-width="10" paint-order="stroke"`)}`;
}

/** @type {import('../registry.js').CardTheme} */
export default {
  id: 'classic',
  name: 'Classic',

  face(card) {
    const color = INK[card.color];
    const idx = index(card, color);
    let body;
    if (card.rank >= 11) body = courtCard(card, color);
    else body = pips(card, 46, `fill="${color}"`);
    return cardSvg(`<rect width="250" height="350" fill="#fffefa"/>${idx}${flipped(idx)}${body}`);
  },

  back() {
    return '<div class="classic-back"></div>';
  },

  css: `
    .classic-back { position: absolute; inset: 0; background: #fffefa; }
    .classic-back::before {
      content: ''; position: absolute; inset: 4.4cqw; border-radius: 4cqw;
      background-color: #2447c9;
      background-image:
        linear-gradient(45deg, transparent 45%, rgba(255,255,255,.34) 45% 55%, transparent 55%),
        linear-gradient(-45deg, transparent 45%, rgba(255,255,255,.34) 45% 55%, transparent 55%);
      background-size: 16.667cqw 16.667cqw;
      background-position: center;
      box-shadow: inset 0 0 0 1.2cqw #2447c9, inset 0 0 0 1.8cqw rgba(255,255,255,.55);
    }
  `,
};
