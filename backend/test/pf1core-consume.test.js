const { test } = require('node:test');
const assert = require('node:assert');
const pf1 = require('../src/pf1core');

test('PGM can load the vendored pf1core façade', () => {
  assert.ok(pf1.character, 'character namespace present');
  assert.ok(pf1.classes, 'classes namespace present');
  assert.strictEqual(typeof pf1.character.deriveCharacter, 'function');
});

test('PGM can actually derive a level-1 fighter through vendored pf1core', () => {
  const hero = pf1.character.deriveCharacter({
    cls: 'fighter',
    level: 1,
    baseScores: { str: 16, dex: 14, con: 14, int: 10, wis: 12, cha: 8 },
  });
  assert.strictEqual(hero.level, 1, 'level 1');
  assert.strictEqual(hero.bab, 1, 'fighter has full BAB (+1 at level 1)');
  assert.ok(hero.hp > 0, 'has hit points');
  assert.strictEqual(typeof hero.saves.fort, 'number', 'fort save derived');
  assert.strictEqual(typeof hero.saves.will, 'number', 'will save derived');
  assert.ok(hero.scores.str >= 16, 'STR carried through derivation');
});

test('PGM sees standard PF1 weapon data (no poker signature weapons)', () => {
  const byName = pf1.weapons.WEAPON_BY_NAME;
  assert.ok(byName['longsword'], 'longsword is a standard PF1 weapon');
  // Signature/custom weapons live only in poker's app-side staples.js and must
  // NOT have been vendored — PGM parties start with basic found gear.
  const keys = Object.keys(byName).join('|').toLowerCase();
  assert.ok(!keys.includes("bastard's blade"), 'no poker signature weapons in PGM');
});
