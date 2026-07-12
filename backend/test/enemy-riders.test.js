/**
 * Enemy melee riders — regression guard. These fire inside the transplanted
 * _enemyMelee path and were SILENTLY DEAD for weeks: a shim hole
 * (_evadeIncoming missing) made every enemy hit throw, and enemyTurn's catch
 * swallowed it into the basic-swing fallback (2026-07-12 fix). This test fails
 * loudly if any of them break again.
 */
const { test } = require('node:test');
const assert = require('node:assert');
const pr = require('../src/partyrun');
const { createCharacter } = require('../src/characters');
const { seededRoller } = require('../src/dice');
const pf1 = require('../src/pf1core');

function staged(cls, seed) {
  const roll = seededRoller(seed);
  const run = pr.createPartyRun([{ clientId: 'c1', icon: 'X', character: createCharacter({ name: 'T', race: 'human', cls }) }], roll);
  pr.applyAction(run, 'c1', { type: 'initiative' }, roll);
  const hero = run.heroes[0]; hero.hp = 120; hero.maxHp = 120;
  return { run, hero, roll };
}
function letFoeAct(run, foe, hero, mut, sees) {
  for (let i = 0; i < 20; i++) {
    if (mut) mut();
    run.turnIndex = run.combatants.indexOf(foe); run.phase = 'combat';
    const before = run.log.length;
    run.shim._enemyAct(foe);
    const fresh = run.log.slice(before).map(e => e.text);
    if (fresh.some(sees)) return fresh.find(sees);
  }
  return null;
}

test('enemy sneak attack: a kobold rogue sneaks a flat-footed hero for +Xd6', () => {
  const { run, hero } = staged('fighter', 7);
  const rogue = run.shim._makeEnemyPGM(pf1.monsters.MON['kobold_rogue']);
  rogue.key = 'kobold_rogue'; rogue.revealed = true; run.combatants.push(rogue);
  const line = letFoeAct(run, rogue, hero, () => { hero.flatFooted = true; }, t => /sneak/i.test(t));
  assert.ok(line, 'sneak-attack rider fired');
  assert.match(line, /sneak/i);
});

test('fire shield: a foe landing a melee hit on the warded hero is scorched', () => {
  const { run, hero } = staged('fighter', 4);
  const foe = run.combatants.find(c => c.side === 'enemy');
  hero.fireShield = { die: 6, bonus: 1 };
  const line = letFoeAct(run, foe, hero, () => { hero.flatFooted = false; }, t => /scorched|Fire Shield/i.test(t));
  assert.ok(line, 'fire-shield retaliation fired');
});

test('mirror image: an incoming attack pops a decoy instead of hitting', () => {
  const { run, hero } = staged('fighter', 4);
  const foe = run.combatants.find(c => c.side === 'enemy');
  hero.images = 2;
  assert.strictEqual(run.shim._evadeIncoming(hero, foe), true, 'decoy soaks the blow');
  assert.strictEqual(hero.images, 1, 'one image consumed');
});

test('shim call-diff: every this._x() the mixins call exists on the shim', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const dir = path.join(__dirname, '..', 'src', 'pokerdungeon', 'game', 'dungeon');
  const called = new Set();
  for (const f of ['abilities', 'enemyAI', 'heroAI', 'summons', 'swing', 'makeenemy']) {
    const src = fs.readFileSync(path.join(dir, f + '.js'), 'utf8');
    (src.match(/this\.[_a-zA-Z][\w]*\(/g) || []).forEach(m => called.add(m.slice(5, -1)));
  }
  const { run } = staged('fighter', 1);
  const missing = [...called].filter(k => typeof run.shim[k] !== 'function').sort();
  assert.deepStrictEqual(missing, [], 'mixins call methods the shim lacks: ' + missing.join(', '));
});
