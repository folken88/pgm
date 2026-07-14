/**
 * Combat banter (Tobias 2026-07-13: the cast was silent in combat — my turn
 * pacing regressed it, since maybeBanter only ran from action(), not paced AI
 * turns). Now it fires from run.onUpdate too, with an instant voiced line pool.
 */
const { test } = require('node:test');
const assert = require('node:assert');
const accounts = require('../src/accounts');
const session = require('../src/session');

function partyWithCompanion(tag) {
  session._reset();
  const uniq = tag + process.pid + Date.now();
  const a = accounts.signIn(uniq, 'pw');
  const c = session.createDelve({ name: uniq, icon: 'X', delveName: 'Quip Delve', account: a.name });
  session.setCharacter(c.clientId, { race: 'human', cls: 'fighter' });
  session.addCompanion(c.clientId, 'Jason');   // a known AI companion with a voice
  session.startRun(c.clientId);
  return c;
}

test('a foe slain triggers a triumphant quip in a living companion voice', () => {
  const c = partyWithCompanion('foe');
  const realRandom = Math.random;
  Math.random = () => 0;   // force the 60% gate + deterministic picks
  try {
    const line = session._bantForTest(c.clientId, '☠️ Kobold is slain!');
    assert.ok(line, 'a banter line was produced');
    assert.strictEqual(line.priority, 'banter', 'tagged as banter (spoken in-voice)');
    assert.match(line.text, /^💬 /, 'formatted as a companion speaking');
    assert.ok(/one less|Down you go|Next|too easy|Stay down|next|Cleared|done|Rest now|Scratch|packing|moving/.test(line.text), 'a FOE-kill quip: ' + line.text);
  } finally { Math.random = realRandom; }
});

test('an ally down triggers a rallying quip, not a triumphant one', () => {
  const c = partyWithCompanion('ally');
  const realRandom = Math.random;
  Math.random = () => 0;
  try {
    const line = session._bantForTest(c.clientId, 'PackTest is DEAD — beyond mortal aid until raised.');
    assert.ok(line, 'a banter line was produced');
    assert.ok(/get up|help them|got you|losing anyone|Cover them|Stay with us|fight on|up, now/.test(line.text), 'a rally quip: ' + line.text);
  } finally { Math.random = realRandom; }
});

test('banter is throttled to at most once per round', () => {
  const c = partyWithCompanion('throttle');
  const realRandom = Math.random;
  Math.random = () => 0;
  try {
    const first = session._bantForTest(c.clientId, '☠️ Goblin is slain!');
    const second = session._bantForTest(c.clientId, '☠️ Kobold is slain!');
    assert.ok(first, 'first quip fires');
    assert.strictEqual(second, null, 'a second quip in the same round is suppressed');
  } finally { Math.random = realRandom; }
});
