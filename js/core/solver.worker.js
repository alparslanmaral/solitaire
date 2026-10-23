// Runs the solver off the main thread. Asked for a winnable deal, it tries random seeds until one is solved.
import { trySeed } from './solver.js';

self.onmessage = ({ data: { id, drawCount, maxAttempts, budget } }) => {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const seed = (Math.random() * 2 ** 32) >>> 0;
    if (trySeed(seed, drawCount, budget).solved) return self.postMessage({ id, seed });
  }
  self.postMessage({ id, seed: null });
};
