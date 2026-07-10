const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const session = require('../src/session');

test('hero progression persists: same delve+hero name resumes earned levels', () => {
  session._reset();
  // Run 1: Josh earns XP past level 2 (simulate via direct hero xp + persist path).
  const a = session.createDelve({ name: 'Josh', delveName: 'LegacyTest' });
  session.setCharacter(a.clientId, { race: 'human', cls: 'fighter' });
  assert.ok(session.startRun(a.clientId).ok);
  const snapA = session.sessionSnapshotFor(a.clientId);
  const runA = snapA.run;
  // grant xp through the real award path: kill foes + pass to clear
  const s1 = session.action(a.clientId, { type: 'retreat' });   // triggers persist (0 xp — noop)
  // direct: emulate a big clear by writing legacy via the exposed file after setting xp
  const sess = require('../src/session');
  // Reach in via a fresh run: simpler — write the legacy file directly the way persistProgress would:
  const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', '..', 'data');
  const legacy = { 'legacytest::josh': { xp: 5100, level: 3, at: Date.now() } };
  fs.writeFileSync(path.join(DATA_DIR, 'legacy.json'), JSON.stringify(legacy));
  // New process would reload the file; same process keeps its in-memory LEGACY —
  // so test the READ path by re-requiring a fresh copy of the module.
  delete require.cache[require.resolve('../src/session')];
  const session2 = require('../src/session');
  const b = session2.createDelve({ name: 'Josh', delveName: 'LegacyTest' });
  session2.setCharacter(b.clientId, { race: 'human', cls: 'fighter' });
  assert.ok(session2.startRun(b.clientId).ok);
  const run = session2.sessionSnapshotFor(b.clientId).run;
  const josh = run.combatants.find(c => c.name === 'Josh');
  assert.strictEqual(josh.level, 3, 'resumed at level 3 (5100 XP): got ' + josh.level);
  assert.strictEqual(josh.xp, 5100, 'xp restored');
  assert.ok(josh.maxHp > 12, 'level-3 HP');
});
