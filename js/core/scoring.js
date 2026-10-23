// Score rules that sit on top of the move-by-move points in klondike.js.
//
// While playing:
//   - Every move that earns points extends a streak. Reaching 5, 10, 15 ... in a row pays a bonus of
//     5 x the streak (25, 50, 75 ...). Drawing from the stock doesn't break a streak, but a move that
//     earns nothing (shuffling cards between columns, pulling one back from a foundation) or turning
//     the waste over does.
//
// When the deal is cleared:
//   - Time bonus: starts at 3000 and halves every 4 minutes, so faster is always better.
//   - Move bonus: 2000 for 80 moves or fewer, falling in a straight line to 0 at 260 moves.

export const STREAK_STEP = 5;

export const TIME_BONUS_MAX = 3000;
export const TIME_HALF_LIFE = 240; // seconds

export const MOVE_BONUS_MAX = 2000;
export const MOVES_BEST = 80;
export const MOVES_WORST = 260;

/** Bonus paid when a streak reaches `streak` (0 unless it is a multiple of STREAK_STEP). */
export const streakBonus = (streak) => (streak > 0 && streak % STREAK_STEP === 0 ? streak * 5 : 0);

const round10 = (n) => Math.round(n / 10) * 10;

export function timeBonus(seconds) {
  return round10(TIME_BONUS_MAX * 0.5 ** (Math.max(0, seconds) / TIME_HALF_LIFE));
}

export function moveBonus(moves) {
  const t = (MOVES_WORST - moves) / (MOVES_WORST - MOVES_BEST);
  return round10(MOVE_BONUS_MAX * Math.min(1, Math.max(0, t)));
}

/** Final tally for a cleared deal. `score` is what the player had when the last card went home. */
export function finalScore({ score, moves, seconds }) {
  const time = timeBonus(seconds);
  const efficiency = moveBonus(moves);
  return { score, timeBonus: time, moveBonus: efficiency, total: score + time + efficiency };
}
