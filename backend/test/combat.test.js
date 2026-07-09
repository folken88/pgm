const { test } = require('node:test');
const assert = require('node:assert');
const pf1 = require('../src/pf1core');
const { seededRoller } = require('../src/dice');
const { heroAC, heroAttack, creatureAttack } = require('../src/combat');
const { CREATURE_BY_KEY } = require('../src/content');

function fighter() {
  return pf1.character.deriveCharacter({
    cls: 'fighter', level: 1,
    baseScores: { str: 16, dex: 12, con: 14, int: 10, wis: 10, cha: 8 },
  });
}
const LONGSWORD = pf1.weapons.WEAPON_BY_NAME['longsword'];

test('heroAC = 10 + dex + armor', () => {
  const h = fighter();                 // dex 12 -> +1
  assert.strictEqual(heroAC(h, 2), 13);
});

test('heroAttack produces a coherent result vs low AC (deterministic)', () => {
  const h = fighter();
  const r = seededRoller(42);
  const res = heroAttack(h, LONGSWORD, 10, r);
  assert.ok(res.d20 >= 1 && res.d20 <= 20, 'd20 in range');
  assert.strictEqual(typeof res.hit, 'boolean');
  if (res.hit) assert.ok(res.damage >= 1, 'a hit deals >= 1');
  else assert.strictEqual(res.damage, 0, 'a miss deals 0');
});

test('a fighter reliably beats AC 5 across many seeds (str+bab makes it likely)', () => {
  const h = fighter();
  let hits = 0;
  for (let s = 1; s <= 100; s++) {
    if (heroAttack(h, LONGSWORD, 5, seededRoller(s)).hit) hits++;
  }
  assert.ok(hits > 85, `expected mostly hits vs AC 5, got ${hits}/100`);
});

test('natural 1 always misses, natural 20 always hits', () => {
  // Roller whose first value forces d20 = 1, then whatever.
  const roll1 = () => 0;              // 1 + floor(0*20) = 1
  const h = fighter();
  assert.strictEqual(heroAttack(h, LONGSWORD, 1, roll1).hit, false, 'nat 1 misses even vs AC 1');

  const roll20 = () => 0.9999;        // 1 + floor(0.9999*20) = 20
  assert.strictEqual(heroAttack(h, LONGSWORD, 999, roll20).hit, true, 'nat 20 hits even vs AC 999');
});

test('creatureAttack resolves against hero AC', () => {
  const goblin = CREATURE_BY_KEY['goblin'];
  const res = creatureAttack(goblin, 13, seededRoller(7));
  assert.ok(res.d20 >= 1 && res.d20 <= 20);
  assert.strictEqual(typeof res.hit, 'boolean');
  if (res.hit) assert.ok(res.damage >= 1);
});
