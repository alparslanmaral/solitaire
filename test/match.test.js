import { test } from 'node:test';
import assert from 'node:assert/strict';
import { HostMatch, GuestMatch } from '../js/net/match.js';
import { SyncedGame } from '../js/net/synced-game.js';
import { parseAction, isValidState } from '../js/net/protocol.js';
import { Klondike } from '../js/core/klondike.js';
import { loopbackPair, flush } from './loopback.js';

const SEED = 4242;

/** Host + guest wired together, lobby done, round started, countdown over. */
async function setup(mode, { drawCount = 1 } = {}) {
  const [hostLink, guestLink] = loopbackPair();
  let clock = 0;
  const now = () => clock;
  const host = new HostMatch({ link: hostLink, mode, drawCount, name: 'Ada', heartbeat: false, now });
  const guest = new GuestMatch({ link: guestLink, name: 'Bob', heartbeat: false, now });
  const log = { host: [], guest: [] };
  for (const ev of ['guest', 'opponent', 'remote', 'end', 'closed', 'rematch']) host.on(ev, (x) => log.host.push([ev, x]));
  for (const ev of ['welcome', 'start', 'opponent', 'sync', 'end', 'closed', 'rejected']) guest.on(ev, (x) => log.guest.push([ev, x]));

  guest.hello();
  await flush();
  const hostGame = host.startRound(SEED);
  await flush();
  host.beginClock();
  const guestGame = guest.game;
  return { host, guest, hostGame, guestGame, log, tick: (s) => (clock += s * 1000), hostLink, guestLink };
}

const events = (list, name) => list.filter(([e]) => e === name).map(([, x]) => x);

/** First legal move on a game, as { id, dest }. */
function anyMove(game) {
  const h = game.hint();
  return h && !h.draw ? h : null;
}

test('protocol: actions are checked and rebuilt', () => {
  assert.deepEqual(parseAction({ k: 'draw', junk: 1 }), { k: 'draw' });
  assert.deepEqual(parseAction({ k: 'move', id: 5, dest: { pile: 'tableau', index: 3, x: 1 } }), { k: 'move', id: 5, dest: { pile: 'tableau', index: 3 } });
  assert.equal(parseAction({ k: 'move', id: 52, dest: { pile: 'tableau', index: 0 } }), null);
  assert.equal(parseAction({ k: 'move', id: 5, dest: { pile: 'tableau', index: 7 } }), null);
  assert.equal(parseAction({ k: 'move', id: 5, dest: { pile: 'foundation', index: 4 } }), null);
  assert.equal(parseAction({ k: 'move', id: 5, dest: { pile: 'nowhere', index: 0 } }), null);
  assert.equal(parseAction('draw'), null);
  assert.equal(parseAction(null), null);
});

test('protocol: states must hold all 52 cards exactly once', () => {
  const { state } = Klondike.newGame({ seed: 1 });
  assert.equal(isValidState(JSON.parse(JSON.stringify(state))), true);
  const bad = JSON.parse(JSON.stringify(state));
  bad.stock.pop();
  assert.equal(isValidState(bad), false);
  const dup = JSON.parse(JSON.stringify(state));
  dup.stock[0] = dup.stock[1];
  assert.equal(isValidState(dup), false);
  assert.equal(isValidState({}), false);
});

test('lobby: the guest is welcomed and both sides get the same deal', async () => {
  const { log, hostGame, guestGame } = await setup('pvp');
  assert.equal(events(log.host, 'guest')[0].name, 'Bob');
  assert.equal(events(log.guest, 'welcome')[0].host, 'Ada');
  assert.equal(events(log.guest, 'start').length, 1);
  assert.deepEqual(guestGame.state.tableau, hostGame.state.tableau);
  assert.deepEqual(guestGame.state.stock, hostGame.state.stock);
});

test('lobby: two players with the same name are told apart', async () => {
  const [hl, gl] = loopbackPair();
  const host = new HostMatch({ link: hl, mode: 'pvp', drawCount: 1, name: 'Sam', heartbeat: false });
  const guest = new GuestMatch({ link: gl, name: 'Sam', heartbeat: false });
  guest.hello();
  await flush();
  assert.equal(host.guestName, 'Sam (2)');
});

test('lobby: a different protocol version is turned away', async () => {
  const [hl, gl] = loopbackPair();
  new HostMatch({ link: hl, mode: 'pvp', drawCount: 1, heartbeat: false });
  const seen = [];
  gl.onmessage = (m) => seen.push(m);
  gl.send({ t: 'hello', v: 999, name: 'Old' });
  await flush();
  assert.deepEqual(seen.map((m) => m.t), ['reject']);
});

// ---- PvP ---------------------------------------------------------------------------------------

test('pvp: the host keeps a shadow of the guest game and sees their numbers', async () => {
  const { host, guestGame, log } = await setup('pvp');
  const move = anyMove(guestGame);
  assert.ok(move, 'this seed has an opening move');
  guestGame.move(move.id, move.dest);
  await flush();
  assert.deepEqual(host.shadow.state, guestGame.state);
  const seen = events(log.host, 'opponent').at(-1);
  assert.equal(seen.name, 'Bob');
  assert.equal(seen.moves, 1);
  assert.equal(seen.score, guestGame.state.score);
});

test('pvp: the guest sees the host numbers, and nobody sees the other deck', async () => {
  const { hostGame, log } = await setup('pvp');
  hostGame.draw();
  await flush();
  const seen = events(log.guest, 'opponent').at(-1);
  assert.equal(seen.moves, 1);
  assert.deepEqual(Object.keys(seen).sort(), ['found', 'moves', 'name', 'score', 'streak']);
});

test('pvp: an action the real game rejects is answered with the true state', async () => {
  const { host, guest, guestGame, log } = await setup('pvp');
  // The guest claims to move a face-down card: it only works on the guest's tampered copy.
  const down = guestGame.state.tableau[6][0];
  guestGame.state.up[down] = true;
  guestGame.onAction = null;
  const dest = { pile: 'tableau', index: 0 };
  const fake = guestGame.state.tableau[0][0];
  guestGame.state.tableau[0].length = 0;
  guest.side.send({ t: 'act', a: { k: 'move', id: down, dest } });
  await flush();
  assert.equal(events(log.guest, 'sync').length, 1);
  assert.deepEqual(guestGame.state, host.shadow.state);
  assert.equal(guestGame.state.tableau[0][0], fake);
});

test('pvp: undo is not available and is refused if asked for anyway', async () => {
  const { host, guest, guestGame, hostGame } = await setup('pvp');
  assert.equal(guestGame.canUndo, false);
  assert.equal(hostGame.canUndo, false);
  guestGame.draw();
  await flush();
  guest.side.send({ t: 'act', a: { k: 'undo' } });
  await flush();
  assert.equal(host.shadow.state.waste.length, 1);
  assert.deepEqual(guestGame.state, host.shadow.state);
});

test('pvp: actions before the clock starts are ignored', async () => {
  const [hl, gl] = loopbackPair();
  const host = new HostMatch({ link: hl, mode: 'pvp', drawCount: 1, heartbeat: false });
  const guest = new GuestMatch({ link: gl, heartbeat: false });
  guest.hello();
  host.startRound(SEED);
  await flush();
  guest.game.draw();
  await flush();
  assert.equal(host.shadow.state.waste.length, 0); // never started
  assert.equal(guest.game.state.waste.length, 0); // and the guest was put right
});

/** A game with only one move left to win: the last king goes home. */
function almostWon(game) {
  const up = Array(52).fill(true);
  const full = [0, 1, 2, 3].map((s) => Array.from({ length: 13 }, (_, i) => s * 13 + i));
  const king = full[0].pop();
  game.state = {
    ...game.state, up, stock: [], waste: [], foundations: full, tableau: [[king], [], [], [], [], [], []],
    score: 300, moves: 100, streak: 0, bestStreak: 4,
  };
}

test('pvp: the first to clear the deal wins, with time and move bonuses', async () => {
  const { host, hostGame, guestGame, log, tick } = await setup('pvp');
  almostWon(host.shadow);
  almostWon(guestGame);
  tick(120);
  const dest = { pile: 'foundation', index: 0 };
  guestGame.move(guestGame.state.tableau[0][0], dest);
  await flush();
  const hostEnd = events(log.host, 'end')[0];
  const guestEnd = events(log.guest, 'end')[0];
  assert.deepEqual(hostEnd, guestEnd);
  assert.equal(hostEnd.winner, 1);
  assert.equal(hostEnd.reason, 'cleared');
  const [h, g] = hostEnd.players;
  assert.equal(g.finished, true);
  assert.equal(g.seconds, 120);
  assert.equal(g.timeBonus, 2120); // 3000 * 0.5^(120/240), rounded to tens
  assert.equal(g.total, g.score + g.timeBonus + g.moveBonus);
  assert.equal(h.finished, false);
  assert.equal(h.total, h.score); // no bonuses for not finishing
  assert.equal(hostGame.isWon(), false);
});

test('pvp: faster and leaner means a higher final score', async () => {
  const run = async (seconds, moves) => {
    const { host, guestGame, log, tick } = await setup('pvp');
    almostWon(host.shadow);
    almostWon(guestGame);
    host.shadow.state.moves = guestGame.state.moves = moves;
    tick(seconds);
    guestGame.move(guestGame.state.tableau[0][0], { pile: 'foundation', index: 0 });
    await flush();
    return events(log.host, 'end')[0].players[1].total;
  };
  const quick = await run(90, 90);
  assert.ok(quick > (await run(300, 90)), 'slower is worth less');
  assert.ok(quick > (await run(90, 200)), 'more moves is worth less');
});

test('pvp: resigning gives the win to the other player', async () => {
  const { guest, log } = await setup('pvp');
  guest.resign();
  await flush();
  const end = events(log.guest, 'end')[0];
  assert.equal(end.winner, 0);
  assert.equal(end.reason, 'resign');
});

test('pvp: when both players are stuck, the higher score wins', async () => {
  const { host, guest, log } = await setup('pvp');
  host.game.state.score = 90;
  host.shadow.state.score = 40;
  host.setStuck(true);
  guest.setStuck(true);
  await flush();
  const end = events(log.host, 'end')[0];
  assert.equal(end.reason, 'stuck');
  assert.equal(end.winner, 0);
});

test('pvp: being stuck alone does not end the round, and getting unstuck is possible', async () => {
  const { host, guest, log } = await setup('pvp');
  guest.setStuck(true);
  await flush();
  assert.equal(events(log.host, 'end').length, 0);
  guest.setStuck(false);
  await flush(); // the host hears about it before it is stuck itself
  host.setStuck(true);
  await flush();
  assert.equal(events(log.host, 'end').length, 0);
});

test('pvp: the other player leaving mid-round is a win', async () => {
  const { guest, log, guestLink } = await setup('pvp');
  guestLink.close();
  await flush();
  const end = events(log.host, 'end')[0];
  assert.equal(end.winner, 0);
  assert.equal(end.reason, 'left');
  assert.equal(events(log.host, 'closed').length, 1);
});

// ---- co-op ---------------------------------------------------------------------------------------

test('coop: the guest moves a card on the one shared game', async () => {
  const { host, hostGame, guestGame, log } = await setup('coop');
  const move = anyMove(guestGame);
  guestGame.move(move.id, move.dest);
  await flush();
  assert.deepEqual(hostGame.state, guestGame.state);
  assert.equal(events(log.host, 'remote').length, 1);
  assert.equal(host.contrib[1], 1);
});

test('coop: the host moves and the guest sees the same game', async () => {
  const { hostGame, guestGame, log } = await setup('coop');
  hostGame.draw();
  hostGame.draw();
  await flush();
  assert.deepEqual(guestGame.state, hostGame.state);
  assert.equal(events(log.guest, 'sync').length, 2);
});

test('coop: a conflicting move is undone on the guest and the host state wins', async () => {
  const { hostGame, guestGame } = await setup('coop');
  const move = anyMove(hostGame);
  // Both grab the same card at the same moment.
  hostGame.move(move.id, move.dest);
  guestGame.move(move.id, move.dest);
  await flush();
  assert.deepEqual(guestGame.state, hostGame.state);
  assert.equal(hostGame.state.moves, 1); // applied once
});

test('coop: a stale action from the guest is rejected and the guest is corrected', async () => {
  const { host, hostGame, guestGame, log } = await setup('coop');
  const move = anyMove(hostGame);
  hostGame.move(move.id, move.dest);
  // The guest has not heard about it yet and tries the same card again (host state rejects it).
  guestGame.replaceState(JSON.parse(JSON.stringify(Klondike.newGame({ seed: SEED }).state)), { canUndo: false });
  guestGame.move(move.id, move.dest);
  await flush();
  assert.deepEqual(guestGame.state, hostGame.state);
  assert.ok(events(log.guest, 'sync').some((s) => s.reject));
  assert.equal(host.contrib[1], 0);
});

test('coop: undo goes through the host, from either player', async () => {
  const { hostGame, guestGame } = await setup('coop');
  assert.equal(guestGame.canUndo, false);
  hostGame.draw();
  await flush();
  assert.equal(guestGame.canUndo, true);
  guestGame.undo();
  await flush();
  assert.equal(hostGame.state.waste.length, 0);
  assert.deepEqual(guestGame.state, hostGame.state);
  assert.equal(guestGame.canUndo, false);
  guestGame.draw();
  await flush();
  hostGame.undo();
  await flush();
  assert.deepEqual(guestGame.state, hostGame.state);
});

test('coop: solving it together ends the round for both, one shared score', async () => {
  const { host, hostGame, guestGame, log, tick } = await setup('coop');
  almostWon(hostGame);
  almostWon(guestGame);
  tick(200);
  guestGame.move(guestGame.state.tableau[0][0], { pile: 'foundation', index: 0 });
  await flush();
  const a = events(log.host, 'end')[0];
  const b = events(log.guest, 'end')[0];
  assert.deepEqual(a, b);
  assert.equal(a.reason, 'cleared');
  assert.equal(a.players.length, 1);
  assert.equal(a.players[0].finished, true);
  assert.equal(a.players[0].seconds, 200);
  assert.deepEqual(a.contrib.map((c) => c.name), ['Ada', 'Bob']);
});

test('coop: giving up ends the round without a winner', async () => {
  const { host, log } = await setup('coop');
  host.resign();
  await flush();
  const end = events(log.guest, 'end')[0];
  assert.equal(end.winner, -1);
  assert.equal(end.reason, 'resign');
  assert.equal(end.players[0].finished, false);
});

// ---- rematch & robustness --------------------------------------------------------------------------------

test('a rematch is a fresh round with a fresh deal', async () => {
  const { host, guest, log } = await setup('pvp');
  guest.requestRematch();
  await flush();
  assert.equal(events(log.host, 'rematch').length, 1);
  host.resign();
  await flush();
  host.startRound(777);
  await flush();
  const starts = events(log.guest, 'start');
  assert.equal(starts.length, 2);
  assert.equal(starts[1].round, 2);
  assert.deepEqual(starts[1].game.state.tableau, Klondike.newGame({ seed: 777 }).state.tableau);
  assert.equal(host.ended, false);
});

test('garbage on the wire does not break anything', async () => {
  const { host, guest, guestLink, hostLink, hostGame, guestGame } = await setup('coop');
  for (const junk of [null, 5, 'x', { t: 5 }, { t: 'act' }, { t: 'act', a: { k: 'move', id: 'a' } }, { t: 'sync', state: { nope: true } }, { t: 'resync' }, { t: 'end' }]) {
    guestLink.send(junk);
    hostLink.send(junk);
  }
  await flush();
  assert.ok(isValidState(hostGame.state));
  assert.ok(isValidState(guestGame.state));
});

test('a silent connection is dropped by the heartbeat', async () => {
  const [hl, gl] = loopbackPair();
  let clock = 0;
  const host = new HostMatch({ link: hl, mode: 'pvp', drawCount: 1, now: () => clock });
  let closed = 0;
  host.on('closed', () => closed++);
  clock = 60_000;
  await new Promise((r) => setTimeout(r, 4200)); // one real heartbeat tick
  assert.equal(closed, 1);
  host.destroy();
});

test('SyncedGame: local actions are reported, remote ones are not', () => {
  const seen = [];
  const g = SyncedGame.create({ seed: 3, drawCount: 1 });
  g.onAction = (a) => seen.push(a.k);
  g.draw();
  g.applyRemote({ k: 'draw' });
  assert.deepEqual(seen, ['draw']);
  assert.equal(g.state.waste.length, 2);
});
