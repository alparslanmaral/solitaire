// WebRTC transport on top of PeerJS. Turns "room code" into a `link`: an object with send(msg),
// onmessage, onclose and close(), which is all match.js needs.

import { NET, signalOptions } from './config.js';
import { Emitter } from './emitter.js';

let loading = null;

/** PeerJS is only fetched when someone opens multiplayer. */
export function loadPeerJs() {
  if (window.peerjs?.Peer || window.Peer) return Promise.resolve();
  loading ??= new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = NET.vendorScript;
    script.onload = () => (window.peerjs?.Peer || window.Peer ? resolve() : reject(new Error('PeerJS did not load')));
    script.onerror = () => {
      loading = null;
      reject(new Error('Could not load the multiplayer library'));
    };
    document.head.append(script);
  });
  return loading;
}

const PeerClass = () => window.peerjs?.Peer ?? window.Peer;

export const normalizeCode = (text) => String(text ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');

export function randomCode() {
  const bytes = crypto.getRandomValues(new Uint8Array(NET.roomCodeLength));
  return Array.from(bytes, (b) => NET.alphabet[b % NET.alphabet.length]).join('');
}

/** A friendly sentence for whatever PeerJS threw. */
export function describeError(err) {
  switch (err?.type) {
    case 'peer-unavailable':
      return 'No room with that code. Check it and try again.';
    case 'unavailable-id':
      return 'That room code is already taken.';
    case 'network':
    case 'server-error':
    case 'socket-error':
    case 'socket-closed':
      return "Can't reach the matchmaking server. Check your connection.";
    case 'timeout':
      return 'No answer from that room. Check the code, or ask the host to open a new room.';
    case 'webrtc':
      return "Couldn't connect to the other player. Their network may block direct connections.";
    default:
      return err?.message || 'Something went wrong while connecting.';
  }
}

const newPeer = (id) =>
  new (PeerClass())(id, { debug: 0, ...signalOptions(), config: { iceServers: NET.iceServers } });

function openPeer(id) {
  return new Promise((resolve, reject) => {
    const peer = newPeer(id);
    const timer = setTimeout(() => {
      peer.destroy();
      reject(Object.assign(new Error('The matchmaking server did not answer.'), { type: 'network' }));
    }, NET.connectTimeoutMs);
    peer.on('open', () => {
      clearTimeout(timer);
      resolve(peer);
    });
    peer.on('error', (err) => {
      clearTimeout(timer);
      peer.destroy();
      reject(err);
    });
  });
}

/** Wrap a PeerJS DataConnection as a link. Messages that arrive before someone listens are kept. */
function toLink(conn, peer) {
  const backlog = [];
  let handler = null;
  const link = {
    onclose: null,
    get onmessage() {
      return handler;
    },
    set onmessage(fn) {
      handler = fn;
      while (fn && backlog.length) fn(backlog.shift());
    },
    send(msg) {
      if (conn.open) conn.send(msg);
    },
    close() {
      conn.close();
      peer?.destroy();
    },
  };
  conn.on('data', (data) => (handler ? handler(data) : backlog.push(data)));
  const closed = () => link.onclose?.();
  conn.on('close', closed);
  conn.on('error', closed);
  return link;
}

/**
 * Open a room. Resolves with { code, close() } plus events: 'guest' (a link), 'error'.
 * Only one guest at a time; anyone else who tries the code is told the room is full.
 */
export async function hostRoom() {
  await loadPeerJs();
  let peer = null;
  let code = '';
  for (let attempt = 0; attempt < 6 && !peer; attempt++) {
    code = randomCode();
    try {
      peer = await openPeer(NET.prefix + code);
    } catch (err) {
      if (err?.type !== 'unavailable-id') throw err;
    }
  }
  if (!peer) throw Object.assign(new Error('Could not reserve a room code.'), { type: 'unavailable-id' });

  const room = new Emitter();
  let guest = null;

  peer.on('connection', (conn) => {
    conn.on('open', () => {
      if (guest) {
        conn.send({ t: 'reject', reason: 'full' });
        setTimeout(() => conn.close(), 300);
        return;
      }
      guest = toLink(conn, null);
      conn.on('close', () => (guest = null));
      room.emit('guest', guest);
    });
  });
  // Losing the broker does not hurt a game in progress; try to get it back for new joiners.
  peer.on('disconnected', () => !peer.destroyed && peer.reconnect());
  peer.on('error', (err) => room.emit('error', err));

  return Object.assign(room, { code, close: () => peer.destroy() });
}

/** Join a room by code. Resolves with a link, or rejects with something describeError() understands. */
export async function joinRoom(rawCode) {
  const code = normalizeCode(rawCode);
  if (code.length !== NET.roomCodeLength) throw Object.assign(new Error('Room codes have 5 characters.'), { type: 'bad-code' });
  await loadPeerJs();
  const peer = await openPeer(undefined);

  return new Promise((resolve, reject) => {
    const conn = peer.connect(NET.prefix + code, { reliable: true, serialization: 'json' });
    const fail = (err) => {
      clearTimeout(timer);
      peer.destroy();
      reject(err);
    };
    const timer = setTimeout(
      () => fail(Object.assign(new Error('No answer from that room.'), { type: 'timeout' })),
      NET.connectTimeoutMs,
    );
    peer.on('error', fail);
    conn.on('error', fail);
    conn.on('open', () => {
      clearTimeout(timer);
      peer.off('error', fail);
      resolve(toLink(conn, peer));
    });
  });
}
