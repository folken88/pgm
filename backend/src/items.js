/**
 * Vetted low-level treasure — PGM's PF1 loot. Two kinds, both with a working
 * in-game mechanism (per the vetting rule; see docs/ITEMS-VETTING.md):
 *   CONSUMABLES — used in combat: 'heal' an ally, or 'throw' at a foe
 *   GEAR        — equipped between fights: a weapon (swaps attack) or armor (AC)
 */
const { rollDice } = require('./dice');

const CONSUMABLES = [
  { key: 'potion_clw', name: 'Potion of Cure Light Wounds', short: 'CLW potion', type: 'consumable',
    verb: 'drink', icon: '🧪', value: 50, weight: 6, effect: { kind: 'heal', count: 1, sides: 8, bonus: 1 } },
  { key: 'potion_cmw', name: 'Potion of Cure Moderate Wounds', short: 'CMW potion', type: 'consumable',
    verb: 'drink', icon: '🧪', value: 300, weight: 1, effect: { kind: 'heal', count: 2, sides: 8, bonus: 3 } },
  { key: 'alchemists_fire', name: "Alchemist's Fire", short: 'alch. fire', type: 'consumable',
    verb: 'throw', icon: '🔥', value: 20, weight: 4, effect: { kind: 'throw', count: 1, sides: 6, bonus: 0, dtype: 'fire' } },
  { key: 'acid_flask', name: 'Acid Flask', short: 'acid flask', type: 'consumable',
    verb: 'throw', icon: '🧴', value: 10, weight: 4, effect: { kind: 'throw', count: 1, sides: 6, bonus: 0, dtype: 'acid' } },
  { key: 'liquid_ice', name: 'Liquid Ice', short: 'liquid ice', type: 'consumable',
    verb: 'throw', icon: '❄️', value: 40, weight: 2, effect: { kind: 'throw', count: 1, sides: 6, bonus: 0, dtype: 'cold' } },
  { key: 'bottled_lightning', name: 'Bottled Lightning', short: 'bottled lightning', type: 'consumable',
    verb: 'throw', icon: '⚡', value: 60, weight: 2, effect: { kind: 'throw', count: 1, sides: 6, bonus: 0, dtype: 'electricity' } },
  { key: 'holy_water', name: 'Holy Water', short: 'holy water', type: 'consumable',
    verb: 'throw', icon: '💧', value: 25, weight: 3, effect: { kind: 'throw', count: 2, sides: 4, bonus: 0, dtype: 'positive', vsUndead: true } },
];

// GEAR — found weapons (weaponName must exist in pf1core WEAPON_BY_NAME) and
// armor (acBonus replaces the wearer's armor bonus). Equipped between fights.
// Spell COMPONENTS (Tobias 2026-07-11): expensive-component spells cost their
// component's PF1 price at the Swashgoblin — unless you FOUND one below and
// hung on to it, in which case only the casting fee is due.
const COMPONENTS = [
  { key: 'diamond', name: 'Flawless Diamond (5,000gp)', short: 'Raise Dead component', icon: String.fromCodePoint(0x1F48E), type: 'component', component: 'raisedead', value: 5000 },
  { key: 'diamond_dust', name: 'Diamond Dust (100gp)', short: 'Restoration component', icon: String.fromCodePoint(0x2728), type: 'component', component: 'restoration', value: 100 },
];

// MAGIC GEAR (vetted slice, Tobias 2026-07-11): +1/+2 weapons and armor at
// RAW prices (enh bonus applies to hit/damage or AC on equip).
const MAGIC_GEAR = [
  { key: 'g_longsword_p1', name: '+1 Longsword', short: '+1 longsword', type: 'gear', gearType: 'weapon', icon: '⚔️', value: 2315, weaponName: 'longsword', enh: 1 },
  { key: 'g_greatsword_p1', name: '+1 Greatsword', short: '+1 greatsword', type: 'gear', gearType: 'weapon', icon: '⚔️', value: 2350, weaponName: 'greatsword', enh: 1 },
  { key: 'g_battleaxe_p1', name: '+1 Battle Axe', short: '+1 battle axe', type: 'gear', gearType: 'weapon', icon: '⚔️', value: 2310, weaponName: 'battle axe', enh: 1 },
  { key: 'g_longsword_p2', name: '+2 Longsword', short: '+2 longsword', type: 'gear', gearType: 'weapon', icon: '⚔️', value: 8315, weaponName: 'longsword', enh: 2 },
  { key: 'g_chainshirt_p1', name: '+1 Chain Shirt', short: '+1 chain shirt', type: 'gear', gearType: 'armor', icon: '🛡️', value: 1250, acBonus: 5, enh: 1 },
  { key: 'g_breastplate_p1', name: '+1 Breastplate', short: '+1 breastplate', type: 'gear', gearType: 'armor', icon: '🛡️', value: 1350, acBonus: 7, enh: 1 },
  { key: 'g_chainshirt_p2', name: '+2 Chain Shirt', short: '+2 chain shirt', type: 'gear', gearType: 'armor', icon: '🛡️', value: 4250, acBonus: 6, enh: 2 },
];

// SIGNATURE WEAPONS (Tobias 2026-07-14) — the named blades/guns from the poker
// dungeon, as LOOT. Each is a gear item that carries a `sigKey` instead of a
// `weaponName`: equipItem builds the weapon from pf1core's signature stat block,
// so its intrinsic magic (flaming, holy, keen, frostBurst…) comes with it and is
// ALWAYS ON, regardless of the +N tier. Priced by PF1 RAW (masterwork + eff²×2000
// with the riders as effective-bonus adders) — these are prizes, not impulse buys.
// `weight: 0` keeps them OUT of the ordinary weighted treasure roll; they surface
// only through the deep-hoard roll and the merchant's rotating stock.
const { CUSTOM_WEAPONS, priceOf } = require('./pf1core/pf1data/signatures');
const SIGNATURE_GEAR = Object.values(CUSTOM_WEAPONS).map(w => ({
  key: 'sig_' + w.key,
  name: w.name,
  short: w.name,
  type: 'gear',
  gearType: 'weapon',
  signature: true,
  icon: w.ranged ? '🏹' : (w.dual ? '⚔️' : '🗡️'),
  value: priceOf(w),
  weight: 0,
  sigKey: w.key,
  lore: w.lore || '',
}));

const GEAR = [
  { key: 'g_longsword', name: 'Longsword', short: 'longsword', type: 'gear', gearType: 'weapon', icon: '🗡️', value: 15, weight: 3, weaponName: 'longsword' },
  { key: 'g_battleaxe', name: 'Battle Axe', short: 'battle axe', type: 'gear', gearType: 'weapon', icon: '🪓', value: 10, weight: 3, weaponName: 'battle axe' },
  { key: 'g_morningstar', name: 'Morningstar', short: 'morningstar', type: 'gear', gearType: 'weapon', icon: '🔨', value: 8, weight: 2, weaponName: 'morningstar' },
  { key: 'g_greatsword', name: 'Greatsword', short: 'greatsword', type: 'gear', gearType: 'weapon', icon: '⚔️', value: 50, weight: 1, weaponName: 'greatsword' },
  { key: 'g_studded', name: 'Studded Leather', short: 'studded leather', type: 'gear', gearType: 'armor', icon: '🥋', value: 25, weight: 3, acBonus: 3 },
  { key: 'g_scale', name: 'Scale Mail', short: 'scale mail', type: 'gear', gearType: 'armor', icon: '🦺', value: 50, weight: 2, acBonus: 5 },
  { key: 'g_chainshirt', name: 'Chain Shirt', short: 'chain shirt', type: 'gear', gearType: 'armor', icon: '🛡️', value: 100, weight: 1, acBonus: 4 },
];

// VALUABLES — gems & art objects: pure wealth, sold at the Swashgoblin.
const { GEMS, ART } = (() => {
  // treasure.js owns the lists; late-require avoids a cycle at load order.
  try { return require('./treasure'); } catch (e) { return { GEMS: [], ART: [] }; }
})();
const VALUABLES = [].concat(
  GEMS.map(g => ({ key: g.key, name: g.name, short: g.name, type: 'valuable', icon: '💎', value: g.value })),
  ART.map(a => ({ key: a.key, name: a.name, short: a.name, type: 'valuable', icon: '🖼️', value: a.value })),
);

// Priced vetted MAGIC pool for the treasure roller (potions, +N gear, components).
const PRICED_MAGIC = CONSUMABLES.filter(c => c.key.startsWith('potion')).map(c => ({ key: c.key, value: c.value }))
  .concat(MAGIC_GEAR.map(g => ({ key: g.key, value: g.value })))
  .concat([{ key: 'diamond_dust', value: 100 }, { key: 'diamond', value: 5000 }]);

// SHOP stock (Tobias 2026-07-13): what an in-dungeon merchant sells, at PF1 RAW
// value (full price to buy; sell is 50%, see loot_sell). Vetted pool only:
// consumables (potions/throwables), spell components, and +N magic gear —
// cheapest first so the list reads sensibly.
// ── ITEMS OF THE DAY (Tobias 2026-07-14) ─────────────────────────────────────
// The merchant always has the boring staples below. On TOP of that he lays out
// exactly THREE rare pieces — the signature weapons and the priciest magic gear
// — and they change every 10 minutes.
//
// The rotation is DERIVED, not stored: the window index (epoch / 10 min) seeds a
// tiny deterministic PRNG, so every client, every delve and every server restart
// inside the same 10-minute window sees the SAME three items, with no shared
// state to keep in sync. Come back in 10 minutes and the stall has changed.
const ROTATE_MS = 10 * 60 * 1000;
const FEATURED_COUNT = 3;

/** Deterministic PRNG (mulberry32) — same seed, same picks, anywhere. */
function seeded(seed) {
  let t = seed >>> 0;
  return () => {
    t = (t + 0x6D2B79F5) >>> 0;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

/** The pool the rotating slots draw from: every signature weapon + the top magic gear. */
const FEATURED_POOL = SIGNATURE_GEAR.map(g => g.key)
  .concat(MAGIC_GEAR.filter(g => g.value >= 4000).map(g => g.key));

/** The 3 items on offer in the 10-minute window containing `now`. */
function featuredKeys(now = Date.now()) {
  const window = Math.floor(now / ROTATE_MS);
  const rnd = seeded(window);
  const pool = FEATURED_POOL.slice();
  const out = [];
  for (let i = 0; i < FEATURED_COUNT && pool.length; i++) {
    out.push(pool.splice(Math.floor(rnd() * pool.length), 1)[0]);   // draw without replacement — never 3 of the same
  }
  return out;
}

/** When the current window flips (ms epoch) — the client counts down to it. */
function rotatesAt(now = Date.now()) { return (Math.floor(now / ROTATE_MS) + 1) * ROTATE_MS; }

const SHOP_STOCK = CONSUMABLES.map(c => ({ key: c.key, value: c.value }))
  // Restoration reagent (diamond_dust) is a live need; the Raise Dead diamond is
  // NOT sold here (Tobias 2026-07-13: raise dead only surfaces when someone's
  // actually dead, at the pub) — it's a rare treasure find.
  .concat(COMPONENTS.filter(c => c.component !== 'raisedead').map(c => ({ key: c.key, value: c.value })))
  .concat(GEAR.map(g => ({ key: g.key, value: g.value })))          // plain/masterwork steel — the boring, always-there stuff
  .concat(MAGIC_GEAR.map(g => ({ key: g.key, value: g.value })))    // +1/+2 weapons & armor
  .filter(x => x.value > 0)
  .sort((a, b) => a.value - b.value);
// Signature weapons are NOT staples — they only ever appear in the 3 rotating
// slots, so walking past the stall is never the same twice.

const ALL = CONSUMABLES.concat(GEAR).concat(MAGIC_GEAR).concat(SIGNATURE_GEAR).concat(COMPONENTS).concat(VALUABLES);
const ITEM_BY_KEY = Object.fromEntries(ALL.map(i => [i.key, i]));
const TOTAL_WEIGHT = ALL.reduce((s, i) => s + i.weight, 0);

/** Weighted pick of one early-treasure item key (consumable or gear). */
function rollTreasureItem(roll = Math.random) {
  let n = roll() * TOTAL_WEIGHT;
  for (const it of ALL) { n -= it.weight; if (n < 0) return it.key; }
  return ALL[0].key;
}

/**
 * A named weapon in the hoard. These are the best things in the game, so they are
 * RARE and they get rarer the shallower you are: no chance at all above depth 3,
 * then ~2% a room, creeping to a ceiling of ~10% in the deep dark. Returns an item
 * key or null. (They carry weight:0, so they can never fall out of the ordinary
 * weighted item roll — this is their ONLY way into a hoard.)
 */
function rollSignature(depth = 1, roll = Math.random) {
  if (depth < 3) return null;
  const chance = Math.min(0.10, 0.02 + (depth - 3) * 0.01);
  if (roll() >= chance) return null;
  return SIGNATURE_GEAR[Math.floor(roll() * SIGNATURE_GEAR.length)].key;
}

/** Roll a consumable's numeric effect amount (heal or damage). */
function rollAmount(item, roll = Math.random) {
  const e = item.effect;
  return Math.max(1, rollDice(e.count, e.sides, roll) + (e.bonus || 0));
}

module.exports = {
  COMPONENTS, MAGIC_GEAR, VALUABLES, PRICED_MAGIC, SHOP_STOCK, CONSUMABLES, GEAR, ITEMS: ALL, ITEM_BY_KEY, rollTreasureItem, rollAmount,
  SIGNATURE_GEAR, FEATURED_POOL, featuredKeys, rotatesAt, ROTATE_MS, FEATURED_COUNT, rollSignature };
