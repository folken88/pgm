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

test('only real orders are legal picks', () => {
  const cav = createCharacter({ name: 'C', race: 'human', cls: 'cavalier' });
  assert.ok(isLegalChoice(cav, 'order', 'flame'));
  assert.ok(isLegalChoice(cav, 'order', 'cockatrice'));
  assert.ok(!isLegalChoice(cav, 'order', 'nonsense'));
  assert.ok(!isLegalChoice(cav, 'domains', 'flame'), 'a cavalier has no domains choice');
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
