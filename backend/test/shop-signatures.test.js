/**
 * SIGNATURE WEAPONS as loot + the merchant's rotating stock (Tobias 2026-07-14).
 *
 * The failure this guards against is the one that bit See Invisibility: shipping
 * DATA whose mechanism is dead. A signature weapon is only worth anything if its
 * intrinsic magic (`special`) actually reaches swing.js when you EQUIP it — so we
 * assert the riders survive the equip, not merely that the item exists.
 */
const { test } = require('node:test');
const assert = require('node:assert');
const pr = require('../src/partyrun');
const items = require('../src/items');
const { createCharacter } = require('../src/characters');
const { seededRoller } = require('../src/dice');
const { weaponOf } = require('../src/pokerdungeon/game/combat');
const sigs = require('../src/pf1core/pf1data/signatures');

function staged(seed, phase) {
  const roll = seededRoller(seed);
  const run = pr.createPartyRun(
    [{ clientId: 'c1', icon: 'X', character: createCharacter({ name: 'T', race: 'human', cls: 'fighter' }) }],
    roll
  );
  pr.applyAction(run, 'c1', { type: 'initiative' }, roll);
  if (phase) run.phase = phase;   // gear is swapped BETWEEN fights ('cleared'), not mid-swing
  return { run, hero: run.heroes[0], roll };
}

// ---------- the weapons themselves ----------

test('every signature weapon is a real item with a price and a stat block', () => {
  assert.ok(items.SIGNATURE_GEAR.length >= 20, 'the whole named-weapon roster came across');
  for (const g of items.SIGNATURE_GEAR) {
    const w = sigs.CUSTOM_WEAPONS[g.sigKey];
    assert.ok(w, `${g.key} points at a real stat block`);
    assert.ok(g.value > 0, `${g.name} is priced`);
    assert.strictEqual(g.gearType, 'weapon');
    assert.strictEqual(g.weight, 0, 'weight 0 keeps it OUT of the ordinary weighted item roll');
    assert.ok(w.custom, 'custom:true — always proficient, always at least magic');
  }
});

test('equipping a signature carries its intrinsic magic into combat (not just its name)', () => {
  const { run, hero } = staged(3, 'cleared');
  items.SIGNATURE_GEAR.forEach(g => run.inventory.push({ key: g.key, qty: 1, party: true }));

  const r = pr.applyAction(run, 'c1', { type: 'equip', item: 'sig_redeemer' }, seededRoller(4));
  assert.ok(r.ok, r.error);
  const w = hero.weapon;
  assert.match(w.name, /Redeemer/);
  assert.strictEqual(w.special.holy, true, 'Redeemer is HOLY — the rider must reach swing.js');
  assert.strictEqual(w.special.flamingBurst, true, 'and it burns');
  assert.strictEqual(w.dmgCount, 2); assert.strictEqual(w.dmgDie, 6);
});

test('a reach polearm keeps its reach, and a dual-wield keeps both hands', () => {
  const { run, hero } = staged(5, 'cleared');
  run.inventory.push({ key: 'sig_tonbokiri', qty: 1, party: true }, { key: 'sig_sawtoothsabers', qty: 1, party: true });

  pr.applyAction(run, 'c1', { type: 'equip', item: 'sig_tonbokiri' }, seededRoller(6));
  assert.strictEqual(hero.weapon.reachFly, true, 'Ton Bokiri is a polearm — it takes flyers out of the air');
  assert.strictEqual(hero.weapon.special.unholy, 2, 'and it hates the righteous (2d6)');

  pr.applyAction(run, 'c1', { type: 'equip', item: 'sig_sawtoothsabers' }, seededRoller(7));
  assert.strictEqual(hero.weapon.dual, true, 'the sabers swing twice');
  assert.strictEqual(hero.weapon.noShield, true, 'both hands are full');
});

test('the riders are ALWAYS on — a +0 signature still burns (poker\'s rule)', () => {
  const plain = weaponOf({ weapon: 0 }, 'redeemer');
  const plussed = weaponOf({ weapon: 3 }, 'redeemer');
  assert.strictEqual(plain.special.flamingBurst, true, 'no +N tier, still flaming');
  assert.strictEqual(plain.dmgBonus, 0);
  assert.strictEqual(plussed.dmgBonus, 3, 'the tier adds on TOP of the intrinsic magic');
  assert.match(plussed.name, /^\+3 Redeemer/);
});

test('price = PF1 magic curve + a craft premium for raw lethality', () => {
  const P = k => items.ITEM_BY_KEY[k].value;
  // The magic still follows PF1: Redeemer = flamingBurst (+2) + holy (+2) = +4
  // effective, so 16×2000 of its price is enchantment.
  assert.strictEqual(P('sig_redeemer'), 315 + 16 * 2000 + sigs.damagePremium(sigs.CUSTOM_WEAPONS.redeemer));
  // A burst rider must not be double-charged with the base element it implies.
  const vs = sigs.CUSTOM_WEAPONS.voidshard;
  assert.strictEqual(P('sig_voidshard'), 315 + 4 * 2000 + sigs.damagePremium(vs), 'frostBurst is +2, not +3');

  // THE REGRESSION THIS EXISTS FOR: the Longue Carabine is a 2d10 ×4 rifle with NO
  // magic on it. On the magic curve alone it priced at 315g — the best buy in the
  // shop, and cheaper than a plain +1 longsword. Raw lethality has to cost.
  assert.ok(P('sig_lapua') > 10000, 'a 2d10 ×4 sniper rifle is not a 315g impulse buy');
  const cheapestSig = Math.min(...items.SIGNATURE_GEAR.map(g => g.value));
  assert.ok(cheapestSig > items.ITEM_BY_KEY['g_longsword_p1'].value,
    'even the humblest named weapon outprices a generic +1 longsword');
});

// ---------- the merchant ----------

test('the staples are always there — potions, components, plain steel and +1 gear', () => {
  const keys = items.SHOP_STOCK.map(s => s.key);
  assert.ok(keys.includes('potion_clw'), 'cure light wounds, always');
  assert.ok(keys.includes('diamond_dust'), 'the restoration component');
  assert.ok(keys.some(k => k.startsWith('g_') && !k.includes('_p')), 'plain/masterwork gear');
  assert.ok(keys.includes('g_longsword_p1'), '+1 magic gear');
  assert.ok(!keys.some(k => k.startsWith('sig_')), 'but NEVER a signature — those only rotate');
  assert.ok(!keys.includes('diamond'), 'and not the Raise Dead diamond');
});

test('exactly 3 rare items are on offer, and they hold still for their 10 minutes', () => {
  const W = items.ROTATE_MS;
  const base = 1_000_000 * W;                      // an arbitrary window boundary
  const a = items.featuredKeys(base);
  assert.strictEqual(a.length, 3);
  assert.strictEqual(new Set(a).size, 3, 'three DIFFERENT things');
  assert.deepStrictEqual(items.featuredKeys(base + 1), a, 'same window → same stock');
  assert.deepStrictEqual(items.featuredKeys(base + W - 1), a, 'still the same at 9:59');
  assert.notDeepStrictEqual(items.featuredKeys(base + W), a, 'next window → the stall has changed over');
});

test('rotation is DERIVED, so a restart mid-window does not reshuffle the stall', () => {
  const t = 1_234_567_890_123;
  assert.deepStrictEqual(items.featuredKeys(t), items.featuredKeys(t), 'pure function of the clock — no stored state');
  assert.ok(items.rotatesAt(t) > t && items.rotatesAt(t) - t <= items.ROTATE_MS);
});

test('you can buy a featured piece if the purse covers it', () => {
  const { run } = staged(9);
  const featured = items.featuredKeys()[0];
  const price = items.ITEM_BY_KEY[featured].value;
  run.gold = price + 10;

  const r = pr.applyAction(run, 'c1', { type: 'shop_buy', item: featured }, seededRoller(10));
  assert.ok(r.ok, r.error);
  assert.strictEqual(run.gold, 10, 'the purse paid');
  assert.ok(run.heroes[0].pack.some(p => p.key === featured), 'and it is in the pack');
});

test('a signature NOT on today\'s board cannot be bought — a stale tab gets refused', () => {
  const { run } = staged(11);
  run.gold = 999999;
  const onBoard = items.featuredKeys();
  const offBoard = items.SIGNATURE_GEAR.map(g => g.key).find(k => !onBoard.includes(k));

  const r = pr.applyAction(run, 'c1', { type: 'shop_buy', item: offBoard }, seededRoller(12));
  assert.ok(!r.ok, 'refused');
  assert.match(r.error, /does not carry/i);
  assert.strictEqual(run.gold, 999999, 'and no gold moved');
});

test('the purse is checked — you cannot buy Redeemer with pocket lint', () => {
  const { run } = staged(13);
  run.gold = 5;
  const featured = items.featuredKeys()[0];
  const r = pr.applyAction(run, 'c1', { type: 'shop_buy', item: featured }, seededRoller(14));
  assert.ok(!r.ok);
  assert.match(r.error, /not enough gold/i);
});

// ---------- the hoard ----------

test('named weapons only turn up deep, and never in the shallows', () => {
  const always = () => 0;      // a roll that always "succeeds" the chance check
  assert.strictEqual(items.rollSignature(1, always), null, 'depth 1 — nothing');
  assert.strictEqual(items.rollSignature(2, always), null, 'depth 2 — nothing');
  assert.ok(items.rollSignature(3, always), 'depth 3 — now it can happen');

  const never = () => 0.999;    // a roll that always fails the chance check
  assert.strictEqual(items.rollSignature(20, never), null, 'even deep, it is a CHANCE, not a guarantee');
});
