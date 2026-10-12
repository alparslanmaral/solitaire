import { suit, cardSvg, flipped, pips } from '../suits.js';

const NEON = { red: '#ff5c93', black: '#42e8ff' };
const MONO = "ui-monospace, 'SF Mono', Menlo, Consolas, monospace";

// Outlined glyphs keep the neon-tube look; non-scaling strokes stay equally thin at every size.
const outline = (color) => `fill="none" stroke="${color}" stroke-width="2.6" stroke-linejoin="round" vector-effect="non-scaling-stroke"`;

function index(card, color) {
  return `
    <text x="31" y="54" text-anchor="middle" font-family="${MONO}" font-weight="700"
          font-size="${card.label === '10' ? 36 : 44}" letter-spacing="${card.label === '10' ? -4 : 0}" fill="${color}">${card.label}</text>
    ${suit(card.suitIndex, 31, 80, 26, `fill="${color}"`)}`;
}

/** @type {import('../registry.js').CardTheme} */
export default {
  id: 'midnight',
  name: 'Midnight',

  face(card) {
    const color = NEON[card.color];
    const idx = index(card, color);
    let body;
    if (card.rank >= 11) {
      body = `
        <text x="125" y="214" text-anchor="middle" font-family="${MONO}" font-weight="700" font-size="150"
              fill="none" stroke="${color}" stroke-width="3" vector-effect="non-scaling-stroke">${card.label}</text>
        ${suit(card.suitIndex, 125, 262, 40, outline(color))}`;
    } else {
      body = pips(card, 44, outline(color));
    }
    return cardSvg(
      `<rect width="250" height="350" fill="#0d0f1b"/>
       <rect x="12" y="12" width="226" height="326" rx="16" fill="none" stroke="${color}" stroke-opacity=".28" stroke-width="2"/>
       ${idx}${flipped(idx)}${body}`,
      `class="neon" style="color:${color}"`,
    );
  },

  back() {
    return '<div class="midnight-back"></div>';
  },

  css: `
    .neon { filter: drop-shadow(0 0 3px currentColor); }
    .midnight-back { position: absolute; inset: 0; background: #0d0f1b; }
    .midnight-back::before, .midnight-back::after { content: ''; position: absolute; }
    .midnight-back::before {
      inset: 6cqw; border-radius: 7cqw; border: .9cqw solid #42e8ff;
      box-shadow: 0 0 3cqw rgba(66,232,255,.55), inset 0 0 3cqw rgba(66,232,255,.4);
    }
    .midnight-back::after {
      left: 50%; top: 50%; width: 30cqw; height: 30cqw; translate: -50% -50%; rotate: 45deg;
      border-radius: 4cqw; border: .9cqw solid #ff5c93;
      box-shadow: 0 0 3cqw rgba(255,92,147,.6), inset 0 0 3cqw rgba(255,92,147,.45);
    }
  `,
};
