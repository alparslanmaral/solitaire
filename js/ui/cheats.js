// The Cheats section of Settings. It only exists for a player called "alp", and only while a multiplayer
// match is being played. (The name check is a courtesy, not security: it all happens on this device.)
//
//   Show next move   keeps the best move highlighted
//   Auto-play        plays it for you, one move every N milliseconds (the Speed slider)
//
// Both use the solver to follow a winning line (see js/cheats/planner.js), so they are far better than Hint.
// Auto-play makes ordinary moves, so the host and the other player see nothing unusual on the wire.

import { createPlanner } from '../cheats/planner.js';
import { cleanName } from '../net/protocol.js';

const $ = (id) => document.getElementById(id);

const SLOWEST_MS = 2500;
const FASTEST_MS = 80;

/** Slider position (0..100) to the pause between moves. Exponential, so every notch feels the same. */
export const delayFor = (speed) => Math.round(SLOWEST_MS * (FASTEST_MS / SLOWEST_MS) ** (speed / 100));

const describe = (ms) => `${(ms / 1000).toFixed(ms < 1000 ? 2 : 1)} s per move`;

/**
 * @param {{ board: any, settings: any, isMultiplayer: () => boolean }} deps
 */
export function initCheats({ board, settings, isMultiplayer }) {
  const section = $('cheats-section');
  const hintSwitch = $('cheat-hint');
  const autoSwitch = $('cheat-auto');
  const speed = $('cheat-speed');
  const label = $('cheat-speed-label');
  const planner = createPlanner();
  const on = { hint: false, auto: false };

  const available = () => isMultiplayer() && cleanName(settings.get('playerName'), '').toLowerCase() === 'alp' & 'admin';

  /** The planner's answer, or the ordinary hint when it can't find a win from here. */
  const provider = (game) => planner.next(game) ?? game.hint();

  function apply() {
    board.setNextMoveProvider(on.hint || on.auto ? provider : null);
    board.setAutoHint(on.hint);
    board.setAutoPlay(on.auto, delayFor(settings.get('cheatSpeed')));
  }

  function paint() {
    hintSwitch.setAttribute('aria-checked', on.hint);
    autoSwitch.setAttribute('aria-checked', on.auto);
    speed.value = settings.get('cheatSpeed');
    label.textContent = describe(delayFor(settings.get('cheatSpeed')));
    $('cheat-speed').closest('.slider').classList.toggle('off', !on.auto);
  }

  hintSwitch.addEventListener('click', () => {
    on.hint = !on.hint;
    apply();
    paint();
  });

  autoSwitch.addEventListener('click', () => {
    on.auto = !on.auto;
    apply();
    paint();
  });

  speed.addEventListener('input', () => {
    settings.set('cheatSpeed', Number(speed.value));
    if (on.auto) apply();
    paint();
  });

  return {
    /** Call when Settings opens: show the section only to whoever may see it. */
    sync() {
      const allowed = available();
      section.hidden = !allowed;
      if (!allowed && (on.hint || on.auto)) this.reset();
      paint();
    },
    /** Switch everything off (leaving a match, or the name no longer qualifies). */
    reset() {
      on.hint = on.auto = false;
      planner.reset();
      apply();
      paint();
    },
  };
}
