/**
 * PF1 spellcasting math — extracted from poker game/dungeon/abilities.js (Phase A
 * of the PF1-engine extraction, 2026-07-09). Faithful ports of the pure helpers
 * poker breadcrumbed `// PF1CORE:`; de-`this`ed into plain functions.
 *
 * Adaptation rules vs the poker originals:
 *  - No narration: functions return result objects with full roll breakdowns
 *    ({roll, total, ...}); the app layer narrates.
 *  - Injectable RNG: every roller takes an optional trailing `roll` () => [0,1)
 *    (deterministic tests). Poker used a module-global dRoll.
 *  - `isRanged` (feat-table selector) derives from m.weapon.ranged unless passed.
 *  - CAST_MOD fallback: poker defaulted a missing castingMod to +4 (legacy table
 *    bots). Here the default is 0 — both apps derive castingMod via
 *    character.deriveCharacter, so the fallback should never bite.
 */
const { fighterFeats } = require('../pf1data/feats');
const { babFor } = require('../pf1data/classes');
const { diceCount, isSpontaneous } = require('../pf1data/abilities');
const RACES = require('../pf1data/races');
const { SICKENED_PENALTY, HIGH_GROUND_AC } = require('./conditions');

function d20(roll = Math.random) { return 1 + Math.floor(roll() * 20); }
function dN(count, sides, roll = Math.random) { let t = 0; for (let i = 0; i < count; i++) t += 1 + Math.floor(roll() * sides); return t; }
function isRangedOf(m, opt) { return opt != null ? !!opt : !!(m && m.weapon && m.weapon.ranged); }

/** Spell save DC: 10 + spell level (or level/2 for non-slvl abilities) + casting
 *  stat (theurge dcStat int/wis/'best') + feat bonus + Spell Synthesis (+4). */
function spellDC(m, ab, opts = {}) {
  const base = (ab && ab.slvl >= 1) ? ab.slvl : Math.floor((m.level || 1) / 2);
  const stat = (ab && ab.dcStat === 'best' && m.mods) ? Math.max(m.mods.int || 0, m.mods.wis || 0)
             : (ab && ab.dcStat && m.mods && m.mods[ab.dcStat] != null) ? m.mods[ab.dcStat]
             : (m.castingMod != null ? m.castingMod : 0);
  return 10 + base + stat + (fighterFeats(m.cls, m.level, isRangedOf(m, opts.ranged)).spellDC || 0) + (m._synthActive ? 4 : 0);
}

/** Generic saving throw: nat 20 auto-saves, nat 1 auto-fails. */
function saveVs(bonus, dc, roll = Math.random) {
  const r = d20(roll);
  return { roll: r, total: r + bonus, saved: r === 20 ? true : r === 1 ? false : (r + bonus) >= dc };
}

/** Enemy save bonus by kind; Will ≈ avg(fort, reflex). Prayer + sickened drag all;
 *  slow drags Reflex −1. */
function enemySave(e, which) {
  const pray = (e.prayed || 0) + (e.sickened > 0 ? SICKENED_PENALTY : 0);
  if (which === 'fort') return (e.fort || 0) - pray;
  if (which === 'reflex') return (e.reflex || 0) - pray - (e.slowed > 0 ? 1 : 0);
  return Math.floor(((e.fort || 0) + (e.reflex || 0)) / 2) - pray;
}

/** Spell Resistance check, caster m vs creature e: d20 + CL (+Spell Pen, +Synthesis)
 *  ≥ SR. Only leveled spells (ab.slvl != null) test SR. NO auto 20/1 (PF1 caster-
 *  level checks). Returns null when SR doesn't apply, else a result object. */
function srCheck(m, e, ab, opts = {}) {
  if (!e || !(e.sr > 0) || !ab || ab.slvl == null) return null;
  const pen = fighterFeats(m.cls, m.level, isRangedOf(m, opts.ranged)).spellPen || 0;
  const bonus = (m.level || 1) + pen + (m._synthActive ? 4 : 0);
  const r = d20(opts.roll);
  return { roll: r, total: r + bonus, sr: e.sr, blocked: (r + bonus) < e.sr };
}

/** Enemy spell vs a hero with racial SR (e.g. drow). casterLevel = the foe's CL
 *  (poker used max(1, crToNum(cr) || level)). */
function srCheckVsHero(m, casterLevel, roll = Math.random) {
  const sr = RACES.raceSR(m.race, m.level);
  if (!(sr > 0)) return null;
  const r = d20(roll);
  return { roll: r, total: r + casterLevel, sr, blocked: (r + casterLevel) < sr };
}

/** A foe's effective caster level: CR stands in for CL. */
function enemyCL(e) {
  const { crToNum } = require('../pf1data/monsters');
  return Math.max(1, crToNum(e.cr) || (e.level || 0) || 1);
}

/** Ranged-touch spell attack bonus. HOUSE RULE: casters aim rays with their
 *  SPELL stat, not Dex — BAB + casting-stat mod. */
function spellToHit(m) { return babFor(m.cls || 'fighter', m.level || 1) + (m.castingMod != null ? m.castingMod : 0); }

/** Effective enemy AC for an attack. opts: {touch, melee, ranged}. Flat-footed
 *  −2 (denied Dex), stunned −2, prone −4 vs melee / +4 vs ranged, slowed −1,
 *  blinded −2, flying +HIGH_GROUND_AC, Fight Defensively +2. */
function enemyAC(e, opts = {}) {
  let base = opts.touch ? (e.touchAC != null ? e.touchAC : Math.max(10, e.ac - 5)) : e.ac;
  if (e.flatFooted) base = Math.max(10, base - 2);
  const rangedAtk = !!(opts.ranged || (opts.touch && !opts.melee));
  const glory = e.gloriousChallenge ? 2 * (e.gloriousN || 0) : 0;
  return base - glory - (e.stunned > 0 ? 2 : 0) + (e.prone ? (rangedAtk ? 4 : -4) : 0) - (e.slowed > 0 ? 1 : 0) - (e.blinded > 0 ? 2 : 0) + (e.flying ? HIGH_GROUND_AC : 0) + (e.fdOn ? 2 : 0);
}

// ── METAMAGIC (PF1) ────────────────────────────────────────────────────────
/** Active spontaneous toggles (m.metamagic) ∪ bot one-shot (m._botMM). */
function spontMM(m) {
  const t = (isSpontaneous(m.cls) && m.metamagic) ? m.metamagic : null;
  const b = m._botMM || null;
  if (!t && !b) return null;
  return { intensify: !!((t && t.intensify) || (b && b.intensify)), empower: !!((t && t.empower) || (b && b.empower)),
           maximize: !!((t && t.maximize) || (b && b.maximize)), quicken: !!((t && t.quicken) || (b && b.quicken)) };
}
/** The metamagic that APPLIES to this cast (baked prepared flags ∪ toggles);
 *  Empower/Maximize/Intensify only matter on dice spells. */
function mmForCast(m, ab) {
  const s = spontMM(m) || {};
  const wantI = !!((ab && ab.intensified) || s.intensify), wantE = !!((ab && ab.empowered) || s.empower);
  const wantM = !!((ab && ab.maximized) || s.maximize), wantQ = !!((ab && ab.quickened) || s.quicken);
  const dice = !!(ab && ab.dice);
  return { intensify: wantI && dice && !!(ab && ab.dcap), empower: wantE && dice, maximize: wantM && dice, quicken: wantQ };
}
function mmAdjust(mm) { return mm ? ((mm.intensify ? 1 : 0) + (mm.empower ? 2 : 0) + (mm.maximize ? 3 : 0) + (mm.quicken ? 4 : 0)) : 0; }
/** Effective slot level for a spontaneous 'slot' cast (prepared casts never bump). */
function slotLevelFor(m, ab) {
  if (ab.cost !== 'slot') return ab.slvl || 0;
  const s = spontMM(m); if (!s) return ab.slvl || 0;
  const dice = !!(ab && ab.dice);
  const adj = (s.intensify && dice && ab.dcap ? 1 : 0) + (s.empower && dice ? 2 : 0) + (s.maximize && dice ? 3 : 0) + (s.quicken ? 4 : 0);
  return (ab.slvl || 0) + adj;
}

/** Spell damage dice count: level scaling + Intensify (+5 cap) + typed CL bonus
 *  (e.g. Staff of Lightning: m.lightningCL on electricity spells). */
function spellDice(ab, m) {
  const mm = mmForCast(m, ab);
  const eab = (mm.intensify && ab.dcap && ab.dice) ? { ...ab, dcap: ab.dcap + 5 } : ab;
  const clBonus = (m.lightningCL && ab.dtype === 'electricity') ? m.lightningCL : 0;
  return diceCount(eab, (m.level || 1) + clBonus);
}
/** Roll spell damage with metamagic: MAXIMIZE = max dice; EMPOWER = +50%; they
 *  STACK per PF1 RAW (max the dice, add half a fresh roll). */
function rollSpellDamage(m, dice, die, ab, roll = Math.random) {
  const mm = mmForCast(m, ab);
  let dmg = mm.maximize ? dice * die : dN(dice, die, roll);
  if (mm.empower) dmg += Math.floor((mm.maximize ? dN(dice, die, roll) : dmg) * 0.5);
  return dmg;
}

/** PF1 dispel check: d20 + CL (+4 Greater) vs DC 11 + effect CL. No auto 20. */
function dispelCheck(m, effectCL, greater, roll = Math.random) {
  const cl = (m.level || 1) + (greater ? 4 : 0);
  const r = d20(roll), total = r + cl, dc = 11 + Math.max(1, effectCL | 0);
  return { ok: total >= dc, roll: r, total, dc, cl };
}

/** Concentration check to cast while grappled: DC 10 + grappler CMB + spell level;
 *  roll d20 + CL + castingMod (+4 Combat Casting via feat table). */
function concentrationWhileGrappled(m, grapplerCMB, ab, opts = {}) {
  const dc = 10 + (grapplerCMB || 0) + ((ab && ab.slvl) || 0);
  const combatCasting = fighterFeats(m.cls, m.level, isRangedOf(m, opts.ranged)).combatCasting ? 4 : 0;
  const bonus = (m.level || 1) + (m.castingMod || 0) + combatCasting;
  const r = d20(opts.roll);
  return { roll: r, total: r + bonus, dc, ok: (r + bonus) >= dc };
}

module.exports = {
  spellDC, saveVs, enemySave, srCheck, srCheckVsHero, enemyCL, spellToHit, enemyAC,
  spontMM, mmForCast, mmAdjust, slotLevelFor, spellDice, rollSpellDamage,
  dispelCheck, concentrationWhileGrappled,
};
