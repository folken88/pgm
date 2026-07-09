const { test } = require('node:test');
const assert = require('node:assert');
const { createCharacter, planCharacter } = require('../src/characters');
const skillAlloc = require('../src/skills');

test('a human rogue gets many skill points; smart default includes Perception', () => {
  const plan = planCharacter({ name: 'Sly', race: 'human', cls: 'rogue' });
  // rogue 8 + int mod + human 1. FINESSE spread has int 10 (mod 0) -> 8 + 0 + 1 = 9
  assert.strictEqual(plan.points, 9, 'rogue human point total');
  assert.ok(plan.smartDefault.includes('perception'), 'perception is auto-picked (house rule)');
  assert.strictEqual(plan.smartDefault.length, plan.points, 'default spends all points');
  // Every default pick should be a class skill for the rogue (perception via house rule).
  for (const k of plan.smartDefault) {
    assert.ok(skillAlloc.buildSheet('rogue', {}, []).find(s => s.key === k), 'valid skill key');
  }
});

test('a fighter (2 ranks) with low Int still gets at least the minimum', () => {
  const plan = planCharacter({ name: 'Grunt', race: 'dwarf', cls: 'fighter' });
  // fighter MELEE spread int 10 -> 2 + 0 + 0 (dwarf, no racial skill) = 2
  assert.strictEqual(plan.points, 2);
  assert.strictEqual(plan.smartDefault[0], 'perception', 'perception first');
});

test('createCharacter attaches a skill sheet; chosen skills get +3 class bonus', () => {
  const c = createCharacter({ name: 'Fen', race: 'human', cls: 'rogue', skills: ['perception', 'stealth'] });
  const stealth = c.skillSheet.find(s => s.key === 'stealth');
  assert.strictEqual(stealth.ranks, 1);
  assert.ok(stealth.classSkill, 'stealth is a rogue class skill');
  // 1 rank + dex mod + 3 class bonus. FINESSE dex 15 -> +2, so 1+2+3 = 6
  assert.strictEqual(stealth.modifier, 6);
  const perception = c.skillSheet.find(s => s.key === 'perception');
  assert.strictEqual(perception.ranks, 1, 'perception ranked');
});

test('selection is capped at the point total (cannot over-spend)', () => {
  const c = createCharacter({
    name: 'Greedy', race: 'dwarf', cls: 'fighter',       // only 2 points
    skills: ['perception', 'climb', 'swim', 'intimidate', 'ride'],
  });
  assert.strictEqual(c.skills.length, 2, 'capped at 2 points');
});

test('untrained trained-only skills are marked unusable; open skills usable', () => {
  const c = createCharacter({ name: 'Novice', race: 'human', cls: 'fighter', skills: ['perception'] });
  const umd = c.skillSheet.find(s => s.key === 'use_magic_device');   // trained-only, 0 ranks
  assert.strictEqual(umd.usable, false);
  const climb = c.skillSheet.find(s => s.key === 'climb');            // not trained-only
  assert.strictEqual(climb.usable, true);
});
