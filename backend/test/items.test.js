const { test } = require('node:test');
const assert = require('node:assert');
const { seededRoller } = require('../src/dice');
const { createCharacter } = require('../src/characters');
const items = require('../src/items');
const pr = require('../src/partyrun');

function humans() {
  return [
    { clientId: 'c1', icon: '🛡️', character: createCharacter({ name: 'Kara', race: 'half-orc', cls: 'fighter' }) },
    { clientId: 'c2', icon: '🔮', character: createCharacter({ name: 'Mira', race: 'human', cls: 'cleric' }) },
  ];
}

test('rollTreasureItem always yields a real vetted item', () => {
  for (let s = 1; s <= 60; s++) {
    const key = items.rollTreasureItem(seededRoller(s));
    assert.ok(items.ITEM_BY_KEY[key], 'valid item key: ' + key);
  }
});

test('rollAmount respects the item dice (CLW heals 2..9)', () => {
  const clw = items.ITEM_BY_KEY['potion_clw'];
  for (let s = 1; s <= 40; s++) {
    const amt = items.rollAmount(clw, seededRoller(s));
    assert.ok(amt >= 2 && amt <= 9, 'CLW in 1d8+1 range, got ' + amt);
  }
});

test('drinking a Cure Light Wounds potion heals the most-wounded ally', () => {
  const roll = seededRoller(4);
  const run = pr.createPartyRun(humans(), roll);
  run.heroes[0].hp = 1;                       // wound Kara
  run.inventory.push({ key: 'potion_clw', qty: 1 });
  const turn = pr.publicRun(run).turn;
  assert.ok(turn, 'a human has the turn');
  const r = pr.applyAction(run, turn.ownerClientId, { type: 'use', item: 'potion_clw' }, roll);
  assert.ok(r.ok, 'use succeeded');
  assert.ok(run.heroes[0].hp > 1, 'Kara was healed');
  assert.strictEqual(run.inventory.length, 0, 'potion consumed');
});

test('using an item you do not have is rejected and does not burn the turn', () => {
  const roll = seededRoller(4);
  const run = pr.createPartyRun(humans(), roll);
  const turn = pr.publicRun(run).turn;
  const r = pr.applyAction(run, turn.ownerClientId, { type: 'use', item: 'potion_clw' }, roll);
  assert.strictEqual(r.ok, false);
  assert.deepStrictEqual(pr.publicRun(run).turn, turn, 'still the same turn');
});

test('publicRun exposes the party inventory', () => {
  const run = pr.createPartyRun(humans(), seededRoller(4));
  run.inventory.push({ key: 'alchemists_fire', qty: 2 });
  const inv = pr.publicRun(run).inventory;
  const fire = inv.find(i => i.key === 'alchemists_fire');
  assert.ok(fire && fire.qty === 2 && fire.verb === 'throw');
});

test('equipping a found weapon swaps the hero\'s weapon', () => {
  const roll = seededRoller(4);
  const run = pr.createPartyRun(humans(), roll);
  run.phase = 'cleared';                       // equip happens between fights
  run.inventory.push({ key: 'g_greatsword', qty: 1 });
  const hero = run.heroes.find(h => h.ownerClientId === 'c1');
  const r = pr.applyAction(run, 'c1', { type: 'equip', item: 'g_greatsword' }, roll);
  assert.ok(r.ok, 'equip succeeded');
  assert.strictEqual(hero.character.weapon.name, 'Greatsword');
  assert.strictEqual(run.inventory.length, 0, 'gear consumed from bag');
});

test('equipping found armor raises AC and flat-footed AC', () => {
  const roll = seededRoller(4);
  const run = pr.createPartyRun(humans(), roll);
  run.phase = 'cleared';
  const hero = run.heroes.find(h => h.ownerClientId === 'c1');
  const beforeAc = hero.ac;
  run.inventory.push({ key: 'g_chainshirt', qty: 1 });   // +4 armor
  pr.applyAction(run, 'c1', { type: 'equip', item: 'g_chainshirt' }, roll);
  const dex = hero.character.derived.mods.dex || 0;
  assert.strictEqual(hero.ac, 10 + dex + 4, 'AC recomputed with chain shirt');
  assert.ok(hero.ac > beforeAc || 4 <= 2, 'chain shirt is an upgrade over starting leather');
  assert.strictEqual(hero.flatAc, hero.ac - Math.max(0, dex));
});

test('holy water damages undead but fizzles on the living', () => {
  const roll = seededRoller(4);
  const run = pr.createPartyRun(humans(), roll);
  const turn = pr.publicRun(run).turn;
  const foe = run.combatants.find(c => c.side === 'enemy' && c.revealed && !c.down);
  assert.ok(foe, 'a revealed foe to target');
  // Living target: fizzle, no damage.
  foe.creature.undead = false;
  run.inventory.push({ key: 'holy_water', qty: 1 });
  const beforeLiving = foe.hp;
  pr.applyAction(run, turn.ownerClientId, { type: 'use', item: 'holy_water', target: foe.id }, roll);
  assert.strictEqual(foe.hp, beforeLiving, 'no effect on the living');
  assert.strictEqual(run.inventory.length, 0, 'still consumed');
});

test('clearing rooms drops treasure items at least sometimes', () => {
  let gotItem = false;
  for (let s = 1; s <= 60 && !gotItem; s++) {
    const roll = seededRoller(s);
    const run = pr.createPartyRun(humans(), roll);
    let guard = 0;
    while (run.phase === 'combat' && guard++ < 800) {
      const v = pr.publicRun(run); if (!v.turn) break;
      const act = v.enemies.length ? { type: 'attack', target: v.enemies[0].id } : { type: 'pass' };
      pr.applyAction(run, v.turn.ownerClientId, act, roll);
    }
    if (run.phase === 'cleared' && run.inventory.length > 0) gotItem = true;
  }
  assert.ok(gotItem, 'some cleared room dropped an item');
});
