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
const SHOP_STOCK = CONSUMABLES.map(c => ({ key: c.key, value: c.value }))
  .concat(COMPONENTS.map(c => ({ key: c.key, value: c.value })))
  .concat(MAGIC_GEAR.map(g => ({ key: g.key, value: g.value })))
  .filter(x => x.value > 0)
  .sort((a, b) => a.value - b.value);

const ALL = CONSUMABLES.concat(GEAR).concat(MAGIC_GEAR).concat(COMPONENTS).concat(VALUABLES);
const ITEM_BY_KEY = Object.fromEntries(ALL.map(i => [i.key, i]));
const TOTAL_WEIGHT = ALL.reduce((s, i) => s + i.weight, 0);

/** Weighted pick of one early-treasure item key (consumable or gear). */
function rollTreasureItem(roll = Math.random) {
  let n = roll() * TOTAL_WEIGHT;
  for (const it of ALL) { n -= it.weight; if (n < 0) return it.key; }
  return ALL[0].key;
}

/** Roll a consumable's numeric effect amount (heal or damage). */
function rollAmount(item, roll = Math.random) {
  const e = item.effect;
  return Math.max(1, rollDice(e.count, e.sides, roll) + (e.bonus || 0));
}

module.exports = {
  COMPONENTS, MAGIC_GEAR, VALUABLES, PRICED_MAGIC, SHOP_STOCK, CONSUMABLES, GEAR, ITEMS: ALL, ITEM_BY_KEY, rollTreasureItem, rollAmount };
