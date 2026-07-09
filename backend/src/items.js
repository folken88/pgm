/**
 * Vetted low-level treasure items — the start of PGM's PF1 loot system. Every
 * item here has a working in-game mechanism (represent -> carry -> use), so it is
 * eligible to drop (per the vetting rule; see docs/ITEMS-VETTING.md).
 *
 * effect.kind:
 *   'heal'  — restore hp to an ally (count d sides + bonus)
 *   'throw' — deal damage to an enemy (count d sides + bonus, of dtype)
 *
 * `weight` biases the early-treasure roll (commoner items drop more often).
 */
const { rollDice } = require('./dice');

const ITEMS = [
  { key: 'potion_clw', name: 'Potion of Cure Light Wounds', short: 'CLW potion', type: 'potion',
    verb: 'drink', icon: '🧪', value: 50, weight: 6,
    effect: { kind: 'heal', count: 1, sides: 8, bonus: 1 } },
  { key: 'potion_cmw', name: 'Potion of Cure Moderate Wounds', short: 'CMW potion', type: 'potion',
    verb: 'drink', icon: '🧪', value: 300, weight: 1,
    effect: { kind: 'heal', count: 2, sides: 8, bonus: 3 } },
  { key: 'alchemists_fire', name: "Alchemist's Fire", short: "alch. fire", type: 'alchemical',
    verb: 'throw', icon: '🔥', value: 20, weight: 4,
    effect: { kind: 'throw', count: 1, sides: 6, bonus: 0, dtype: 'fire' } },
  { key: 'acid_flask', name: 'Acid Flask', short: 'acid flask', type: 'alchemical',
    verb: 'throw', icon: '🧴', value: 10, weight: 4,
    effect: { kind: 'throw', count: 1, sides: 6, bonus: 0, dtype: 'acid' } },
];
const ITEM_BY_KEY = Object.fromEntries(ITEMS.map(i => [i.key, i]));
const TOTAL_WEIGHT = ITEMS.reduce((s, i) => s + i.weight, 0);

/** Weighted pick of one early-treasure item key (deterministic via roll). */
function rollTreasureItem(roll = Math.random) {
  let n = roll() * TOTAL_WEIGHT;
  for (const it of ITEMS) { n -= it.weight; if (n < 0) return it.key; }
  return ITEMS[0].key;
}

/** Roll an item's numeric effect amount (heal or damage). */
function rollAmount(item, roll = Math.random) {
  const e = item.effect;
  return Math.max(1, rollDice(e.count, e.sides, roll) + (e.bonus || 0));
}

module.exports = { ITEMS, ITEM_BY_KEY, rollTreasureItem, rollAmount };
