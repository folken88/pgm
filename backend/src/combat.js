/**
 * PGM v0 combat resolver — APP-LAYER (PGM owns combat resolution by design;
 * pf1core provides the pure math + data, not the resolver). Deterministic given
 * an injected dice roller, so it's fully unit-testable.
 *
 * Uses pf1core's real attack math:
 *   - deriveCharacter() -> bab, mods, hp (done at character creation)
 *   - attackProfile(derived, weapon) -> toHitMod, dmgBonus, twoHanded, ranged
 *     (this already bakes in Tobias's free-finesse house rule)
 * ...and pf1core weapon data (dmgCount/dmgDie/crit/mult) for damage dice.
 */
const pf1 = require('./pf1core');
const { rollDie, rollDice } = require('./dice');

/** Hero Armor Class for v0: 10 + DEX mod + worn armor bonus. */
function heroAC(derived, armorBonus = 0) {
  return 10 + (derived.mods.dex || 0) + armorBonus;
}

/** Roll weapon damage; on a crit, apply the weapon's multiplier (dice+bonus). */
function weaponDamage(weapon, dmgBonus, crit, roll) {
  const times = crit ? (weapon.mult || 2) : 1;
  let total = 0;
  for (let i = 0; i < times; i++) {
    total += rollDice(weapon.dmgCount || 1, weapon.dmgDie || 4, roll) + dmgBonus;
  }
  return Math.max(1, total);   // a hit always deals at least 1
}

/**
 * Resolve one hero melee attack vs a target AC.
 * Returns { d20, total, hit, crit, damage, threat }.
 */
function heroAttack(derived, weapon, targetAC, roll = Math.random) {
  const ap = pf1.character.attackProfile(derived, weapon);
  const d20 = rollDie(20, roll);
  const total = d20 + derived.bab + ap.toHitMod;
  const natural1 = d20 === 1;
  const natural20 = d20 === 20;
  const hit = !natural1 && (natural20 || total >= targetAC);

  let crit = false, threat = false;
  if (hit && (natural20 || d20 >= (weapon.crit || 20))) {
    threat = true;
    // Confirm: a second attack roll that also meets AC confirms the crit.
    const confirm = rollDie(20, roll) + derived.bab + ap.toHitMod;
    crit = confirm >= targetAC || natural20;
  }
  const damage = hit ? weaponDamage(weapon, ap.dmgBonus, crit, roll) : 0;
  return { d20, total, hit, crit, threat, damage };
}

/**
 * Resolve one creature attack vs the hero's AC. Creatures use flat stat-block
 * numbers (from content.js) rather than pf1core derivation.
 * Returns { d20, total, hit, crit, damage }.
 */
function creatureAttack(creature, targetAC, roll = Math.random) {
  const d20 = rollDie(20, roll);
  const total = d20 + (creature.attack || 0);
  const natural1 = d20 === 1;
  const natural20 = d20 === 20;
  const hit = !natural1 && (natural20 || total >= targetAC);
  let damage = 0;
  if (hit) {
    const dmg = creature.dmg || { count: 1, sides: 4, bonus: 0 };
    damage = Math.max(1, rollDice(dmg.count, dmg.sides, roll) + (dmg.bonus || 0));
  }
  return { d20, total, hit, crit: false, damage };
}

module.exports = { heroAC, heroAttack, creatureAttack, weaponDamage };
