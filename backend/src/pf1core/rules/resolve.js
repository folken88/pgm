/**
 * PF1 spell-effect resolvers — Phase B of the PF1-engine extraction (2026-07-09).
 * Faithful compute-halves of poker's `_ab*` handlers (game/dungeon/abilities.js),
 * with the narration stripped out: each resolver returns a RESULT OBJECT carrying
 * every number the app needs to narrate (rolls, DCs, tallies, riders).
 *
 * Conventions:
 *  - Resolvers MUTATE the passed combatant objects (hp, condition flags) exactly
 *    like poker's originals — the result object is for narration, not re-application.
 *  - Injectable RNG via opts.roll (() => [0,1)); defaults Math.random.
 *  - Ability objects (`ab`) use the shared SPELL/kit schema (pf1data/abilities).
 *  - Caster (`m`) / enemy (`e`) shapes follow the shared combatant flag schema
 *    (see rules/conditions.js).
 */
const S = require('./spellmath');
const P = require('./protections');
const { babFor } = require('../pf1data/classes');

function d20(roll = Math.random) { return 1 + Math.floor(roll() * 20); }
function dN(count, sides, roll = Math.random) { let t = 0; for (let i = 0; i < count; i++) t += 1 + Math.floor(roll() * sides); return t; }

/** Apply (resisted) damage of dtype to a creature — port of poker's _dmgE minus
 *  narration. Handles fire-ward soak, resistance/immunity, snapping Sleep/
 *  Fascinate on any hit, and charm-break on damage. Mutates e. */
function dmgTo(e, raw, dtype) {
  let dealt = P.resisted(e, raw, dtype);
  const out = { raw, dealt: 0, dtype, immune: dealt === 0 && raw > 0 && P.resistMult(e, dtype) === 0,
    resisted: P.resistMult(e, dtype) < 1 && P.resistMult(e, dtype) > 0, vulnerable: P.resistMult(e, dtype) > 1,
    wardSoak: 0, wardBurnedOut: false, charmBroken: false, slain: false };
  if (dtype === 'fire' && e.fireWard > 0 && dealt > 0) {
    const soak = Math.min(e.fireWard, dealt);
    e.fireWard -= soak; dealt -= soak;
    out.wardSoak = soak; out.wardBurnedOut = e.fireWard <= 0;
  }
  e.hp -= dealt;
  if (e.fascinated) { e.fascinated = false; e.asleep = false; }
  if (e.charmed && dealt > 0 && e.hp > 0) { e.charmed = false; out.charmBroken = true; }
  out.dealt = dealt; out.slain = e.hp <= 0;
  return out;
}

/** One ranged-touch attack roll vs e. */
function touchAttack(m, e, toHit, roll) {
  const touchAC = S.enemyAC(e, { touch: true });
  const r = d20(roll), total = r + toHit;
  return { roll: r, total, touchAC, toHit, hit: r === 20 || (r !== 1 && total >= touchAC) };
}

/** Cantrip (at-will ranged touch, iteratives with level): port of _abCantrip.
 *  `nextTarget()` supplies a living foe when the current one drops. */
function resolveCantrip(m, target, ab, nextTarget, opts = {}) {
  const cm = m.castingMod || 0;
  const offs = (m.iteratives && m.iteratives.length) ? m.iteratives : [0];
  const attacks = [];
  for (const off of offs) {
    if (!target || target.hp <= 0) target = nextTarget ? nextTarget() : null;
    if (!target) break;
    const base = babFor(m.cls || 'fighter', m.level || 1) + cm + off;
    const atk = touchAttack(m, target, base, opts.roll);
    const entry = { target, ...atk };
    if (atk.hit) {
      const raw = Math.max(1, dN(ab.dice || 1, ab.die || 6, opts.roll) + cm);
      entry.dmg = dmgTo(target, raw, ab.dtype);
    }
    attacks.push(entry);
  }
  return { kind: 'cantrip', attacks };
}

/** Single ranged-touch bolt (leveled): port of _abBolt (non-cantrip path). */
function resolveBolt(m, e, ab, opts = {}) {
  const atk = touchAttack(m, e, S.spellToHit(m), opts.roll);
  const res = { kind: 'bolt', target: e, ...atk };
  if (atk.hit) {
    const raw = Math.max(1, S.rollSpellDamage(m, S.spellDice(ab, m), ab.die || 3, ab, opts.roll) + (ab.flat || 0));
    res.dmg = dmgTo(e, raw, ab.dtype);
  }
  return res;
}

/** Touch spell (Shocking Grasp / Searing Light / Vampiric Touch / Acid Arrow):
 *  port of _abTouch incl. the Searing Light per-type table, lifesteal, DoT rider. */
function resolveTouch(m, e, ab, opts = {}) {
  const toHit = S.spellToHit(m) + ((m.buffs && m.buffs.toHit) || 0);
  const atk = touchAttack(m, e, toHit, opts.roll);
  const res = { kind: 'touch', target: e, ...atk };
  if (!atk.hit) return res;
  let dice, die; const lvl = Math.max(1, m.level || 1);
  if (ab.searing) {
    const lightVuln = e.lightVuln || /vampire/i.test(e.name || '');
    if (lightVuln)                   { dice = Math.min(10, lvl); die = 8; res.searing = 'lightVuln'; }
    else if (e.type === 'undead')    { dice = Math.min(10, lvl); die = 6; res.searing = 'undead'; }
    else if (e.type === 'construct') { dice = Math.max(1, Math.min(5, Math.floor(lvl / 2))); die = 6; res.searing = 'construct'; }
    else                             { dice = S.spellDice(ab, m); die = ab.die || 8; }
  } else { dice = S.spellDice(ab, m); die = ab.die || 6; }
  const raw = Math.max(1, S.rollSpellDamage(m, dice, die, ab, opts.roll));
  res.dmg = dmgTo(e, raw, ab.dtype);
  if (ab.lifesteal && res.dmg.dealt > 0 && m.hp > 0) {
    const before = m.hp; m.hp = Math.min(m.maxHp, m.hp + res.dmg.dealt);
    res.lifeStolen = m.hp - before;
  }
  if (ab.dot && e.hp > 0) {
    const rounds = Math.min(5, Math.max(1, Math.floor(lvl / 3)));
    e.acid = { rounds, dice: Math.max(1, Math.floor(dice / 2)), die: ab.die || 6 };
    res.dot = { rounds };
  }
  return res;
}

/** How many foes a random-count AoE catches (Fireball 1dN, Cone base+1dN,
 *  Cloudkill NdN), else the chosen/max-target path. Returns the chosen slice
 *  (Fisher-Yates with injected RNG). */
function aoeTargets(ab, candidates, chosen, roll = Math.random) {
  if (ab.randFoes || ab.randBase || ab.randN) {
    const living = candidates.slice();
    for (let i = living.length - 1; i > 0; i--) { const j = Math.floor(roll() * (i + 1)); [living[i], living[j]] = [living[j], living[i]]; }
    let n;
    if (ab.randN) { n = 0; for (let i = 0; i < ab.randN; i++) n += 1 + Math.floor(roll() * (ab.randDie || 4)); }
    else if (ab.randBase) n = (ab.randBase || 0) + 1 + Math.floor(roll() * (ab.randDie || 1));
    else n = 1 + Math.floor(roll() * ab.randFoes);
    return living.slice(0, n);
  }
  return (chosen && chosen.length ? chosen : candidates).slice(0, ab.maxTargets || 2);
}

/** Area damage with a save for half: port of _abAoe. PF1: ONE shared damage roll;
 *  each target saves (Evasion negates on a made Reflex), SR checked per target,
 *  blindRider blinds on a failed save. Returns the tally + per-target detail. */
function resolveAoE(m, targets, ab, opts = {}) {
  const dc = S.spellDC(m, ab);
  const dice = S.spellDice(ab, m);
  const saveStat = ab.save || 'reflex';
  const full = S.rollSpellDamage(m, dice, ab.die || 6, ab, opts.roll);
  const res = { kind: 'aoe', dc, saveStat, full, targets: [], failN: 0, savedN: 0, slainN: 0, blindN: 0, srN: 0 };
  for (const e of targets) {
    const sr = S.srCheck(m, e, ab, opts);
    if (sr && sr.blocked) { res.srN++; res.targets.push({ target: e, srBlocked: true, sr }); continue; }
    const sv = S.saveVs(S.enemySave(e, saveStat), dc, opts.roll);
    const evaded = sv.saved && saveStat === 'reflex' && e.evasion;
    const raw = sv.saved ? (evaded ? 0 : Math.floor(full / 2)) : full;
    const dmg = dmgTo(e, raw, ab.dtype);
    const t = { target: e, save: sv, evaded, dmg };
    if (ab.blindRider && !sv.saved && e.hp > 0) { e.blinded = Math.max(e.blinded || 0, 3); t.blinded = true; res.blindN++; }
    if (sv.saved) res.savedN++; else res.failN++;
    if (e.hp <= 0) res.slainN++;
    res.targets.push(t);
  }
  return res;
}

/** Magic Missile: port of _abMissile. Auto-hit force darts (1 + level/2, max 5,
 *  1d4+1 each), split across targets; the Shield spell blocks them cold. */
function resolveMissile(m, targets, ab, opts = {}) {
  const darts = Math.min(5, 1 + Math.floor(((m.level || 1) - 1) / 2));
  const res = { kind: 'missile', darts, hits: [] };
  for (let i = 0; i < darts; i++) {
    const e = targets[i % targets.length];
    if (!e || e.hp <= 0) continue;
    if (e.shieldUp) { res.hits.push({ target: e, shielded: true }); continue; }
    const d = 1 + Math.floor((opts.roll || Math.random)() * 4) + 1;
    const dmg = dmgTo(e, d, ab.dtype);
    res.hits.push({ target: e, dmg });
  }
  return res;
}

/** Disintegrate: ranged touch; 2d6/CL (cap 40d6); Fort PARTIAL (5d6 on a save). */
function resolveDisintegrate(m, e, ab, opts = {}) {
  const atk = touchAttack(m, e, S.spellToHit(m), opts.roll);
  const res = { kind: 'disintegrate', target: e, ...atk };
  if (!atk.hit) return res;
  const ndice = 2 * Math.min(20, m.level || 1);
  const dc = S.spellDC(m, ab);
  const sv = S.saveVs(S.enemySave(e, ab.save || 'fort'), dc, opts.roll);
  const raw = sv.saved ? dN(5, 6, opts.roll) : dN(ndice, 6, opts.roll);
  res.dc = dc; res.save = sv;
  res.dmg = dmgTo(e, raw, ab.dtype);
  res.dust = e.hp <= 0;
  return res;
}

/** Save-or-debuff (Hold Person / Stinking Cloud): port of _abSaveDebuff. On a
 *  failed save: paralyzed (1 rd/CL, 2..12, + heldDC for turn-start re-saves) or
 *  nauseated (3 rounds). Mind-immunity must be gated by the CALLER via
 *  protections.spellWorksOn (poker checks it before this point too). */
function resolveSaveDebuff(m, e, ab, opts = {}) {
  const dc = S.spellDC(m, ab);
  const sv = S.saveVs(S.enemySave(e, ab.save || 'will'), dc, opts.roll);
  const res = { kind: 'save_debuff', target: e, dc, save: sv, applied: null };
  if (!sv.saved && ab.debuff === 'paralyzed') { e.paralyzed = Math.max(2, Math.min(12, m.level || 1)); e.heldDC = dc; res.applied = 'paralyzed'; }
  else if (!sv.saved && ab.debuff === 'sickened') { e.nauseated = 3; res.applied = 'nauseated'; }
  return res;
}

// ── Healing (port of _abHeal's math) ─────────────────────────────────────────
/** Cure X Wounds amount: healDice d8 + caster level (capped) + Healer's Blessing. */
function cureAmount(m, ab, roll = Math.random) {
  const lvl = m.level || 1;
  const hb = m.domainHealBoost ? 1 : 0;
  return Math.max(1, dN(ab.healDice || 1, 8, roll) + Math.min(ab.healCap || lvl, lvl) + hb * (ab.healDice || 1));
}
/** Channel Positive burst: ½ CL d6 (+ Healer's Blessing per die). channelBonus =
 *  extra caster levels (poker's Vesorianna hook — pass 0 normally). */
function channelAmount(m, roll = Math.random, channelBonus = 0) {
  const chLvl = (m.level || 1) + channelBonus;
  const dice = Math.max(1, Math.ceil(chLvl / 2));
  const hb = m.domainHealBoost ? 1 : 0;
  return Math.max(1, dN(dice, 6, roll) + hb * dice);
}
/** Heal one ally by `amount` (revives the dying: hp>0 clears down). Mutates. */
function applyHeal(ally, amount) {
  const before = ally.hp;
  ally.hp = Math.min(ally.maxHp, ally.hp + amount);
  if (ally.hp > 0) ally.down = false;
  return { target: ally, healed: ally.hp - before, revived: before <= 0 && ally.hp > 0 };
}
/** Channel heals the whole party with ONE roll (undead allies excluded by caller). */
function resolveChannelHeal(m, allies, roll = Math.random, channelBonus = 0) {
  const amount = channelAmount(m, roll, channelBonus);
  return { kind: 'channel_heal', amount, healed: allies.map(a => applyHeal(a, amount)) };
}
/** Offensive channel: sear undead, Will save (DC 10 + ½lvl + castingMod) for half.
 *  Sun's Blessing (m.domainSunVuln) adds +level to the burst. */
function resolveChannelSear(m, undead, opts = {}) {
  const lvl = m.level || 1;
  const dmg = channelAmount(m, opts.roll, opts.channelBonus || 0) + (m.domainSunVuln ? lvl : 0);
  const dc = 10 + Math.floor(lvl / 2) + (m.castingMod != null ? m.castingMod : 4);
  const res = { kind: 'channel_sear', dmg, dc, hitN: 0, savedN: 0, slainN: 0, targets: [] };
  for (const e of undead) {
    const sv = S.saveVs(S.enemySave(e, 'will'), dc, opts.roll);
    const d = dmgTo(e, sv.saved ? Math.floor(dmg / 2) : dmg, 'positive');
    if (sv.saved) res.savedN++; else res.hitN++;
    if (e.hp <= 0) res.slainN++;
    res.targets.push({ target: e, save: sv, dmg: d });
  }
  return res;
}

module.exports = {
  dmgTo, touchAttack,
  resolveCantrip, resolveBolt, resolveTouch, aoeTargets, resolveAoE,
  resolveMissile, resolveDisintegrate, resolveSaveDebuff,
  cureAmount, channelAmount, applyHeal, resolveChannelHeal, resolveChannelSear,
};
