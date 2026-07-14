/**
 * Raise Dead (Tobias 2026-07-13): only offered when someone's actually dead
 * (on their card, at the pub) — and casting it plays the Breath of Life revive
 * sound. The in-dungeon shop no longer sells the raise-dead component.
 */
const { test } = require('node:test');
const assert = require('node:assert');
const session = require('../src/session');
const accounts = require('../src/accounts');
const items = require('../src/items');

function pubWithDead(tag) {
  session._reset();
  const uniq = tag + process.pid + Date.now();
  const a = accounts.signIn(uniq, 'pw');
  const c = session.createDelve({ name: uniq, icon: 'X', delveName: 'Raise', account: a.name });
  session.setCharacter(c.clientId, { race: 'human', cls: 'fighter' });
  session.startRun(c.clientId);
  const s = session._testInternals(c.clientId);
  s.phase = 'pub';
  const m = [...s.members.values()].find(x => !x.ai);
  m.dead = true;
  return { c, s, m };
}

test('raising a dead party member returns the Breath of Life sound + clears death', () => {
  const { c, s, m } = pubWithDead('raise');
  session._devSetPurse(s, 10000);
  const r = session.pubBuy(c.clientId, 'raisedead', m.name);
  assert.ok(r.ok, r.error);
  assert.strictEqual(r.sound, '/audio/spell_revive.mp3', 'the revive/breath-of-life sound is returned to play');
  assert.strictEqual(m.dead, false, 'the member is alive again');
  assert.ok(m.negLevels >= 2, 'PF1 Raise Dead leaves 2 negative levels');
});

test('the client snapshot exposes dead/negLevels so a Raise button can show on the card', () => {
  const { c, s, m } = pubWithDead('mv');
  const snap = session.sessionSnapshotFor(c.clientId);
  const me = snap.members.find(x => x.isYou);
  assert.strictEqual(me.dead, true, 'dead is surfaced to the client');
  assert.ok(snap.pub && snap.pub.services.some(sv => sv.kind === 'raise'), 'the raise service (with cost) is available at the pub');
});

test('the in-dungeon shop does not sell the Raise Dead component', () => {
  assert.ok(!items.SHOP_STOCK.some(x => x.key === 'diamond'), 'no raise-dead diamond in the shop');
  assert.ok(items.SHOP_STOCK.some(x => x.key === 'diamond_dust'), 'restoration dust is still sold');
});
