const { test, beforeEach } = require('node:test');
const assert = require('node:assert');
const session = require('../src/session');

beforeEach(() => session._reset());

test('creating a delve makes a host player and a session', () => {
  const r = session.createDelve({ name: 'Josh', icon: '⚔️', delveName: 'Deep Dark' });
  assert.ok(r.ok && r.clientId && r.sessionId);
  const snap = session.sessionSnapshotFor(r.clientId);
  assert.strictEqual(snap.name, 'Deep Dark');
  assert.strictEqual(snap.youAreHost, true);
  assert.strictEqual(snap.counts.party, 1);
});

test('two delves run concurrently and independently', () => {
  const a = session.createDelve({ name: 'Josh' });
  const b = session.createDelve({ name: 'Tim' });
  assert.notStrictEqual(a.sessionId, b.sessionId);
  const sums = session.allSummaries();
  assert.strictEqual(sums.length, 2);
});

test('a player can join an existing delve; a stranger can spectate', () => {
  const host = session.createDelve({ name: 'Tim' });
  const joiner = session.joinDelve(host.sessionId, { name: 'Chris', role: 'player' });
  assert.ok(joiner.ok);
  assert.strictEqual(session.sessionSnapshotFor(host.clientId).counts.party, 2);
  const watcher = session.joinDelve(host.sessionId, { name: 'Nosy', role: 'spectator' });
  assert.ok(watcher.ok);
  assert.strictEqual(session.sessionSnapshotFor(host.clientId).counts.spectators, 1);
});

test('the host can add AI companions; they count toward the party', () => {
  const host = session.createDelve({ name: 'Josh' });
  session.setCharacter(host.clientId, { race: 'human', cls: 'fighter' });
  assert.ok(session.addCompanion(host.clientId, 0).ok);
  assert.ok(session.addCompanion(host.clientId, 1).ok);
  assert.ok(session.addCompanion(host.clientId, 2).ok);
  const snap = session.sessionSnapshotFor(host.clientId);
  assert.strictEqual(snap.counts.party, 4, 'host + 3 companions');
  assert.strictEqual(snap.members.filter(m => m.ai).length, 3);
});

test('a non-host cannot add companions', () => {
  const host = session.createDelve({ name: 'Tim' });
  const joiner = session.joinDelve(host.sessionId, { name: 'Chris', role: 'player' });
  assert.strictEqual(session.addCompanion(joiner.clientId, 0).ok, false);
});

test('party cap of 8 (humans + AI) is enforced', () => {
  const host = session.createDelve({ name: 'Josh' });
  session.setCharacter(host.clientId, { race: 'human', cls: 'fighter' });
  for (let i = 0; i < 7; i++) assert.ok(session.addCompanion(host.clientId, i).ok);   // 1 + 7 = 8
  assert.strictEqual(session.addCompanion(host.clientId, 0).ok, false, '9th refused');
});

test('starting a run flips the delve to playing with a party', () => {
  const host = session.createDelve({ name: 'Josh' });
  session.setCharacter(host.clientId, { race: 'half-orc', cls: 'barbarian' });
  session.addCompanion(host.clientId, 0);
  assert.ok(session.startRun(host.clientId).ok);
  const snap = session.sessionSnapshotFor(host.clientId);
  assert.strictEqual(snap.phase, 'playing');
  assert.ok(snap.run && snap.run.combatants.length >= 2);
});

test('snapshotFor gives you your delve + summaries of all delves', () => {
  const a = session.createDelve({ name: 'Josh' });
  session.createDelve({ name: 'Tim' });
  const payload = session.snapshotFor(a.clientId);
  assert.ok(payload.you, 'your delve detail');
  assert.strictEqual(payload.sessions.length, 2, 'all delves summarized');
});

test('a delve with no human members left is cleaned up', () => {
  const host = session.createDelve({ name: 'Solo' });
  session.setCharacter(host.clientId, { race: 'human', cls: 'fighter' });
  session.addCompanion(host.clientId, 0);
  session.leave(host.clientId);
  assert.strictEqual(session.allSummaries().length, 0, 'abandoned delve removed');
});
