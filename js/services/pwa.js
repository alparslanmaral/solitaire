// Service worker registration + "install app" support.

let deferredPrompt = null;
const listeners = new Set();

export function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch((err) => console.warn('Service worker failed:', err));
  });
}

window.addEventListener('beforeinstallprompt', (event) => {
  event.preventDefault();
  deferredPrompt = event;
  listeners.forEach((fn) => fn());
});

window.addEventListener('appinstalled', () => {
  deferredPrompt = null;
  listeners.forEach((fn) => fn());
});

export const isStandalone = () =>
  window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;

export const isIos = () =>
  /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

/** What the settings panel should offer: 'prompt' (one-tap install), 'ios' (manual), or null. */
export function installMode() {
  if (isStandalone()) return null;
  if (deferredPrompt) return 'prompt';
  if (isIos()) return 'ios';
  return null;
}

export async function promptInstall() {
  if (!deferredPrompt) return;
  deferredPrompt.prompt();
  await deferredPrompt.userChoice.catch(() => {});
  deferredPrompt = null;
  listeners.forEach((fn) => fn());
}

export function onInstallChange(fn) {
  listeners.add(fn);
}
