/**
 * PF1 condition semantics — extracted from poker Dungeon.js (Phase A of the
 * PF1-engine extraction, 2026-07-09). Poker smeared these across 4 files; this is
 * the consolidated module both apps share.
 *
 * CANONICAL FLAG SCHEMA (identical on heroes and enemies — poker convention):
 *   numeric flags count down in rounds (ticked at the owner's turn start);
 *   boolean flags are binary. See CONDITIONS below for each flag's effects.
 */

// Creature types with no mind to affect (charm/sleep/fascinate/hold/laughter).
const MIND_IMMUNE_TYPES = new Set(['undead', 'construct']);
function mindImmune(e) { return !!e && MIND_IMMUNE_TYPES.has(e.type); }

// Fights with natural weapons / unarmed (claws, fangs, slams) — can't be disarmed.
const NATURAL_TYPES = new Set(['animal', 'vermin', 'ooze', 'magical beast', 'aberration', 'plant']);
function fightsNatural(e) { return !!e && (e.natural || NATURAL_TYPES.has(e.type)); }

// "Already taken out of the fight" by crowd control — don't waste fresh CC on them.
function ccd(o) { return !!o && (o.asleep || o.fascinated || o.charmed || (o.paralyzed > 0) || o.prone || (o.stunned > 0) || (o.nauseated > 0)); }

// Numeric penalties (poker constants, PF1 values).
const SICKENED_PENALTY = 2;   // −2 attack/damage/saves (PF1 sickened; NO AC penalty)
const SICKENED_ROUNDS = 3;
const HIGH_GROUND_HIT = 1;    // flyer attacking grounded target: +1 to hit
const HIGH_GROUND_AC = 2;     // flyer vs grounded attackers: +2 AC
const PARALYZE_DC = 14;       // ghoul-style paralysis default DC

/**
 * The implemented condition set + mechanical deltas. `duration:'rounds'` = numeric
 * countdown flag; 'flag' = boolean. Effects here are DOCUMENTATION-grade; the
 * numeric application lives in spellmath.enemyAC / enemySave / attack math.
 */
const CONDITIONS = {
  sickened:   { duration: 'rounds', atk: -SICKENED_PENALTY, dmg: -SICKENED_PENALTY, saves: -SICKENED_PENALTY, ac: 0 },
  nauseated:  { duration: 'rounds', skipTurn: true },                      // the save-or-lose half of sickened
  blinded:    { duration: 'rounds', atk: -4, ac: -2, denyDex: true },
  paralyzed:  { duration: 'rounds', skipTurn: true, resave: 'will' },      // + heldDC on the flag owner when spell-held
  slowed:     { duration: 'rounds', atk: -1, ac: -1, reflex: -1, oneAction: true },   // slow/staggered
  grappled:   { duration: 'rounds', atk: -2, toBeHit: +2, concentrationDC: '10 + grappler CMB + spell level', escape: 'CMB vs CMD' },
  prone:      { duration: 'flag', acVsMelee: -4, acVsRanged: +4, selfAtk: -4, stand: 'move action' },
  stunned:    { duration: 'rounds', skipTurn: true, ac: -2 },
  asleep:     { duration: 'flag', skipTurn: true, breaksOnHit: true },
  fascinated: { duration: 'flag', skipTurn: true, breaksOnHit: true },
  charmed:    { duration: 'flag', wontAttack: true, breaksOnDamage: true },
  dominated:  { duration: 'flag', fightsForCaster: true, resave: 'will' }, // + dominatedBy
  darkened:   { duration: 'rounds', untargetable: true },                  // Darkness shroud (2 rds)
  prayed:     { duration: 'rounds', atk: -1, dmg: -1, saves: -1 },         // enemy under party's Prayer
  flatFooted: { duration: 'flag', ac: -2, denyDex: true },                 // hasn't acted / failed to perceive
};

module.exports = {
  MIND_IMMUNE_TYPES, mindImmune, NATURAL_TYPES, fightsNatural, ccd,
  SICKENED_PENALTY, SICKENED_ROUNDS, HIGH_GROUND_HIT, HIGH_GROUND_AC, PARALYZE_DC,
  CONDITIONS,
};
