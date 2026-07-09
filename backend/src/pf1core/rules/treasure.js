/**
 * PF1 treasure-by-CR curves — extracted from poker game/dungeon/loot.js (Phase A,
 * 2026-07-09). The distribution mechanism (poker's roll-off/hock UI, PGM's party
 * bag) is app-side; these curves are the shared rules.
 */

/** Drop chance + max enhancement tier for an encounter of this CR.
 *  +1 ≈ CR 4-6, +2 ≈ CR 7-9, +3 ≈ CR 10-12, +4 ≈ CR 13-15, +5 ≈ CR 16+. */
function lootForCR(cr) {
  const chance = cr < 3 ? 0.04 : Math.min(0.55, 0.10 + 0.045 * (cr - 3));
  const maxTier = cr >= 16 ? 5 : cr >= 13 ? 4 : cr >= 10 ? 3 : cr >= 7 ? 2 : 1;
  return { chance, maxTier };
}

/** A drop centers on the encounter's ceiling: max tier or one below (50/50). */
function rollLootTier(maxTier, roll = Math.random) {
  if (maxTier <= 1) return 1;
  const floor = Math.max(1, maxTier - 1);
  return floor + (roll() < 0.5 ? 1 : 0);
}

/** CR-scaled cure potion (Light / Moderate / Serious). */
function potionForCR(cr) {
  if (cr >= 10) return { name: 'Cure Serious Wounds',  count: 3, die: 8, bonus: 5, gp: 750 };
  if (cr >= 5)  return { name: 'Cure Moderate Wounds', count: 2, die: 8, bonus: 3, gp: 300 };
  return          { name: 'Cure Light Wounds',    count: 1, die: 8, bonus: 1, gp: 50 };
}

module.exports = { lootForCR, rollLootTier, potionForCR };
