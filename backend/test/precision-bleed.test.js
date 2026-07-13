/**
 * Poker-parity ports (v3.37.38→47, 2026-07-13):
 *  1. PRECISION BLEED — a rogue's sneak attack / swashbuckler's Precise Strike
 *     opens a 1d6/round bleeding wound (first precision hit per foe; bloodless
 *     foes can't bleed). Lives in swing.js right after the Death-domain bleed.
 *  2. FLYING FOE DOESN'T WRESTLE — _pickEnemyManeuver returns 'attack' for a
 *     flyer (Josh: flying angel clerics were grappling from the air).
 */
const { test } = require('node:test');
const assert = require('node:assert');
const pr = require('../src/partyrun');
const { createCharacter } = require('../src/characters');
const { seededRoller } = require('../src/dice');
const pf1 = require('../src/pf1core');
const { weaponOf } = require('../src/pokerdungeon/game/combat');

function staged(cls, seed) {
  const roll = seededRoller(seed);
  const run = pr.createPartyRun([{ clientId: 'c1', icon: 'X', character: createCharacter({ name: 'T', race: 'human', cls }) }], roll);
  pr.applyAction(run, 'c1', { type: 'initiative' }, roll);
  const hero = run.heroes[0]; hero.hp = 120; hero.maxHp = 120;
  return { run, hero, roll };
}

test('precision bleed: a rogue sneak-attacking a flat-footed foe opens a bleeding wound', () => {
  const { run, hero } = staged('rogue', 11);
  hero.weapon = weaponOf(hero.gear, hero.weaponKey);
  const foe = run.shim._makeEnemyPGM(pf1.monsters.MON['goblin']);   // humanoid → bloodful
  foe.key = 'goblin'; foe.revealed = true; foe.hp = 300; foe.maxHp = 300;
  run.combatants.push(foe);
  let sneaked = false;
  for (let i = 0; i < 60 && !foe._bleeding; i++) {
    foe.flatFooted = true;                       // deny Dex → rogue qualifies for sneak
    const r = run.shim._swingVsAC(hero, 2, foe); // AC 2 → the swing lands
    if (r.hit && r.sneakDice) sneaked = true;
  }
  assert.ok(sneaked, 'the rogue landed at least one sneak attack');
  assert.ok(foe._bleeding, 'the sneak attack opened a bleeding wound');
});

test('precision bleed: a bloodless foe (skeleton) cannot be made to bleed by a sneak hit', () => {
  const { run, hero } = staged('rogue', 5);
  hero.weapon = weaponOf(hero.gear, hero.weaponKey);
  const foe = run.shim._makeEnemyPGM(pf1.monsters.MON['skeleton']);   // undead → bloodless
  foe.key = 'skeleton'; foe.revealed = true; foe.hp = 300; foe.maxHp = 300;
  run.combatants.push(foe);
  for (let i = 0; i < 60; i++) { foe.flatFooted = true; run.shim._swingVsAC(hero, 2, foe); }
  assert.ok(!foe._bleeding, 'a skeleton has no blood to spill');
});

test('flying foe does not wrestle: _pickEnemyManeuver returns attack for a flyer (and an archer)', () => {
  const { run, hero } = staged('fighter', 1);
  assert.strictEqual(run.shim._pickEnemyManeuver({ flying: true }, hero), 'attack', 'a flyer strikes, never grapples');
  assert.strictEqual(run.shim._pickEnemyManeuver({ ranged: true }, hero), 'attack', 'an archer strikes, never grapples');
});
