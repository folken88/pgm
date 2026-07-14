/**
 * Delete a delve (Tobias 2026-07-13). Owner-gated for players (confirm is a
 * client concern); a no-auth admin path (localhost-only in server.js) removes any.
 */
const { test } = require('node:test');
const assert = require('node:assert');
const session = require('../src/session');
const accounts = require('../src/accounts');

function delve(tag, pw) {
  const uniq = tag + process.pid + Date.now() + Math.floor(Math.random() * 1e6);
  const a = accounts.signIn(uniq, pw);
  const c = session.createDelve({ name: uniq, icon: 'X', delveName: tag + '-delve', account: a.name });
  return { uniq, a, c };
}

test('the owner can delete their delve; it vanishes from the summaries', () => {
  session._reset();
  const { a, c } = delve('own', 'pw');
  assert.ok(session.allSummaries().some(s => s.id === c.sessionId), 'delve exists');
  const r = session.removeDelve(c.clientId, c.sessionId, a.name);
  assert.ok(r.ok, r.error);
  assert.ok(!session.allSummaries().some(s => s.id === c.sessionId), 'delve is gone');
});

test('a non-owner cannot delete someone else’s delve', () => {
  session._reset();
  const { c } = delve('victim', 'pw');
  const other = accounts.signIn('stranger' + process.pid, 'pw');
  const r = session.removeDelve('someClient', c.sessionId, other.name);
  assert.ok(!r.ok, 'refused');
  assert.match(r.error, /owner/);
  assert.ok(session.allSummaries().some(s => s.id === c.sessionId), 'delve still there');
});

test('the admin path deletes any delve without auth (localhost gate is in server.js)', () => {
  session._reset();
  const { c } = delve('admin', 'pw');
  const list = session.adminListDelves();
  assert.ok(list.some(x => x.id === c.sessionId && x.hostAccount), 'admin list carries id + owner');
  assert.strictEqual(session.deleteDelve(c.sessionId), true);
  assert.ok(!session.allSummaries().some(s => s.id === c.sessionId), 'gone');
  assert.strictEqual(session.deleteDelve('nope'), false, 'unknown id → false');
});

test('summaries expose hostAccount so the owner sees a Delete button', () => {
  session._reset();
  const { a, c } = delve('sum', 'pw');
  const sum = session.allSummaries().find(s => s.id === c.sessionId);
  assert.strictEqual(sum.hostAccount, accounts.keyOf(a.name), 'hostAccount = the owner account key');
});
