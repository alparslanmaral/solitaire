// Finds a seed whose deal is guaranteed winnable (see solver.js). Multiplayer uses this so nobody is
// handed a dead deal. Runs in a Worker when the browser has one, otherwise in short slices on the page.

import { trySeed } from './solver.js';

const BUDGET = { maxNodes: 120000, maxMs: 1500 };
const MAX_ATTEMPTS = 120;

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

async function onThisThread(drawCount, isCancelled) {
  for (let attempt = 0; attempt < MAX_ATTEMPTS && !isCancelled(); attempt++) {
    const seed = (Math.random() * 2 ** 32) >>> 0;
    if (trySeed(seed, drawCount, { maxNodes: 30000, maxMs: 300 }).solved) return seed;
    await tick(); // let the page breathe between attempts
  }
  return null;
}

function inWorker(drawCount, isCancelled) {
  return new Promise((resolve, reject) => {
    let worker;
    try {
      worker = new Worker(new URL('./solver.worker.js', import.meta.url), { type: 'module' });
    } catch (err) {
      return reject(err);
    }
    const poll = setInterval(() => {
      if (isCancelled()) done(null);
    }, 200);
    const done = (seed) => {
      clearInterval(poll);
      worker.terminate();
      resolve(seed);
    };
    worker.onmessage = ({ data }) => done(data.seed);
    worker.onerror = (e) => {
      clearInterval(poll);
      worker.terminate();
      reject(e);
    };
    worker.postMessage({ id: 1, drawCount, maxAttempts: MAX_ATTEMPTS, budget: BUDGET });
  });
}

/**
 * @param {{ drawCount: 1 | 3, signal?: AbortSignal }} options
 * @returns {Promise<number | null>} a seed, or null if cancelled / none found
 */
export async function findWinnableSeed({ drawCount, signal }) {
  const isCancelled = () => signal?.aborted === true;
  if (typeof Worker !== 'undefined') {
    try {
      return await inWorker(drawCount, isCancelled);
    } catch {
      /* fall through to the page thread */
    }
  }
  return onThisThread(drawCount, isCancelled);
}
