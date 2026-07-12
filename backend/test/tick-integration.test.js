const { test } = require('node:test');
const assert = require('node:assert');
const { seededRoller } = require('../src/dice');
const { createCharacter } = require('../src/characters');
const pr = require('../src/partyrun');

// Initiative is now the PLAYERS' roll (Tobias 2026-07-11): tests roll it
// immediately after run creation / each descend so combat proceeds as before.
function rollInit(run, roll) {
  if (run.phase !== 'initiative') return;
  const human = run.heroes.find(h => h.ownerClientId);
  require('../src/partyrun').applyAction(run, human && human.ownerClientId, { type: 'initiative' }, roll);
}


function party() {
  return [{ clientId: 'c1', icon: '🛡️', character: createCharacter({ name: 'Kara', race: 'human', cls: 'fighter' }) }];
}

test('a HELD enemy loses its turns (re-save each round) instead of acting forever', () => {
  const roll = seededRoller(4);
  const run = pr.createPartyRun(party(), roll); rollInit(run, roll);
  const foe = run.combatants.find(c => c.side === 'enemy');
  foe.revealed = true;
  foe.paralyzed = 3; foe.heldDC = 40; foe.fort = 0; foe.reflex = 0;   // will ~0 vs DC 40 — only nat 20 or expiry frees it
  // Play a few of Kara's turns passing; the foe should never land a hit while held.
  let guard = 0;
  while (guard++ < 4 && run.phase === 'combat' && foe.paralyzed > 0) {
    const v = pr.publicRun(run);
    if (!v.turn) break;
    pr.applyAction(run, v.turn.ownerClientId, { type: 'pass' }, roll);
  }
  assert.ok(run.log.some(e => /HELD|paralyzed|wrenches free|fading hold/i.test(e.text)),
    'held-turn narration present: ' + run.log.map(e => e.text).join(' | '));
  assert.ok(!run.log.some(e => new RegExp(foe.name + ' hits').test(e.text) && run.log.indexOf(e) > 2),
    'the held foe never attacked while held');
});

test('a nauseated enemy recovers after its rounds tick down', () => {
  const roll = seededRoller(9);
  const run = pr.createPartyRun(party(), roll); rollInit(run, roll);
  const foe = run.combatants.find(c => c.side === 'enemy');
  foe.revealed = true; foe.nauseated = 2;
  let guard = 0;
  while (guard++ < 5 && run.phase === 'combat' && foe.nauseated > 0) {
    const v = pr.publicRun(run); if (!v.turn) break;
    pr.applyAction(run, v.turn.ownerClientId, { type: 'pass' }, roll);
  }
  assert.strictEqual(foe.nauseated, 0, 'nausea ticked away');
  assert.ok(run.log.some(e => /retches/i.test(e.text)), 'nausea narrated');
});

test('acid DoT from a spell burns the foe at its turn start', () => {
  const roll = seededRoller(2);
  const run = pr.createPartyRun(party(), roll); rollInit(run, roll);
  const foe = run.combatants.find(c => c.side === 'enemy');
  foe.revealed = true; foe.hp = 12; foe.maxHp = 12;
  foe.acid = { rounds: 2, dice: 1, die: 6 };
  const before = foe.hp;
  let guard = 0;
  while (guard++ < 3 && run.phase === 'combat' && foe.acid) {
    const v = pr.publicRun(run); if (!v.turn) break;
    pr.applyAction(run, v.turn.ownerClientId, { type: 'pass' }, roll);
  }
  assert.ok(foe.hp < before, 'acid dealt damage over turns');
  assert.ok(run.log.some(e => /Acid keeps sizzling/i.test(e.text)), 'DoT narrated');
});
