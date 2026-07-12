/**
 * PF1 TREASURE TABLES — RAW economy (Tobias 2026-07-11: "PF1 RAW values").
 *
 * Value: Core Table 12-5 "Treasure Values per Encounter", MEDIUM XP track,
 * keyed by the room's effective encounter CR (inverted from the XP actually
 * spent on its foes). Composition: coins + gems + art objects + vetted magic
 * items. VETTED slice (Tobias-approved): coins, gems, art (sellable at the
 * Swashgoblin), potions, +1/+2 weapons & armor, spell components. Unvetted
 * table results (wands/scrolls/rings/wondrous) are DIVERTED to equal-value
 * gems per the diversion rule — each diversion is reported so the vetting
 * ledger stays honest. See docs/ITEMS-VETTING.md.
 */
const { rollDie } = require('./dice');
let _items = null;   // late-bound: items.js requires treasure.js for GEMS/ART
function itemsMod() { return _items || (_items = require('./items')); }

// Core Table 12-5, Medium track (gp per encounter of this CR).
const TREASURE_BY_CR = {
  1: 260, 2: 550, 3: 800, 4: 1150, 5: 1550, 6: 2000, 7: 2600, 8: 3350,
  9: 4250, 10: 5450, 11: 7000, 12: 9000, 13: 11600, 14: 15000, 15: 19500,
  16: 25000, 17: 32000, 18: 41000, 19: 52000, 20: 67000,
};

// Standard PF1 gems by tier (typical values). The diamond IS the Raise Dead
// component; diamond dust rides the 100gp tier.
const GEMS = [
  { key: 'gem_azurite', name: 'Azurite', value: 10 },
  { key: 'gem_obsidian', name: 'Obsidian', value: 10 },
  { key: 'gem_bloodstone', name: 'Bloodstone', value: 50 },
  { key: 'gem_moonstone', name: 'Moonstone', value: 50 },
  { key: 'gem_amber', name: 'Amber', value: 100 },
  { key: 'gem_garnet', name: 'Garnet', value: 100 },
  { key: 'gem_pearl', name: 'White Pearl', value: 500 },
  { key: 'gem_topaz', name: 'Golden Topaz', value: 500 },
  { key: 'gem_emerald', name: 'Emerald', value: 1000 },
  { key: 'gem_sapphire', name: 'Blue Sapphire', value: 1000 },
];

// PF1-style art objects (Core "art objects" list, rounded values).
const ART = [
  { key: 'art_silver_ewer', name: 'Silver Ewer', value: 55 },
  { key: 'art_bone_fetish', name: 'Carved Bone Fetish', value: 30 },
  { key: 'art_ivory_comb', name: 'Ivory Comb with Gold Inlay', value: 100 },
  { key: 'art_bronze_bust', name: 'Bronze Bust of a Forgotten King', value: 150 },
  { key: 'art_silk_tapestry', name: 'Embroidered Silk Tapestry', value: 250 },
  { key: 'art_gold_idol', name: 'Small Gold Idol', value: 600 },
  { key: 'art_jeweled_dagger', name: 'Ceremonial Jeweled Dagger', value: 750 },
  { key: 'art_gem_crown', name: 'Gem-Studded Circlet', value: 1500 },
];

/** Effective encounter CR from XP actually spent on the room's foes. */
function crForXp(xp, xpForCR) {
  let best = 1, bestDiff = Infinity;
  for (let cr = 1; cr <= 20; cr++) {
    const d = Math.abs(xpForCR(cr) - xp);
    if (d < bestDiff) { bestDiff = d; best = cr; }
  }
  return best;
}

function pickAffordable(list, budget, roll) {
  const afford = list.filter(x => x.value <= budget);
  if (!afford.length) return null;
  return afford[Math.floor(roll() * afford.length)];
}

/**
 * Roll a room's treasure. Returns { coins, drops: [{key, qty}], diverted, prose }.
 * `magicItems` = the vetted priced pool from items.js (potions, +N gear,
 * components). ~1 in 6 magic rolls simulates an UNVETTED table hit and is
 * diverted to a gem of comparable value (counted + narrated for the ledger).
 */
function rollTreasure(totalXp, xpForCR, roll = Math.random) {
  const cr = crForXp(totalXp, xpForCR);
  const base = TREASURE_BY_CR[cr] || 260;
  // ±30% swing so rooms vary; the CR curve does the real scaling.
  let value = Math.round(base * (0.7 + roll() * 0.6));
  const out = { coins: 0, drops: [], diverted: 0, cr };

  // Coins: 30-60% of the hoard.
  out.coins = Math.round(value * (0.3 + roll() * 0.3));
  let rest = value - out.coins;

  const magicPool = itemsMod().PRICED_MAGIC;   // vetted: potions, +N gear, components
  let guard = 0;
  while (rest >= 10 && guard++ < 12) {
    const r = roll();
    let picked = null;
    if (r < 0.40) picked = pickAffordable(GEMS, rest, roll);
    else if (r < 0.65) picked = pickAffordable(ART, rest, roll);
    else {
      // Magic-item slot. 1-in-6 of these is an "unvetted table result"
      // (wand/scroll/ring/wondrous) -> DIVERT to a gem of equal-ish value.
      if (rollDie(6, roll) === 1) {
        const g = pickAffordable(GEMS, rest, roll);
        if (g) { out.drops.push({ key: g.key, qty: 1 }); out.diverted += 1; rest -= g.value; }
        continue;
      }
      picked = pickAffordable(magicPool, rest, roll);
    }
    if (!picked) break;
    out.drops.push({ key: picked.key, qty: 1 });
    rest -= picked.value;
  }
  out.coins += Math.max(0, rest);   // remainder back into coin
  return out;
}

/** Room-clear narration (Tobias 2026-07-12): announce the TOTAL value of coin
 *  + gems + art as one number, then call out magic items (potions, +N gear)
 *  and notable components by name — not a gem-by-gem readout. */
function prose(t) {
  const ITEMS = itemsMod();
  let value = t.coins;
  const notable = [];
  for (const d of t.drops) {
    const it = ITEMS.ITEM_BY_KEY[d.key];
    if (!it) { notable.push(d.key); continue; }
    if (it.type === 'valuable') value += (it.value || 0) * (d.qty || 1);   // gems/art fold into the total
    else notable.push(it.name + (d.qty > 1 ? ' ×' + d.qty : ''));      // potions, +N gear, components
  }
  let s = `${value} gold in coin and valuables`;
  if (notable.length) s += ', plus ' + (notable.length === 1 ? notable[0] : notable.slice(0, -1).join(', ') + ' and ' + notable[notable.length - 1]);
  return s;
}

module.exports = { TREASURE_BY_CR, GEMS, ART, rollTreasure, crForXp, prose };
