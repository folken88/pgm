/**
 * Off-turn action queue (poker parity, 2026-07-12). In a multi-human party a
 * player may pre-load a move while it's someone else's turn; it fires the
 * instant their turn arrives, last-queue-wins, fizzles hand back live, and
 * dying wipes the pre-load.
 */
const { test } = require('node:test');
const assert = require('node:assert');
const pr = require('../src/partyrun');
const { createCharacter } = require('../src/characters');
const { seededRoller } = require('../src/dice');
const pf1 = require('../src/pf1core');

function duo(seed) {
  const roll = seededRoller(seed);
  const run = pr.createPartyRun([
    { clientId: 'A', icon: 'X', character: createCharacter({ name: 'Alice', race: 'human', cls: 'fighter' }) },
    { clientId: 'B', icon: 'Y', character: createCharacter({ name: 'Bob', race: 'human', cls: 'fighter' }) },
  ], roll);
  pr.applyAction(run, 'A', { type: 'initiative' }, roll);
  const curOwner = run.combatants[run.turnIndex].ownerClientId;
  return { run, roll, curOwner, other: curOwner === 'A' ? 'B' : 'A' };
}

test('a pre-loaded action fires when your turn arrives', () => {
  const { run, roll, curOwner, other } = duo(12);
  const foe = run.combatants.find(c => c.side === 'enemy'); foe.hp = 200; foe.maxHp = 200;
  const q = pr.applyAction(run, other, { type: 'attack', target: foe.id }, roll);
  assert.ok(q.ok && q.queued, 'queued off-turn');
  const before = run.log.length;
  pr.applyAction(run, curOwner, { type: 'pass' }, roll);
  const fresh = run.log.slice(before).map(e => e.text);
  assert.ok(fresh.some(t => /pre-loaded .*triggers/.test(t)), 'queue auto-fired: ' + fresh.join(' | '));
});

test('queueing again replaces the earlier pick (last wins)', () => {
  const { run, other } = duo(12);
  pr.applyAction(run, other, { type: 'pass' });
  const mine = run.heroes.find(h => h.ownerClientId === other);
  assert.strictEqual(mine.queuedAction.label, 'hold');
  pr.applyAction(run, other, { type: 'attack' });
  assert.strictEqual(mine.queuedAction.label, 'attack');
});

test('a fizzled queue hands the turn back live', () => {
  const { run, roll, curOwner, other } = duo(12);
  const foe2 = run.shim._makeEnemyPGM(pf1.monsters.MON['goblin']);
  foe2.key = 'goblin'; foe2.revealed = true; run.combatants.push(foe2);
  const foe = run.combatants.find(c => c.side === 'enemy' && c.name === 'Kobold');
  pr.applyAction(run, other, { type: 'attack', target: foe.id }, roll);
  foe.hp = 0; foe.down = true;   // queued target dies before their turn
  const before = run.log.length;
  pr.applyAction(run, curOwner, { type: 'pass' }, roll);
  const fresh = run.log.slice(before).map(e => e.text);
  assert.ok(fresh.some(t => /fizzled/.test(t)), 'fizzle handed back: ' + fresh.join(' | '));
});

test('going down wipes a pre-loaded action', () => {
  const { run, other } = duo(12);
  pr.applyAction(run, other, { type: 'attack' });
  const mine = run.heroes.find(h => h.ownerClientId === other);
  assert.ok(mine.queuedAction, 'queued');
  mine.hp = 0;   // drop them
  pr.applyAction(run, run.combatants[run.turnIndex].ownerClientId, { type: 'pass' });
  assert.strictEqual(mine.queuedAction, null, 'pre-load wiped on down');
});
