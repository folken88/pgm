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
  // All six playable orders are now built (Sword remains deferred with mounts and
  // isn't in the table). The `built` gate still rejects nonsense / wrong choice-keys.
  for (const k of ['flame', 'cockatrice', 'dragon', 'lion', 'shield', 'star']) {
    assert.ok(isLegalChoice(cav, 'order', k), k + ' is built');
  }
  assert.ok(!isLegalChoice(cav, 'order', 'sword'), 'Sword is deferred → not an option');
  assert.ok(!isLegalChoice(cav, 'order', 'nonsense'));
  assert.ok(!isLegalChoice(cav, 'domains', 'flame'), 'a cavalier has no domains choice');
  assert.deepStrictEqual(pendingChoices(cav)[0].options.map(o => o.key), ['flame', 'cockatrice', 'dragon', 'lion', 'shield', 'star']);
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

// ── Order of the Dragon (built 2026-07-15) ───────────────────────────────────
test('Order of the Dragon is a built, selectable pick', () => {
  const cav = createCharacter({ name: 'D', race: 'human', cls: 'cavalier' });
  assert.ok(isLegalChoice(cav, 'order', 'dragon'), 'Dragon is built');
  assert.strictEqual(chosenOption(createCharacter({ name: 'D', race: 'human', cls: 'cavalier', choices: { order: 'dragon' } }), 'order').name, 'Order of the Dragon');
});

test('Dragon deeds appear at their level, and only for a Dragon', () => {
  const kit = (level) => {
    const { run, cb } = lionAt(level, 'dragon');
    return (run.shim._abilitiesFor(cb) || []).filter(a => run.shim._charAllows(a, cb)).map(a => a.name);
  };
  assert.ok(!kit(1).includes('Aid Allies'), 'no order deeds at L1');
  assert.ok(kit(2).includes('Aid Allies'), 'Aid Allies at L2');
  assert.ok(!kit(2).includes('Strategy'), 'Strategy not until L8');
  const l15 = kit(15);
  assert.ok(l15.includes('Aid Allies') && l15.includes('Strategy') && l15.includes('Act as One'), 'a L15 Dragon has all three deeds');
  // A Lion never sees Dragon deeds.
  const lion = lionAt(15, 'lion');
  const lk = (lion.run.shim._abilitiesFor(lion.cb) || []).filter(a => lion.run.shim._charAllows(a, lion.cb)).map(a => a.name);
  assert.ok(!lk.includes('Aid Allies'), 'Dragon deeds are gated to the Dragon order');
});

test("Dragon's Challenge — allies hit the challenged foe harder, but not the Dragon himself", () => {
  const orders = require('../src/pokerdungeon/pgmCavalierOrders');
  const dragon = { cls: 'cavalier', playerId: 'p1', level: 8, character: { choices: { order: 'dragon' } }, challengedId: 42 };
  const ally = { cls: 'fighter', playerId: 'p2' };
  const foe = { uid: 42 }, otherFoe = { uid: 99 };
  const shim = { _orderOf: (m) => (m.character && m.character.choices && m.character.choices.order) || null, livingParty: () => [dragon, ally] };
  assert.strictEqual(orders.swingMods(shim, ally, foe).toHit, 2, 'an ally gets +2 vs the challenged foe at L8 (+1 per 4)');
  assert.strictEqual(orders.swingMods(shim, dragon, foe).toHit, 0, 'the Dragon himself gets no ally bonus (his own Challenge damage still applies)');
  assert.strictEqual(orders.swingMods(shim, ally, otherFoe).toHit, 0, 'no bonus vs a foe the Dragon has not challenged');
});

// ── Order of the Star (built 2026-07-15) ─────────────────────────────────────
test('Order of the Star is a built, selectable pick', () => {
  const cav = createCharacter({ name: 'S', race: 'human', cls: 'cavalier' });
  assert.ok(isLegalChoice(cav, 'order', 'star'), 'Star is built');
  assert.strictEqual(chosenOption(createCharacter({ name: 'S', race: 'human', cls: 'cavalier', choices: { order: 'star' } }), 'order').name, 'Order of the Star');
});

test('Star deeds appear at their level, and only for a Star', () => {
  const kit = (level) => {
    const { run, cb } = lionAt(level, 'star');
    return (run.shim._abilitiesFor(cb) || []).filter(a => run.shim._charAllows(a, cb)).map(a => a.name);
  };
  assert.ok(!kit(1).includes('Calling'), 'no order deeds at L1');
  assert.ok(kit(2).includes('Calling'), 'Calling at L2');
  assert.ok(!kit(2).includes('For the Faith'), 'For the Faith not until L8');
  const l15 = kit(15);
  assert.ok(l15.includes('Calling') && l15.includes('For the Faith') && l15.includes('Retribution'), 'a L15 Star has all three deeds');
  const dragon = lionAt(15, 'dragon');
  const dk = (dragon.run.shim._abilitiesFor(dragon.cb) || []).filter(a => dragon.run.shim._charAllows(a, dragon.cb)).map(a => a.name);
  assert.ok(!dk.includes('Calling'), 'Star deeds are gated to the Star order');
});

test("Star's Challenge — a save bonus while challenging, folded into the hero save", () => {
  const { run, cb } = lionAt(5, 'star');   // L5 → challenge step = 2
  const base = run.shim._partySaveMod(cb, ['will']);
  cb.challengedId = 7;
  assert.strictEqual(run.shim._partySaveMod(cb, ['will']) - base, 2, '+1 per 4 levels → +2 at L5 while challenging');
  cb.challengedId = null;
  assert.strictEqual(run.shim._partySaveMod(cb, ['will']), base, 'no bonus without an active challenge');
});

// ── Order of the Cockatrice + Order of the Shield (built 2026-07-15) ──────────
test('Cockatrice and Shield are built, selectable picks', () => {
  const cav = createCharacter({ name: 'C', race: 'human', cls: 'cavalier' });
  assert.ok(isLegalChoice(cav, 'order', 'cockatrice') && isLegalChoice(cav, 'order', 'shield'));
  assert.strictEqual(chosenOption(createCharacter({ name: 'C', race: 'human', cls: 'cavalier', choices: { order: 'cockatrice' } }), 'order').name, 'Order of the Cockatrice');
});

test('Cockatrice Braggart (L2) is a deed; Steal Glory / Rally are passive (no button)', () => {
  const kit2 = (() => { const { run, cb } = lionAt(2, 'cockatrice'); return (run.shim._abilitiesFor(cb) || []).filter(a => run.shim._charAllows(a, cb)).map(a => a.name); })();
  assert.ok(kit2.includes('Braggart'), 'Braggart at L2');
  const kit15 = (() => { const { run, cb } = lionAt(15, 'cockatrice'); return (run.shim._abilitiesFor(cb) || []).filter(a => run.shim._charAllows(a, cb)).map(a => a.name); })();
  assert.ok(!kit15.includes('Steal Glory') && !kit15.includes('Rally'), 'Steal Glory/Rally are passive reactions, not deeds');
});

test("Cockatrice Challenge — +damage vs the challenged foe when you fight it ALONE", () => {
  const orders = require('../src/pokerdungeon/pgmCavalierOrders');
  const cock = { cls: 'cavalier', playerId: 'p1', level: 5, character: { choices: { order: 'cockatrice' } }, challengedId: 42 };
  const shim = { _orderOf: (m) => (m.character && m.character.choices && m.character.choices.order) || null, livingParty: () => [cock] };
  const foeAlone = { uid: 42, _meleeBy: new Set(['p1']) };           // only the cockatrice on it
  const foeCrowded = { uid: 42, _meleeBy: new Set(['p1', 'p2']) };   // an ally is also on it
  assert.strictEqual(orders.swingMods(shim, cock, foeAlone).dmg, 2, '+damage while lone (L5 → +2)');
  assert.strictEqual(orders.swingMods(shim, cock, foeCrowded).dmg, 0, 'no lone bonus once an ally joins');
  // Braggart synergy: +2 vs a shaken (prayed) foe.
  assert.strictEqual(orders.swingMods(shim, cock, { uid: 99, prayed: 2 }).dmg, 2, '+2 vs a shaken foe');
});

test("Shield Challenge — +to-hit vs a challenged foe that has struck an ally", () => {
  const orders = require('../src/pokerdungeon/pgmCavalierOrders');
  const sh = { cls: 'cavalier', playerId: 'p1', level: 9, character: { choices: { order: 'shield' } }, challengedId: 42 };
  const shim = { _orderOf: (m) => (m.character && m.character.choices && m.character.choices.order) || null, livingParty: () => [sh] };
  assert.strictEqual(orders.swingMods(shim, sh, { uid: 42, _engagedAlly: true }).toHit, 3, '+to-hit once the foe has hit an ally (L9 → +3)');
  assert.strictEqual(orders.swingMods(shim, sh, { uid: 42 }).toHit, 0, 'no bonus before the foe has struck anyone');
});

test('Shield Resolute stamps DR each room; Cockatrice Rally survives a killing blow once', () => {
  const orders = require('../src/pokerdungeon/pgmCavalierOrders');
  const shim = { _orderOf: (m) => (m.character && m.character.choices && m.character.choices.order) || null, livingParty: () => [], _note: () => {}, round: 1 };
  // Resolute DR (L2+): 1 + level/5.
  const shieldCav = { cls: 'cavalier', level: 10, character: { choices: { order: 'shield' } } };
  orders.applyRoomPassives(shim, shieldCav);
  assert.strictEqual(shieldCav.dr, 3, 'DR 1 + floor(10/5) = 3');
  // Rally (L15): a blow that drops the cockatrice leaves them at 1 HP, once per room.
  const cock = { cls: 'cavalier', level: 15, character: { choices: { order: 'cockatrice' } }, hp: -4, nickname: 'Vain' };
  orders.applyRoomPassives(shim, cock);   // clears _rallied
  orders.onHeroHitByFoe(shim, cock, { hp: 20 });
  assert.strictEqual(cock.hp, 1, 'Rally leaves the cockatrice at 1 HP');
  cock.hp = -3;
  orders.onHeroHitByFoe(shim, cock, { hp: 20 });
  assert.ok(cock.hp < 0, 'Rally does not fire twice in the same room');
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
