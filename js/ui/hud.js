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
  const score = document.getElementById('stat-score');
  const moves = document.getElementById('stat-moves');
  const time = document.getElementById('stat-time');
  const undo = document.getElementById('btn-undo');
  const stuckUndo = document.getElementById('stuck-undo');

  return {
    update(game) {
      score.textContent = game.state.score;
      moves.textContent = game.state.moves;
      undo.disabled = stuckUndo.disabled = !game.canUndo;
    },
    showTime(ms) {
      time.textContent = formatTime(ms);
    },
  };
}
