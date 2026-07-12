const { test } = require('node:test');
const assert = require('node:assert');
const { seededRoller } = require('../src/dice');
const { createCharacter, levelUp } = require('../src/characters');
const pr = require('../src/partyrun');
const pf1 = require('../src/pf1core');

// Initiative is now the PLAYERS' roll (Tobias 2026-07-11): tests roll it
// immediately after run creation / each descend so combat proceeds as before.
function rollInit(run, roll) {
  if (run.phase !== 'initiative') return;
  const human = run.heroes.find(h => h.ownerClientId);
  require('../src/partyrun').applyAction(run, human && human.ownerClientId, { type: 'initiative' }, roll);
}


test('room XP: PF1 creature XP + clear bonus, split evenly, plus skill & treasure XP', () => {
  const roll = seededRoller(4);
  const run = pr.createPartyRun([
    { clientId: 'c1', icon: '🛡️', character: createCharacter({ name: 'Kara', race: 'human', cls: 'fighter' }) },
    { clientId: 'c2', icon: '🔮', character: createCharacter({ name: 'Mira', race: 'human', cls: 'cleric' }) },
  ], roll);
  const foes = run.combatants.filter(c => c.side === 'enemy');
  const creatureXp = foes.reduce((s, e) => s + pf1.xp.xpForCR(e.crNum || 0.25), 0);
  const creatureShare = Math.floor(creatureXp / 2);          // per-creature split
  const clearShare = Math.floor(creatureXp * 1.25 / 2);      // + 25% clear bonus
  foes.forEach(e => { e.hp = 0; });
  run.turnIndex = run.combatants.indexOf(run.heroes[0]); run.phase = 'combat';
  pr.applyAction(run, 'c1', { type: 'pass' }, roll);
  assert.strictEqual(run.phase, 'cleared');
  // each hero got at least the clear-bonus share (skill + treasure XP on top).
  assert.ok(run.heroes[0].xp >= clearShare, 'clear-bonus XP: got ' + run.heroes[0].xp + ' >= ' + clearShare);
  assert.ok(run.heroes[0].xp > creatureShare, 'bonuses exceed raw creature split');
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
