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
  { key: 'diamond', name: 'Flawless Diamond (5,000gp)', short: 'Raise Dead component', icon: String.fromCodePoint(0x1F48E), type: 'component', component: 'raisedead' },
  { key: 'diamond_dust', name: 'Diamond Dust (100gp)', short: 'Restoration component', icon: String.fromCodePoint(0x2728), type: 'component', component: 'restoration' },
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

const ALL = CONSUMABLES.concat(GEAR).concat(COMPONENTS);
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
  COMPONENTS, CONSUMABLES, GEAR, ITEMS: ALL, ITEM_BY_KEY, rollTreasureItem, rollAmount };
