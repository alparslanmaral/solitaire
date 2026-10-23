// Networking settings.
//
// Players find each other with a short room code. WebRTC needs a go-between for that first handshake
// ("signalling"); by default this uses PeerJS's free public broker. After the handshake, all game traffic
// goes directly between the two browsers.
//
// To use your own broker, run `npx peerjs --port 9000` and set `signal` below, or try it without editing
// anything by opening the game with  ?signal=localhost:9000  (add a path if you need one: host:port/path).
//
// STUN servers help two browsers behind home routers reach each other. There is no TURN relay, so a few
// strict networks (some mobile carriers, corporate firewalls) may not be able to connect.

const fromUrl = () => {
  const value = new URLSearchParams(location.search).get('signal');
  if (!value) return null;
  const [hostPort, ...path] = value.split('/');
  const [host, port] = hostPort.split(':');
  return { host, port: port ? Number(port) : location.protocol === 'https:' ? 443 : 80, path: `/${path.join('/')}`, secure: location.protocol === 'https:' };
};

export const NET = {
  /** Prefix for peer ids on the broker, so room codes never clash with other apps. */
  prefix: 'solitaire-pwa-',
  /** { host, port, path, secure } for a self-hosted broker, or null for PeerJS's public one. */
  signal: null,
  iceServers: [{ urls: 'stun:stun.l.google.com:19302' }, { urls: 'stun:stun1.l.google.com:19302' }, { urls: 'stun:global.stun.twilio.com:3478' }],
  vendorScript: 'vendor/peerjs.min.js',
  roomCodeLength: 5,
  alphabet: 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789', // no 0/O/1/I to misread
  connectTimeoutMs: 15000,
};

export const signalOptions = () => fromUrl() ?? NET.signal ?? {};
