const { test } = require('node:test');
const assert = require('node:assert');
const cast = require('../src/cast');
const session = require('../src/session');

test('EVERY cast member builds as a valid level-1 PGM character', () => {
  for (const r of cast.ROSTER) {
    const b = cast.buildCompanion(r.name);
    assert.ok(b, r.name + ' builds');
    const c = b.character;
    assert.ok(c.maxHp > 0, r.name + ' has HP');
    assert.ok(c.derived.bab >= 0 && c.ac >= 8, r.name + ' derived sanely');
    assert.strictEqual(c.cls, r.cls, r.name + ' keeps their poker class');
    assert.ok((c.skillSheet || []).some(s => s.key === 'perception' && s.ranks > 0),
      r.name + ' has the Perception house-rule rank');
  }
  assert.ok(cast.ROSTER.length >= 50, 'the full cast came over: ' + cast.ROSTER.length);
});

test('cast companions join a delve by name and cannot double-join', () => {
  session._reset();
  const host = session.createDelve({ name: 'Josh' });
  session.setCharacter(host.clientId, { race: 'human', cls: 'fighter' });
  assert.ok(session.addCompanion(host.clientId, "J'Mal").ok, "J'Mal joins");
  assert.ok(session.addCompanion(host.clientId, 'Femmik Embersword').ok, 'Femmik joins');
  assert.strictEqual(session.addCompanion(host.clientId, "J'Mal").ok, false, 'no duplicate J\'Mal');
  const snap = session.sessionSnapshotFor(host.clientId);
  assert.strictEqual(snap.counts.party, 3);
  assert.ok(session.startRun(host.clientId).ok, 'the cast party delves');
  const run = session.sessionSnapshotFor(host.clientId).run;
  assert.ok(run.combatants.some(c => c.name === "J'Mal"), "J'Mal fights");
});
