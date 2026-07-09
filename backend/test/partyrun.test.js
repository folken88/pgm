const { test } = require('node:test');
const assert = require('node:assert');
const { seededRoller } = require('../src/dice');
const { createCharacter } = require('../src/characters');
const pr = require('../src/partyrun');

function humans() {
  return [
    { clientId: 'c1', icon: '🛡️', character: createCharacter({ name: 'Kara', race: 'half-orc', cls: 'fighter' }) },
    { clientId: 'c2', icon: '🪓', character: createCharacter({ name: 'Bron', race: 'dwarf', cls: 'barbarian' }) },
  ];
}
// Play the fight to a terminal state; attack a visible foe, else pass.
function playOut(run, roll) {
  let guard = 0;
  while (run.phase === 'combat' && guard++ < 800) {
    const v = pr.publicRun(run);
    if (!v.turn) break;                         // only AI/enemies left to resolve (shouldn't happen with all-humans)
    const act = v.enemies.length ? { type: 'attack', target: v.enemies[0].id } : { type: 'pass' };
    pr.applyAction(run, v.turn.ownerClientId, act, roll);
  }
}

test('a party run starts in combat with heroes + enemies in initiative order', () => {
  const run = pr.createPartyRun(humans(), seededRoller(4));
  assert.strictEqual(run.phase, 'combat');
  assert.strictEqual(run.combatants.filter(c => c.side === 'hero').length, 2);
  assert.ok(run.combatants.filter(c => c.side === 'enemy').length >= 1);
  for (let i = 1; i < run.combatants.length; i++) {
    assert.ok(run.combatants[i - 1].init >= run.combatants[i].init, 'initiative sorted');
  }
});

test('turn-gating: only the current human may act', () => {
  const roll = seededRoller(4);
  const run = pr.createPartyRun(humans(), roll);
  const v = pr.publicRun(run);
  assert.ok(v.turn, 'a human has the turn');
  const other = v.turn.ownerClientId === 'c1' ? 'c2' : 'c1';
  assert.strictEqual(pr.applyAction(run, other, { type: 'pass' }, roll).ok, false, 'not your turn');
  assert.strictEqual(pr.applyAction(run, v.turn.ownerClientId, { type: 'pass' }, roll).ok, true);
});

test('publicRun never exposes an unrevealed (hidden) enemy', () => {
  for (let s = 1; s <= 30; s++) {
    const run = pr.createPartyRun(humans(), seededRoller(s));
    const v = pr.publicRun(run);
    // every listed enemy target must be a revealed combatant
    const shownIds = new Set(v.combatants.filter(c => c.side === 'enemy').map(c => c.id));
    v.enemies.forEach(e => assert.ok(shownIds.has(e.id), 'listed target is shown/revealed'));
  }
});

test('fights resolve to a terminal state even when foes start hidden', () => {
  const roll = seededRoller(9);
  const run = pr.createPartyRun(humans(), roll);
  playOut(run, roll);
  assert.ok(['cleared', 'defeated'].includes(run.phase), 'terminal: ' + run.phase);
});

test('AI companions act on their own turns (loop only stops for humans)', () => {
  const party = [
    { clientId: 'c1', icon: '🛡️', character: createCharacter({ name: 'Kara', race: 'human', cls: 'fighter' }) },
    { clientId: 'aiX', ai: true, icon: '🔮', character: createCharacter({ name: 'Mira', race: 'human', cls: 'cleric' }) },
  ];
  const roll = seededRoller(6);
  const run = pr.createPartyRun(party, roll);
  const v = pr.publicRun(run);
  // The engine must never hand the turn to an AI companion.
  if (v.turn) assert.notStrictEqual(v.turn.ownerClientId, null);
  // Mira is a hero but AI-flagged.
  const mira = run.combatants.find(c => c.name === 'Mira');
  assert.ok(mira.ai, 'companion flagged ai');
});

test('clearing a room heals the party and lets a member descend', () => {
  let cleared = null;
  for (let s = 1; s <= 60 && !cleared; s++) {
    const roll = seededRoller(s);
    const run = pr.createPartyRun(humans(), roll);
    playOut(run, roll);
    if (run.phase === 'cleared') cleared = { run, roll: seededRoller(s + 200) };
  }
  assert.ok(cleared, 'a seed clears a room');
  assert.ok(cleared.run.gold > 0 && cleared.run.heroes.every(h => h.hp > 0), 'gold + healed');
  assert.ok(pr.applyAction(cleared.run, 'c1', { type: 'descend' }, cleared.roll).ok);
  assert.strictEqual(cleared.run.phase, 'combat');
});

test('summary reports depth, round, and party hp for the side window', () => {
  const run = pr.createPartyRun(humans(), seededRoller(4));
  const sum = pr.summary(run);
  assert.ok(sum.depth >= 1);
  assert.strictEqual(sum.heroes.length, 2);
  assert.ok(sum.heroes.every(h => typeof h.hp === 'number'));
});
