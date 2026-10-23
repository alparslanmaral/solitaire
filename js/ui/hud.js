// Score / moves / time pill and the stopwatch behind it.

export function formatTime(ms) {
  const total = Math.floor(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = String(total % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${s}` : `${m}:${s}`;
}

/** Counts only while `running` is true and the page is visible. */
export class Stopwatch {
  constructor(onTick) {
    this.elapsed = 0;
    this.running = false;
    this.onTick = onTick;
    this.last = performance.now();
    setInterval(() => this.tick(), 500);
    document.addEventListener('visibilitychange', () => this.tick());
  }

  tick() {
    const now = performance.now();
    if (this.running && !document.hidden) this.elapsed += now - this.last;
    this.last = now;
    this.onTick(this.elapsed);
  }

  set(elapsed, running) {
    this.tick();
    this.elapsed = elapsed;
    this.running = running;
    this.onTick(this.elapsed);
  }
}

export function createHud() {
  const $ = (id) => document.getElementById(id);
  const score = $('stat-score');
  const moves = $('stat-moves');
  const time = $('stat-time');
  const undo = $('btn-undo');
  const stuckUndo = $('stuck-undo');
  const streakBox = $('stat-streak');
  const streakValue = $('stat-streak-value');
  const opp = $('opp');
  const pop = $('pop');
  let popTimer = 0;

  return {
    update(game) {
      score.textContent = game.state.score;
      moves.textContent = game.state.moves;
      undo.disabled = stuckUndo.disabled = !game.canUndo;
      const streak = game.state.streak ?? 0;
      streakBox.hidden = streak < 2;
      streakValue.textContent = `x${streak}`;
      streakBox.classList.toggle('hot', streak >= 5);
    },

    showTime(ms) {
      time.textContent = formatTime(ms);
    },

    /** A short floating message, e.g. when a streak pays a bonus. */
    pop(text) {
      clearTimeout(popTimer);
      pop.textContent = text;
      pop.classList.remove('show');
      void pop.offsetWidth; // restart the animation
      pop.classList.add('show');
      popTimer = setTimeout(() => pop.classList.remove('show'), 1800);
    },

    /**
     * The other player's strip. `kind` is 'pvp' (score, moves, progress) or 'coop' (just their moves);
     * pass null to hide it.
     */
    setOpponent(info, kind = 'pvp') {
      opp.hidden = !info;
      if (!info) return;
      opp.dataset.kind = kind;
      $('opp-name').textContent = info.name;
      $('opp-score').textContent = info.score ?? 0;
      $('opp-moves').textContent = info.moves ?? 0;
      $('opp-bar').style.width = `${Math.round(((info.found ?? 0) / 52) * 100)}%`;
    },

    setOpponentOnline(online) {
      opp.classList.toggle('offline', !online);
    },
  };
}
