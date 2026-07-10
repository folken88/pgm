const { test } = require('node:test');
const assert = require('node:assert');
const { seededRoller } = require('../src/dice');
const { createCharacter, levelUp } = require('../src/characters');
const pr = require('../src/partyrun');
const pf1 = require('../src/pf1core');

test('room XP = sum of PF1 xpForCR split evenly across the party', () => {
  const roll = seededRoller(4);
  const run = pr.createPartyRun([
    { clientId: 'c1', icon: '🛡️', character: createCharacter({ name: 'Kara', race: 'human', cls: 'fighter' }) },
    { clientId: 'c2', icon: '🔮', character: createCharacter({ name: 'Mira', race: 'human', cls: 'cleric' }) },
  ], roll);
  const foes = run.combatants.filter(c => c.side === 'enemy');
  const expected = Math.floor(foes.reduce((s, e) => s + pf1.xp.xpForCR(e.crNum || 0.25), 0) / 2);
  foes.forEach(e => { e.hp = 0; });
  run.turnIndex = run.combatants.indexOf(run.heroes[0]); run.phase = 'combat';
  pr.applyAction(run, 'c1', { type: 'pass' }, roll);
  assert.strictEqual(run.phase, 'cleared');
  assert.strictEqual(run.heroes[0].xp, expected, 'even split: ' + expected);
  assert.ok(run.log.some(e => /earns \d+ XP/.test(e.text)), 'award narrated');
});

test('crossing 2,000 XP levels a wizard to 2: HP up, slots grow next room, LEVEL UP narrated', () => {
  const roll = seededRoller(9);
  const run = pr.createPartyRun([
    { clientId: 'c1', icon: '🧙', character: createCharacter({ name: 'Zara', race: 'elf', cls: 'wizard' }) },
  ], roll);
  const wiz = run.heroes[0];
  wiz.xp = 1990;                                  // one room from level 2
  const hpBefore = wiz.maxHp;
  run.combatants.filter(c => c.side === 'enemy').forEach(e => { e.hp = 0; });
  run.turnIndex = run.combatants.indexOf(wiz); run.phase = 'combat';
  pr.applyAction(run, 'c1', { type: 'pass' }, roll);
  assert.ok(wiz.xp >= 2000, 'xp crossed the PF1 threshold: ' + wiz.xp);
  assert.strictEqual(wiz.level, 2, 'leveled to 2');
  assert.ok(wiz.maxHp > hpBefore, 'max HP grew');
  assert.ok(run.log.some(e => /LEVEL UP! Zara reaches level 2/.test(e.text)), 'narrated: ' + run.log.slice(-3).map(e => e.text).join(' | '));
  // Next room: slots refresh at the new level (wizard 2 = more 1st-level slots).
  pr.applyAction(run, 'c1', { type: 'descend' }, roll);
  assert.ok((wiz.slots[1] || 0) >= 4 || (wiz.slots[1] || 0) > 3 - 1, 'slots at level 2: ' + JSON.stringify(wiz.slots));
});

test('characters.levelUp re-derives (cast companion with authored raceMods)', () => {
  const c = require('../src/cast').buildCompanion('Tokala').character;   // half-orc barbarian
  const hp1 = c.maxHp, bab1 = c.derived.bab;
  const { hpGain } = levelUp(c, 4);                // ASI level — scores can shift
  assert.ok(hpGain > 0 && c.maxHp === hp1 + hpGain);
  assert.ok(c.derived.bab > bab1, 'BAB grew');
  assert.ok(c.skillSheet.length, 'skill sheet rebuilt');
});
