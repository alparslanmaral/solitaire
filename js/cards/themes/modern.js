import { suit, cardSvg } from '../suits.js';

const INK = { red: '#f0445b', black: '#1d1f27' };
const SANS = "ui-rounded, 'SF Pro Rounded', -apple-system, 'Segoe UI', system-ui, sans-serif";

/** @type {import('../registry.js').CardTheme} */
export default {
  id: 'modern',
  name: 'Modern',

  face(card) {
    const color = INK[card.color];
    const size = card.label === '10' ? 58 : 66;
    return cardSvg(`
      <rect width="250" height="350" fill="#fbfbfd"/>
      <text x="26" y="72" font-family="${SANS}" font-weight="700" font-size="${size}"
            letter-spacing="${card.label === '10' ? -4 : 0}" fill="${color}">${card.label}</text>
      ${suit(card.suitIndex, 44, 108, 32, `fill="${color}"`)}
      <circle cx="125" cy="236" r="78" fill="${color}" fill-opacity=".09"/>
      ${suit(card.suitIndex, 125, 236, card.rank === 1 ? 104 : 84, `fill="${color}"`)}
    `);
  },

  back() {
    return '<div class="modern-back"><i></i></div>';
  },

  css: `
    .modern-back {
      position: absolute; inset: 0;
      background:
        radial-gradient(120% 70% at 20% 0%, rgba(255,255,255,.38), transparent 55%),
        linear-gradient(155deg, #4d6bff 0%, #8d5cff 55%, #ff7ab8 100%);
    }
    .modern-back::before {
      content: ''; position: absolute; inset: 7cqw; border-radius: 7cqw;
      border: .9cqw solid rgba(255,255,255,.5);
    }
    .modern-back i {
      position: absolute; left: 50%; top: 50%; width: 38cqw; height: 38cqw; translate: -50% -50%;
      border-radius: 50%;
      background: rgba(255,255,255,.2);
      box-shadow: inset 0 .6cqw 1.2cqw rgba(255,255,255,.55), 0 2cqw 5cqw rgba(30,20,90,.25);
    }
  `,
};
