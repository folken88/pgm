/**
 * Class-choices framework + cavalier Order gating (Tobias 2026-07-15).
 * Phase 1: the choice replaces the old "Lord Gweyir" name-gate on the Flame deeds,
 * and a cavalier's Order is a pending choice until picked. Order MECHANICS (the six
 * orders' modifiers + deeds) are tested per-order as they land.
 */
const { test } = require('node:test');
const assert = require('node:assert');
const pr = require('../src/partyrun');
const { createCharacter } = require('../src/characters');
const { seededRoller } = require('../src/dice');
const pf1 = require('../src/pf1core');
const { pendingChoices, isLegalChoice, chosenOption } = pf1.choices;

function allowedKit(cls, choices, nick) {
  const roll = seededRoller(3);
  const ch = createCharacter({ name: nick || 'Cav', race: 'human', cls, choices });
  const run = pr.createPartyRun([{ clientId: 'c1', icon: 'X', character: ch }], roll);
  const cb = run.heroes[0];
  if (nick) { cb.nickname = nick; cb.trueNick = nick; }
  return (run.shim._abilitiesFor(cb) || [])
    .filter(a => { try { return run.shim._charAllows(a, cb); } catch (e) { return true; } })
    .map(a => a.name);
}

test('a cavalier has a pending Order at level 1; a fighter has no choices', () => {
  const cav = createCharacter({ name: 'C', race: 'human', cls: 'cavalier' });
  const pend = pendingChoices(cav);
  assert.strictEqual(pend.length, 1);
  assert.strictEqual(pend[0].key, 'order');
  assert.ok(pend[0].options.some(o => o.key === 'flame'), 'Flame is an option');
  assert.strictEqual(pendingChoices(createCharacter({ name: 'F', race: 'human', cls: 'fighter' })).length, 0);
});

test('choosing an Order clears the pending choice', () => {
  const cav = createCharacter({ name: 'C', race: 'human', cls: 'cavalier', choices: { order: 'flame' } });
  assert.strictEqual(pendingChoices(cav).length, 0);
  assert.strictEqual(chosenOption(cav, 'order').name, 'Order of the Flame');
});

test('only BUILT orders are legal picks (no half-built order goes live)', () => {
  const cav = createCharacter({ name: 'C', race: 'human', cls: 'cavalier' });
  assert.ok(isLegalChoice(cav, 'order', 'flame'), 'Flame is built');
  assert.ok(isLegalChoice(cav, 'order', 'lion'), 'Lion is built');
  assert.ok(!isLegalChoice(cav, 'order', 'cockatrice'), 'Cockatrice not built yet → not selectable');
  assert.ok(!isLegalChoice(cav, 'order', 'nonsense'));
  assert.ok(!isLegalChoice(cav, 'domains', 'flame'), 'a cavalier has no domains choice');
  // pendingChoices offers only built options (in table order).
  assert.deepStrictEqual(pendingChoices(cav)[0].options.map(o => o.key), ['flame', 'lion']);
});

test('the Flame deeds are gated by the ORDER, not the name', () => {
  const flame = allowedKit('cavalier', { order: 'flame' });
  assert.ok(flame.includes('Challenge'), 'every cavalier gets the base Challenge');
  assert.ok(flame.includes('Glorious Challenge') && flame.includes('Blaze of Glory'),
    'a Flame cavalier gets the Flame deeds');

  const cockatrice = allowedKit('cavalier', { order: 'cockatrice' });
  assert.ok(cockatrice.includes('Challenge'), 'still a cavalier');
  assert.ok(!cockatrice.includes('Glorious Challenge') && !cockatrice.includes('Blaze of Glory'),
    'a non-Flame cavalier does NOT get the Flame deeds');
});

test('Lord Gweyir is the Order of the Flame by identity (no build edit needed)', () => {
  const gweyir = allowedKit('cavalier', {}, 'Lord Gweyir');
  assert.ok(gweyir.includes('Glorious Challenge') && gweyir.includes('Blaze of Glory'),
    'Gweyir keeps the Flame deeds even with no explicit choice');
  // A nameless cavalier with no order does NOT.
  const nobody = allowedKit('cavalier', {});
  assert.ok(!nobody.includes('Glorious Challenge'), 'no order, no Flame deeds');
});

// ── Order of the Lion (built 2026-07-15) ─────────────────────────────────────
// Build a Lion cavalier combatant at a given level and return { run, cb }.
function lionAt(level, order) {
  const roll = seededRoller(4);
  const ch = createCharacter({ name: 'Leo', race: 'human', cls: 'cavalier', choices: { order: order || 'lion' } });
  const run = pr.createPartyRun([{ clientId: 'c1', icon: 'X', character: ch }], roll);
  const cb = run.heroes[0];
  cb.level = level;   // createCharacter fixes level at 1; drive the deed/aura gates directly
  return { run, cb };
}
function lionKit(level) {
  const { run, cb } = lionAt(level);
  return (run.shim._abilitiesFor(cb) || [])
    .filter(a => { try { return run.shim._charAllows(a, cb); } catch (e) { return true; } })
    .map(a => a.name);
}

test('Order of the Lion is a built, selectable pick', () => {
  const cav = createCharacter({ name: 'C', race: 'human', cls: 'cavalier' });
  assert.ok(isLegalChoice(cav, 'order', 'lion'), 'Lion is built');
  assert.ok(pendingChoices(cav)[0].options.some(o => o.key === 'lion'), 'Lion is offered');
  assert.strictEqual(chosenOption(createCharacter({ name: 'C', race: 'human', cls: 'cavalier', choices: { order: 'lion' } }), 'order').name, 'Order of the Lion');
});

test("Lion deeds appear at their level, and only for a Lion", () => {
  assert.ok(!lionKit(1).includes("Lion's Call"), 'no order deeds at L1');
  assert.ok(lionKit(2).includes("Lion's Call"), "Lion's Call at L2");
  assert.ok(!lionKit(2).includes('For the King!'), 'For the King! not until L8');
  const l15 = lionKit(15);
  assert.ok(l15.includes("Lion's Call") && l15.includes('For the King!') && l15.includes('Shield the Liege'),
    'a L15 Lion has all three deeds');
  // A Cockatrice (or any non-Lion) cavalier never sees Lion deeds.
  const cock = lionAt(15, 'cockatrice');
  const cockKit = (cock.run.shim._abilitiesFor(cock.cb) || []).filter(a => cock.run.shim._charAllows(a, cock.cb)).map(a => a.name);
  assert.ok(!cockKit.includes("Lion's Call"), 'Lion deeds are gated to the Lion order');
});

test("Lion's Challenge dodge and L15 aura reach the hero AC", () => {
  // The Challenge dodge only applies while a challenge is active.
  const { run, cb } = lionAt(1);
  const base = run.shim._acBonus(cb);
  cb.challengedId = 999;   // an active challenge on some foe
  assert.strictEqual(run.shim._acBonus(cb) - base, 1, 'L1 Lion gets +1 dodge while challenging');
  cb.level = 5; cb.challengedId = 999;
  assert.strictEqual(run.shim._acBonus(cb) - base, 2, '+1 per 4 levels → +2 at L5');
  // A L15 Lion projects a +2 aura onto EVERY ally (any class) — even one with no
  // active challenge of their own.
  const guardian = lionAt(15).cb;
  const ally = { character: { derived: { mods: {} } }, cls: 'fighter', playerId: 'p2' };
  const stub = { _orderOf: run.shim._orderOf.bind(run.shim), livingParty: () => [guardian, ally] };
  // orderAcBonus is exercised through a party that contains the L15 Lion.
  const orders = require('../src/pokerdungeon/pgmCavalierOrders');
  assert.strictEqual(orders.orderAcBonus(stub, ally), 2, 'the guardian aura buffs a non-cavalier ally');
});
