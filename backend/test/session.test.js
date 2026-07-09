const { test, beforeEach } = require('node:test');
const assert = require('node:assert');
const session = require('../src/session');

beforeEach(() => session._reset());

test('players and spectators join and appear in the snapshot', () => {
  const a = session.join({ name: 'Kara', icon: '⚔️', role: 'player' });
  const b = session.join({ name: 'Watcher', icon: '👁️', role: 'spectator' });
  assert.ok(a.ok && a.clientId);
  assert.ok(b.ok);
  const s = session.snapshot();
  assert.strictEqual(s.counts.players, 1);
  assert.strictEqual(s.counts.spectators, 1);
  assert.strictEqual(s.players[0].name, 'Kara');
});

test('player cap is 8; the 9th is refused and offered spectating', () => {
  for (let i = 0; i < 8; i++) assert.ok(session.join({ name: 'P' + i, role: 'player' }).ok);
  const overflow = session.join({ name: 'P9', role: 'player' });
  assert.strictEqual(overflow.ok, false);
  assert.strictEqual(overflow.canSpectate, true);
  assert.match(overflow.error, /full/i);
});

test('spectator cap is 10', () => {
  for (let i = 0; i < 10; i++) assert.ok(session.join({ name: 'S' + i, role: 'spectator' }).ok);
  assert.strictEqual(session.join({ name: 'S11', role: 'spectator' }).ok, false);
});

test('setCharacter readies a player with a real derived character', () => {
  const p = session.join({ name: 'Fen', icon: '🗡️', role: 'player' });
  const r = session.setCharacter(p.clientId, { race: 'human', cls: 'rogue', skills: ['perception', 'stealth'] });
  assert.ok(r.ok);
  const me = session.snapshot().players[0];
  assert.strictEqual(me.ready, true);
  assert.strictEqual(me.cls, 'rogue');
});

test('startRun needs a ready player and flips phase to playing', () => {
  const p = session.join({ name: 'Bron', role: 'player' });
  assert.strictEqual(session.startRun(p.clientId).ok, false, 'no ready character yet');
  session.setCharacter(p.clientId, { race: 'half-orc', cls: 'barbarian' });
  assert.ok(session.startRun(p.clientId).ok);
  assert.strictEqual(session.snapshot().phase, 'playing');
});

test('a spectator cannot start the run', () => {
  const p = session.join({ name: 'Bron', role: 'player' });
  session.setCharacter(p.clientId, { race: 'human', cls: 'fighter' });
  const spec = session.join({ name: 'Nosy', role: 'spectator' });
  assert.strictEqual(session.startRun(spec.clientId).ok, false);
});

test('when everyone leaves, the session resets to a fresh lobby', () => {
  const p = session.join({ name: 'Solo', role: 'player' });
  session.setCharacter(p.clientId, { race: 'human', cls: 'fighter' });
  session.startRun(p.clientId);
  session.leave(p.clientId);
  const s = session.snapshot();
  assert.strictEqual(s.phase, 'lobby');
  assert.strictEqual(s.counts.players, 0);
});
