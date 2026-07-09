const { test } = require('node:test');
const assert = require('node:assert');
const { seededRoller } = require('../src/dice');
const { createCharacter } = require('../src/characters');
const pr = require('../src/partyrun');

function party() {
  return [
    { clientId: 'c1', icon: '🛡️', character: createCharacter({ name: 'Kara', race: 'half-orc', cls: 'fighter' }) },
    { clientId: 'c2', icon: '🪓', character: createCharacter({ name: 'Bron', race: 'dwarf', cls: 'barbarian' }) },
  ];
}

test('a party run starts in combat with heroes + enemies in initiative order', () => {
  const run = pr.createPartyRun(party(), seededRoller(4));
  assert.strictEqual(run.phase, 'combat');
  const heroes = run.combatants.filter(c => c.side === 'hero');
  const enemies = run.combatants.filter(c => c.side === 'enemy');
  assert.strictEqual(heroes.length, 2);
  assert.ok(enemies.length >= 1);
  // sorted by initiative descending
  for (let i = 1; i < run.combatants.length; i++) {
    assert.ok(run.combatants[i - 1].init >= run.combatants[i].init, 'initiative sorted');
  }
});

test('the engine stops on a hero turn; wrong player is rejected, right one acts', () => {
  const roll = seededRoller(4);
  const run = pr.createPartyRun(party(), roll);
  const view = pr.publicRun(run);
  assert.ok(view.turn, 'someone has the turn');
  const owner = view.turn.ownerClientId;
  const other = owner === 'c1' ? 'c2' : 'c1';
  assert.strictEqual(pr.applyAction(run, other, { type: 'attack' }, roll).ok, false, 'not your turn');
  assert.strictEqual(pr.applyAction(run, owner, { type: 'attack' }, roll).ok, true, 'your turn resolves');
});

test('playing out attacks reaches a terminal phase (cleared or defeated)', () => {
  const roll = seededRoller(9);
  const run = pr.createPartyRun(party(), roll);
  let guard = 0;
  while (run.phase === 'combat' && guard++ < 500) {
    const v = pr.publicRun(run);
    if (!v.turn) break;
    pr.applyAction(run, v.turn.ownerClientId, { type: 'attack' }, roll);
  }
  assert.ok(['cleared', 'defeated'].includes(run.phase), 'reached terminal phase: ' + run.phase);
});

test('clearing a room awards gold, heals the party, and allows descending', () => {
  let cleared = null;
  for (let s = 1; s <= 40 && !cleared; s++) {
    const roll = seededRoller(s);
    const run = pr.createPartyRun(party(), roll);
    let guard = 0;
    while (run.phase === 'combat' && guard++ < 500) {
      const v = pr.publicRun(run); if (!v.turn) break;
      pr.applyAction(run, v.turn.ownerClientId, { type: 'attack' }, roll);
    }
    if (run.phase === 'cleared') cleared = { run, roll: seededRoller(s + 100) };
  }
  assert.ok(cleared, 'at least one seed clears a room');
  assert.ok(cleared.run.gold > 0, 'gold awarded');
  assert.ok(cleared.run.heroes.every(h => h.hp > 0), 'party healed on clear');
  const r = pr.applyAction(cleared.run, 'c1', { type: 'descend' }, cleared.roll);
  assert.ok(r.ok, 'a party member can descend');
  assert.strictEqual(cleared.run.phase, 'combat', 'descending spawns the next room');
});

test('log entries carry increasing seq (so clients speak only new lines)', () => {
  const run = pr.createPartyRun(party(), seededRoller(4));
  const seqs = run.log.map(e => e.seq);
  for (let i = 1; i < seqs.length; i++) assert.ok(seqs[i] > seqs[i - 1], 'seq strictly increases');
});
