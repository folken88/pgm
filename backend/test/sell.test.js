/**
 * Sell anything for 50% of value into the party purse (Tobias 2026-07-13).
 * Free loot action (not turn-gated), works on the party pile AND your own pack,
 * covers gems/art/components/gear — "maybe the party needs money more".
 */
const { test } = require('node:test');
const assert = require('node:assert');
const pr = require('../src/partyrun');
const { createCharacter } = require('../src/characters');
const { seededRoller } = require('../src/dice');

function run1(seed) {
  const roll = seededRoller(seed);
  const run = pr.createPartyRun([{ clientId: 'c1', icon: 'X', character: createCharacter({ name: 'S', race: 'human', cls: 'fighter' }) }], roll);
  pr.applyAction(run, 'c1', { type: 'initiative' }, roll);
  return { run, roll };
}

test('selling a party-pile valuable pays 50% into the party purse and removes it', () => {
  const { run, roll } = run1(3);
  run.inventory.push({ key: 'gem_pearl', qty: 1, party: true });   // 500gp gem
  const before = run.gold;
  const r = pr.applyAction(run, 'c1', { type: 'loot_sell', item: 'gem_pearl' }, roll);
  assert.ok(r.ok, r.error);
  assert.strictEqual(run.gold - before, 250, 'exactly 50% of the 500gp value');
  assert.ok(!run.inventory.some(s => s.key === 'gem_pearl'), 'the gem left the pile');
});

test('a spell component can be sold for 50% (party needs money more)', () => {
  const { run, roll } = run1(4);
  run.inventory.push({ key: 'diamond_dust', qty: 1, party: true });   // 100gp component
  const r = pr.applyAction(run, 'c1', { type: 'loot_sell', item: 'diamond_dust' }, roll);
  assert.ok(r.ok, r.error);
  assert.strictEqual(run.gold, 50, 'diamond dust (100gp) sells for 50');
});

test('selling from your own pack works and does not cost a combat turn', () => {
  const { run, roll } = run1(5);
  const hero = run.heroes[0];
  hero.pack = hero.pack || []; hero.pack.push({ key: 'potion_cmw', qty: 1 });   // 300gp potion
  const idxBefore = run.turnIndex;
  const r = pr.applyAction(run, 'c1', { type: 'loot_sell', item: 'potion_cmw' }, roll);
  assert.ok(r.ok, r.error);
  assert.strictEqual(run.gold, 150, 'CMW potion (300gp) sells for 150');
  assert.strictEqual(run.turnIndex, idxBefore, 'selling is a free action — the turn did not advance');
  assert.ok(!hero.pack.some(s => s.key === 'potion_cmw'), 'the potion left the pack');
});
