// The Multiplayer sheet: pick a mode and open a room, or type a code and join one.
// It only gets two people connected; once they are, it hands the match to the app via `onReady`.

import { hostRoom, joinRoom, describeError, normalizeCode } from '../net/transport.js';
import { HostMatch, GuestMatch } from '../net/match.js';
import { MODES, cleanName } from '../net/protocol.js';
import { findWinnableSeed } from '../core/winnable.js';
import { openDialog, closeDialog, wireDialog } from './dialogs.js';
import { showToast } from './toast.js';

const $ = (id) => document.getElementById(id);

/**
 * @param {{ settings: any, sound: any, syncControls: () => void,
 *           onReady: (info: { role: 'host' | 'guest', match: any, seed?: number, room?: any }) => void }} deps
 */
export function initMultiplayer({ settings, sound, syncControls, onReady }) {
  const dlg = $('dlg-mp');
  const nameInput = $('mp-name');
  const codeInput = $('mp-code');
  const waitStatus = $('mp-wait-status');
  const joinStatus = $('mp-join-status');
  wireDialog(dlg);

  let mode = MODES.PVP;
  let room = null; // host: the open room
  let abort = null; // host: cancels the winnable-deal search
  let pending = null; // whatever is in progress (so Cancel can undo it)
  let session = 0; // bumps on every start/cancel so late callbacks can tell they are stale

  const setView = (view) => {
    dlg.dataset.view = view;
    dlg.querySelectorAll('[data-views]').forEach((el) => (el.hidden = !el.dataset.views.split(' ').includes(view)));
    if (view === 'create') syncControls();
  };

  const playerName = () => cleanName(nameInput.value, 'Player');

  const setWait = (text, busy = true) => {
    waitStatus.replaceChildren();
    if (busy) {
      const spin = document.createElement('i');
      spin.className = 'spinner';
      waitStatus.append(spin);
    }
    const span = document.createElement('span');
    span.textContent = text;
    waitStatus.append(span);
  };

  const setJoinStatus = (text, { error = true, busy = false } = {}) => {
    joinStatus.classList.toggle('error', error);
    joinStatus.replaceChildren();
    if (busy) {
      const spin = document.createElement('i');
      spin.className = 'spinner';
      joinStatus.append(spin);
    }
    if (text) {
      const span = document.createElement('span');
      span.textContent = text;
      joinStatus.append(span);
    }
  };

  /** Tear down whatever is half-open (room, connection, deal search). */
  function reset() {
    session++;
    abort?.abort();
    abort = null;
    room?.close();
    room = null;
    pending?.destroy?.();
    pending = null;
  }

  // ---- mode cards -----------------------------------------------------------------------------

  const cards = [...$('mode-cards').querySelectorAll('.mode-card')];
  const syncMode = () => cards.forEach((c) => c.setAttribute('aria-checked', c.dataset.mode === mode));
  cards.forEach((c) =>
    c.addEventListener('click', () => {
      mode = c.dataset.mode;
      syncMode();
    }),
  );
  syncMode();

  // ---- name ----------------------------------------------------------------------------------------

  nameInput.value = settings.get('playerName') ?? '';
  nameInput.addEventListener('change', () => settings.set('playerName', cleanName(nameInput.value, '')));

  // ---- host ------------------------------------------------------------------------------------------

  async function createRoom() {
    reset();
    const mine = ++session;
    setView('wait');
    setWait('Opening room…');
    $('room-code').textContent = '-----';
    const drawCount = settings.get('drawCount');
    try {
      const opened = await hostRoom();
      if (mine !== session) return opened.close();
      room = opened;
      $('room-code').textContent = room.code;

      // Start looking for a winnable deal right away, while we wait for a friend.
      abort = new AbortController();
      const seedPromise = findWinnableSeed({ drawCount, signal: abort.signal });
      setWait('Waiting for a friend to join…');

      room.on('error', (err) => mine === session && setWait(describeError(err), false));
      room.on('guest', (link) => {
        if (mine !== session) return link.close();
        const match = new HostMatch({ link, mode, drawCount, name: playerName() });
        pending = match;
        setWait('Friend connected…');
        match.on('closed', () => {
          // They left before the game began: go back to waiting.
          if (pending === match && mine === session) {
            pending = null;
            setWait('Waiting for a friend to join…');
          }
        });
        match.on('guest', async ({ name }) => {
          setWait(`${name} joined. Getting a winnable deal ready…`);
          const seed = await seedPromise;
          if (mine !== session || pending !== match) return;
          if (seed === null) return setWait("Couldn't prepare a deal. Please try again.", false);
          // From here on the app owns the match and the room (closing the room would drop the game).
          const handoff = room;
          pending = null;
          room = null;
          abort = null;
          onReady({ role: 'host', match, seed, room: handoff });
        });
      });
    } catch (err) {
      if (mine === session) setWait(describeError(err), false);
    }
  }

  // ---- guest --------------------------------------------------------------------------------------------

  async function join() {
    const code = normalizeCode(codeInput.value);
    if (code.length !== 5) return setJoinStatus('Room codes have 5 characters.');
    reset();
    const mine = ++session;
    $('mp-connect').disabled = true;
    setJoinStatus('Connecting…', { error: false, busy: true });
    try {
      const link = await joinRoom(code);
      if (mine !== session) return link.close();
      const match = new GuestMatch({ link, name: playerName() });
      pending = match;
      match.on('rejected', (reason) => {
        if (mine !== session) return;
        reset();
        setJoinStatus(reason === 'full' ? 'That room is already full.' : reason === 'version' ? 'The host is running a different version of the game.' : "The host didn't accept the connection.");
      });
      match.on('closed', () => {
        if (pending !== match || mine !== session) return;
        pending = null;
        setJoinStatus('The connection was lost.');
      });
      match.on('welcome', () => {
        if (mine !== session) return;
        setJoinStatus('Connected. Waiting for the host to start…', { error: false, busy: true });
        pending = null;
        onReady({ role: 'guest', match });
      });
      match.hello();
      setTimeout(() => {
        if (pending === match && mine === session) {
          reset();
          setJoinStatus("The host didn't answer. Try again.");
        }
      }, 10000);
    } catch (err) {
      if (mine === session) setJoinStatus(describeError(err));
    } finally {
      $('mp-connect').disabled = false;
    }
  }

  // ---- buttons ---------------------------------------------------------------------------------------------

  $('mp-create').addEventListener('click', () => {
    sound.play('ui');
    setView('create');
  });
  $('mp-join').addEventListener('click', () => {
    sound.play('ui');
    setJoinStatus('');
    setView('join');
    setTimeout(() => codeInput.focus(), 50);
  });
  $('mp-open').addEventListener('click', createRoom);
  $('mp-connect').addEventListener('click', join);
  codeInput.addEventListener('input', () => {
    codeInput.value = normalizeCode(codeInput.value).slice(0, 5);
    setJoinStatus('');
  });
  codeInput.addEventListener('keydown', (e) => e.key === 'Enter' && join());
  dlg.querySelectorAll('[data-back]').forEach((b) => b.addEventListener('click', () => setView('home')));
  $('mp-cancel').addEventListener('click', () => {
    reset();
    setView('home');
  });
  dlg.addEventListener('close', reset);

  $('mp-copy').addEventListener('click', async () => {
    const code = $('room-code').textContent;
    try {
      await navigator.clipboard.writeText(code);
      showToast('Room code copied');
    } catch {
      showToast(`Room code: ${code}`);
    }
  });

  $('mp-share').addEventListener('click', async () => {
    const code = $('room-code').textContent;
    const url = `${location.origin}${location.pathname}?room=${code}`;
    try {
      if (navigator.share) await navigator.share({ title: 'Solitaire', text: `Join my Solitaire room: ${code}`, url });
      else {
        await navigator.clipboard.writeText(url);
        showToast('Invite link copied');
      }
    } catch {
      /* the share sheet was dismissed */
    }
  });

  return {
    open(view = 'home', { code } = {}) {
      reset();
      setView(view);
      if (view === 'join') {
        codeInput.value = normalizeCode(code ?? '').slice(0, 5);
        setJoinStatus('');
      }
      openDialog(dlg);
    },
    close() {
      if (dlg.open) dlg.close();
    },
    /** Forget any half-open room or connection (the match itself is the app's business by now). */
    cancel: reset,
    closeDialog: () => closeDialog(dlg),
  };
}
