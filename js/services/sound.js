// Sound effects, synthesised with the Web Audio API: no audio files to download or cache.
// Card sounds are short bursts of filtered noise (paper), chimes are plain sine tones.

export function createSound(settings) {
  let ctx = null;
  let master = null;
  let noise = null;

  function ensure() {
    if (!ctx) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return null;
      ctx = new AudioCtx();
      master = ctx.createGain();
      master.gain.value = 0.8;
      const limiter = ctx.createDynamicsCompressor();
      master.connect(limiter);
      limiter.connect(ctx.destination);

      noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
      const data = noise.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    }
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }

  /** Filtered noise burst. */
  function burst({ at = 0, freq, to, q = 1, dur = 0.08, gain = 0.3, type = 'bandpass' }) {
    const t0 = ctx.currentTime + at;
    const src = ctx.createBufferSource();
    src.buffer = noise;
    const filter = ctx.createBiquadFilter();
    filter.type = type;
    filter.Q.value = q;
    filter.frequency.setValueAtTime(freq, t0);
    if (to) filter.frequency.exponentialRampToValueAtTime(to, t0 + dur);
    const amp = ctx.createGain();
    amp.gain.setValueAtTime(0.0001, t0);
    amp.gain.exponentialRampToValueAtTime(gain, t0 + 0.004);
    amp.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(filter).connect(amp).connect(master);
    src.start(t0, Math.random() * 0.4);
    src.stop(t0 + dur + 0.02);
  }

  /** Pitched tone. */
  function tone({ at = 0, freq, to, dur = 0.2, gain = 0.2, type = 'sine' }) {
    const t0 = ctx.currentTime + at;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (to) osc.frequency.exponentialRampToValueAtTime(to, t0 + dur);
    const amp = ctx.createGain();
    amp.gain.setValueAtTime(0.0001, t0);
    amp.gain.exponentialRampToValueAtTime(gain, t0 + 0.01);
    amp.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(amp).connect(master);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }

  const sounds = {
    pick: () => burst({ freq: 2400, q: 0.9, dur: 0.035, gain: 0.1 }),
    place: () => {
      burst({ freq: 750, q: 0.8, dur: 0.07, gain: 0.38 });
      tone({ freq: 150, to: 80, dur: 0.09, gain: 0.18, type: 'triangle' });
    },
    flip: () => burst({ freq: 4200, to: 1800, q: 0.7, dur: 0.11, gain: 0.14 }),
    draw: () => burst({ freq: 3200, to: 1400, q: 0.6, dur: 0.12, gain: 0.2 }),
    recycle: () => [0, 0.07, 0.14].forEach((at) => burst({ at, freq: 3000, to: 1500, q: 0.6, dur: 0.1, gain: 0.16 })),
    deal: ({ at = 0 } = {}) => burst({ at, freq: 2200 + Math.random() * 900, q: 1, dur: 0.04, gain: 0.11 }),
    foundation: () => {
      burst({ freq: 750, q: 0.8, dur: 0.07, gain: 0.3 });
      tone({ at: 0.02, freq: 988, dur: 0.28, gain: 0.11 });
      tone({ at: 0.08, freq: 1480, dur: 0.34, gain: 0.08 });
    },
    error: () => tone({ freq: 210, to: 140, dur: 0.14, gain: 0.14, type: 'triangle' }),
    undo: () => burst({ freq: 1600, to: 3400, q: 0.7, dur: 0.1, gain: 0.15 }),
    hint: () => {
      tone({ freq: 880, dur: 0.18, gain: 0.07 });
      tone({ at: 0.09, freq: 1175, dur: 0.22, gain: 0.07 });
    },
    ui: () => burst({ freq: 3000, q: 1.2, dur: 0.025, gain: 0.08 }),
    tick: () => tone({ freq: 660, dur: 0.12, gain: 0.1 }),
    go: () => {
      tone({ freq: 988, dur: 0.3, gain: 0.12 });
      tone({ at: 0.08, freq: 1319, dur: 0.4, gain: 0.1 });
    },
    streak: () => [784, 988, 1319].forEach((freq, i) => tone({ at: i * 0.07, freq, dur: 0.35, gain: 0.1 })),
    win: () => {
      [523.25, 659.25, 783.99, 1046.5, 1318.5].forEach((freq, i) => {
        tone({ at: i * 0.11, freq, dur: 0.7, gain: 0.12 });
        tone({ at: i * 0.11, freq: freq / 2, dur: 0.7, gain: 0.05, type: 'triangle' });
      });
    },
  };

  // Browsers only allow audio after a gesture, so the audio engine is created on the first one.
  const unlock = () => ensure();
  for (const type of ['pointerdown', 'keydown']) window.addEventListener(type, unlock, { capture: true, once: true });

  return {
    unlock,
    play(name, options) {
      if (!ctx || !settings.get('sound') || !sounds[name]) return;
      if (ctx.state === 'suspended') ctx.resume();
      sounds[name](options);
    },
  };
}
