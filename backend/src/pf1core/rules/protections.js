/**
 * PF1 protections — energy resistance/immunity, damage reduction, and spell-
 * legality gates. Extracted from poker Dungeon.js/abilities.js (Phase A, 2026-07-09).
 */
const { mindImmune } = require('./conditions');

/** Energy-resistance multiplier for a damage type: 0 immune, 0.5 resistant,
 *  1.5 vulnerable, 1 unchanged. Type-driven undead (cold/poison) and construct
 *  (poison) immunities apply when no explicit entry exists. */
function resistMult(e, dtype) {
  if (!dtype || !e) return 1;
  if (e.resist && e.resist[dtype] != null) return e.resist[dtype];
  if (e.type === 'undead' && (dtype === 'cold' || dtype === 'poison')) return 0;
  if (e.type === 'construct' && dtype === 'poison') return 0;
  return 1;
}

/** Damage after resistance (vulnerable rounds up; resisted keeps ≥1 unless immune). */
function resisted(e, dmg, dtype) {
  const mult = resistMult(e, dtype);
  if (mult === 1) return dmg;
  if (mult === 0) return 0;
  return Math.max(1, Math.round(dmg * mult));
}

/** Apply DR to physical damage. dr = number (DR/—) or {amount, bypass} where
 *  bypass ∈ 'magic' | 'S' | 'P' | 'B'. `pierce` = Penetrating Strike points.
 *  Returns the damage that gets through. */
function applyDR(target, dmg, weapon, pierce = 0) {
  const raw = target && target.dr;
  if (!raw) return dmg;
  const amount = Math.max(0, ((typeof raw === 'object') ? (raw.amount || 0) : raw) - (pierce || 0));
  if (amount <= 0) return dmg;
  const bypass = (typeof raw === 'object') ? raw.bypass : null;
  let bypassed = false;
  if (bypass === 'magic') bypassed = !!(weapon && (weapon.dmgBonus > 0 || weapon.custom));
  else if (bypass && bypass !== '—') bypassed = !!(weapon && weapon.dtype === bypass);
  if (bypassed) return dmg;
  return Math.max(0, dmg - amount);
}

/** Readable DR description ("DR 10/magic") for the once-per-fight reveal. */
function drDesc(dr) {
  if (!dr) return '';
  const amount = (typeof dr === 'object') ? dr.amount : dr;
  const bypass = (typeof dr === 'object') ? dr.bypass : null;
  const TYPE = { S: 'slashing', P: 'piercing', B: 'bludgeoning' };
  return `DR ${amount}/${bypass === 'magic' ? 'magic' : (TYPE[bypass] || '—')}`;
}

/** PF1 RAW humanoid classification (Hold Person legality). Giants ARE humanoids;
 *  monstrous humanoids/undead/constructs/etc. are not. Uses .type when present,
 *  else the name-pattern net. */
function isHumanoid(t) {
  if (t.type && ['undead', 'construct', 'outsider', 'dragon', 'aberration', 'animal', 'vermin', 'ooze', 'plant', 'magical beast', 'monstrous humanoid'].includes(t.type)) return false;
  return !/golem|dragon|drake|wyvern|devil|demon|daemon|fiend|ooze|mouther|spider|centipede|\brat\b|badger|boar|bear\b|\bape\b|wolf|caimon|basilisk|chimera|ettercap|harpy|gargoyle|minotaur|medusa|horror|elemental|shadow|skelet|zombie|ghoul|ghast|wight|vampire|lich|ghost|wraith|specter|spectre|spirit/i.test(t.name || '');
}

/** Would this spell/ability have ANY effect on target t? (mind-affecting vs the
 *  mindless, death effects vs the unliving, Banishment outsiders-only, Hold Person
 *  humanoids-only, negative energy heals undead, element immunity, unbeatable SR.)
 *  Used both as a cast-legality gate and by caster AI to avoid wasted slots. */
function spellWorksOn(ab, t) {
  if (!ab || !t) return true;
  const eff = ab.effect;
  if ((eff === 'charm' || eff === 'dominate' || eff === 'masscharm' || eff === 'sleep' || eff === 'fascinate') && mindImmune(t)) return false;
  if (eff === 'exhaust' && (t.type === 'undead' || t.type === 'construct')) return false;
  if (ab.onlyOutsiders && !(t.type === 'outsider' || /demon|devil|daemon|fiend/i.test(t.name || ''))) return false;
  if (ab.onlyHumanoids && !isHumanoid(t)) return false;
  if (eff === 'save_debuff' && ab.debuff === 'paralyzed' && mindImmune(t)) return false;
  if (eff === 'savedie' && (t.type === 'undead' || t.type === 'construct'
    || /golem|skelet|zombie|wraith|ghost|lich|vampire|wight|ghoul|ghast|shadow|ooze|elemental|construct|undead/i.test(t.name || ''))) return false;
  if (ab.dtype === 'negative' && t.type === 'undead') return false;
  if (ab.dtype && ab.dice && resistMult(t, ab.dtype) === 0) return false;
  if (t.sr > 42 && ab.slvl != null) return false;   // SR no caster can ever beat
  return true;
}

module.exports = { resistMult, resisted, applyDR, drDesc, isHumanoid, spellWorksOn };
