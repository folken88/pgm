/**
 * Resume your OWN in-progress delve (Tobias 2026-07-13: "I was unable to resume
 * my spot in my own delve"). A reload loses the browser's clientId, so a ghost
 * client is left holding the seat and the old reclaim path saw it as "claimed"
 * and offered only spectate. An ACCOUNT match now proves it's the same person
 * returning → reclaim + evict the stale session. A name-only stranger still can't
 * boot an active player.
 */
const { test } = require('node:test');
const assert = require('node:assert');
const accounts = require('../src/accounts');
const session = require('../src/session');

function startedDelve(tag) {
  session._reset();
  const uniq = tag + process.pid + Date.now();
  const a = accounts.signIn(uniq, 'pw');
  const c = session.createDelve({ name: uniq, icon: 'X', delveName: 'PLUG UGLY', account: a.name });
  session.setCharacter(c.clientId, { race: 'human', cls: 'sorcerer' });
  session.startRun(c.clientId);
  return { uniq, a, c };
}

test('the owner can rejoin their own running delve even though a stale client holds the seat', () => {
  const { uniq, a, c } = startedDelve('resume');
  // c.clientId still "holds" the host seat (a reload left it a ghost). Resume:
  const rejoin = session.joinDelve(c.sessionId, { name: uniq, icon: 'X', role: 'player', account: a.name });
  assert.ok(rejoin.ok, 'rejoin should succeed, got: ' + rejoin.error);
  assert.ok(rejoin.reclaimed, 'the seat was reclaimed');
  assert.notStrictEqual(rejoin.clientId, c.clientId, 'a fresh clientId was issued');
  // The new client is bound to the SAME in-run identity (memberId) as the seat.
  assert.strictEqual(session.snapshotFor(rejoin.clientId).you.name, 'PLUG UGLY', 'lands back in their own delve');
});

test('a stranger cannot boot an active player from a running delve (spectate offered)', () => {
  const { c } = startedDelve('stranger');
  const stranger = session.joinDelve(c.sessionId, { name: 'Randerson', icon: 'Y', role: 'player' });   // no account, different name
  assert.ok(!stranger.ok, 'stranger is refused a player seat');
  assert.ok(stranger.canSpectate, 'but is offered a spectate');
});
