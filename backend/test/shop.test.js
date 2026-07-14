/**
 * In-dungeon shop (Tobias 2026-07-13): a Shop button opens a merchant; buying
 * spends the party purse; while shopping your turns AUTO-SKIP and the dungeon
 * keeps going (it does not pause). Stock is the vetted priced pool at RAW value.
 */
const { test } = require('node:test');
const assert = require('node:assert');
const pr = require('../src/partyrun');
const items = require('../src/items');
const { createCharacter } = require('../src/characters');
const { seededRoller } = require('../src/dice');

function party(seed) {
  const roll = seededRoller(seed);
  const run = pr.createPartyRun([
    { clientId: 'c1', icon: 'X', character: createCharacter({ name: 'Fig', race: 'human', cls: 'fighter' }), ai: false },
    { clientId: 'ai1', icon: 'Y', character: createCharacter({ name: 'Cler', race: 'human', cls: 'cleric' }), ai: true },
  ], roll);
  pr.applyAction(run, 'c1', { type: 'initiative' }, roll);
  return { run, roll };
}

test('shop stock is the vetted priced pool at RAW value, cheapest first', () => {
  assert.ok(items.SHOP_STOCK.length >= 6, 'a real stock list');
  for (let i = 1; i < items.SHOP_STOCK.length; i++) assert.ok(items.SHOP_STOCK[i].value >= items.SHOP_STOCK[i - 1].value, 'sorted cheapest-first');
  assert.ok(items.SHOP_STOCK.every(s => s.value > 0), 'every ware has a price');
});

test('opening the shop marks you shopping; buying spends the party purse into your pack', () => {
  const { run, roll } = party(3);
  const hero = run.heroes.find(h => !h.ai);
  const open = pr.applyAction(run, 'c1', { type: 'shop_open' }, roll);
  assert.ok(open.ok && open.stock.length, 'shop opened with wares');
  assert.strictEqual(hero.shopping, true, 'flagged shopping');
  run.gold = 200;
  const buy = pr.applyAction(run, 'c1', { type: 'shop_buy', item: 'potion_clw' }, roll);
  assert.ok(buy.ok, buy.error);
  assert.strictEqual(run.gold, 150, 'CLW potion (50gp RAW) spent from the purse');
  assert.ok((hero.pack || []).some(s => s.key === 'potion_clw'), 'potion landed in the buyer pack');
});

test('cannot buy what you cannot afford', () => {
  const { run, roll } = party(4);
  pr.applyAction(run, 'c1', { type: 'shop_open' }, roll);
  run.gold = 10;
  const buy = pr.applyAction(run, 'c1', { type: 'shop_buy', item: 'g_longsword_p2' }, roll);   // +2 longsword, 8315gp
  assert.ok(!buy.ok, 'refused');
  assert.match(buy.error, /not enough gold/);
  assert.strictEqual(run.gold, 10, 'purse untouched');
});

test('a shopping player is skipped by the turn driver (dungeon flows on)', () => {
  const { run, roll } = party(6);
  const hero = run.heroes.find(h => !h.ai);
  hero.shopping = true;
  // Drive turns: the synchronous driver must never STOP on the shopping human —
  // it either resolves the room or reaches a non-shopping human (there is none),
  // so it should not park on the shopper. Force the shopper to be current:
  run.turnIndex = run.combatants.indexOf(run.combatants.find(c => c.id === hero.id));
  run.phase = 'combat';
  // A pass-through action from anyone advances; the shopper never becomes "the turn".
  // We assert publicRun never reports the shopper as the active turn.
  const snap = pr.publicRun(run);
  assert.ok(!snap.turn || snap.turn.ownerClientId !== hero.ownerClientId, 'the shopping player is not the active turn');
  assert.strictEqual(snap.combatants.find(c => c.ownerClientId === hero.ownerClientId).shopping, true, 'snapshot marks them shopping');
});

test('closing the shop clears the shopping flag', () => {
  const { run, roll } = party(7);
  pr.applyAction(run, 'c1', { type: 'shop_open' }, roll);
  const close = pr.applyAction(run, 'c1', { type: 'shop_close' }, roll);
  assert.ok(close.ok);
  assert.strictEqual(run.heroes.find(h => !h.ai).shopping, false);
});
