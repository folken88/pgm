/**
 * Buff application — Phase B port of poker's _abBuff (game/dungeon/abilities.js
 * L2368+), minus narration. Poker's buff model, kept exactly:
 *   - who.buffs   {toHit,dmg,bonusDice,acPen,save,ac,deflect,dexMod} — lasts the
 *     ROOM (apps zero it at room start); `sticky` abilities apply once per room
 *     (who.buffApplied[key]).
 *   - who.runBuffs {toHit,dmg} — `persist` abilities (Bless, Inspire) last the RUN.
 *   - deflect does NOT stack (highest wins) — PF1 deflection.
 *   - flag riders: dr (Stoneskin), protectFire, darkvision, fly/canHitFlyers,
 *     displace, fireShield, elemBody, trueSeeing.
 *   - Prayer floods the field: allies buffed, enemies get `prayed` (read by
 *     spellmath.enemySave + tick.attackPenalty).
 * NOT handled here (app/stance layer): Power Attack / Deadly Aim / Fight
 * Defensively toggles, and Rage's temp-HP model — callers should filter those.
 */

const ZERO = () => ({ toHit: 0, dmg: 0, bonusDice: 0, acPen: 0, save: 0, ac: 0, deflect: 0 });

function inspireBonus(lvl) { return lvl >= 17 ? 4 : lvl >= 11 ? 3 : lvl >= 5 ? 2 : 1; }

/** Apply buff ability `ab` from caster m to `targets` (already chosen by the app:
 *  party list, one ally, or [m] for self). `enemies` only needed for Prayer.
 *  Returns { applied: [names], skipped: [names], enemyPenalty, scale }. */
function resolveBuff(m, ab, targets, enemies = []) {
  const lvl = m.level || 1;
  const insp = inspireBonus(lvl);
  const gmwMod = Math.min(5, Math.floor(lvl / 4));
  if (ab.key === 'inspire' && ab.buff) ab = { ...ab, buff: { ...ab.buff, toHit: insp, dmg: insp } };
  const res = { kind: 'buff', applied: [], skipped: [], enemyPenalty: 0, scale: ab.key === 'inspire' ? insp : (ab.gmw ? gmwMod : null) };

  const apply = (who) => {
    who.buffApplied = who.buffApplied || {};
    if (ab.sticky && who.buffApplied[ab.key]) { res.skipped.push(who.name); return; }
    if (ab.sticky) who.buffApplied[ab.key] = true;
    if (ab.persist) {   // run-long (Bless / Inspire) — survives room resets
      const tH = ab.key === 'inspire' ? insp : ((ab.buff && ab.buff.toHit) || 0);
      const dG = ab.key === 'inspire' ? insp : ((ab.buff && ab.buff.dmg) || 0);
      who.runBuffs = who.runBuffs || { toHit: 0, dmg: 0 };
      who.runBuffApplied = who.runBuffApplied || {};
      if (who.runBuffApplied[ab.key]) { res.skipped.push(who.name); return; }
      who.runBuffApplied[ab.key] = true;
      who.runBuffs.toHit += tH; who.runBuffs.dmg += dG;
      res.applied.push(who.name); return;
    }
    who.buffs = who.buffs || ZERO();
    who.buffs.toHit += ab.gmw ? gmwMod : ((ab.buff && ab.buff.toHit) || 0);
    who.buffs.dmg += ab.gmw ? gmwMod : ((ab.buff && ab.buff.dmg) || 0);
    who.buffs.bonusDice += (ab.buff && ab.buff.bonusDice) || 0;
    who.buffs.acPen += (ab.buff && ab.buff.acPen) || 0;
    who.buffs.ac += (ab.buff && ab.buff.ac) || 0;
    who.buffs.deflect = Math.max(who.buffs.deflect || 0, (ab.buff && ab.buff.deflect) || 0);
    who.buffs.save += (ab.buff && ab.buff.save) || 0;
    who.buffs.dexMod = (who.buffs.dexMod || 0) + ((ab.buff && ab.buff.dexMod) || 0);
    if (ab.dr) who.dr = Math.max(typeof who.dr === 'object' ? who.dr.amount : (who.dr || 0), ab.dr);
    if (ab.protectFire) who.protectFire = Math.min(120, 12 * lvl);
    if (ab.darkvision) who.darkvision = true;
    if (ab.fly) who.flying = true;
    if (ab.canHitFlyers) who.canHitFlyers = true;
    if (ab.displace) who.displaced = true;
    if (ab.fireShield) who.fireShield = { die: 6, bonus: who.level || 1 };
    if (ab.elemBody) who.elemBody = true;
    if (ab.trueSeeing) who.trueSeeing = true;
    res.applied.push(who.name);
  };

  for (const t of targets) apply(t);
  if (ab.enemyPenalty) {   // Prayer: enemies −1 hit/dmg/saves for the room
    for (const e of enemies) e.prayed = Math.max(e.prayed || 0, ab.enemyPenalty);
    res.enemyPenalty = ab.enemyPenalty;
  }
  return res;
}

/** Effective buffed attack mods for a combatant (room buffs + run buffs). */
function buffAtkMods(who) {
  const b = who.buffs || {}, r = who.runBuffs || {};
  return { toHit: (b.toHit || 0) + (r.toHit || 0), dmg: (b.dmg || 0) + (r.dmg || 0) };
}
/** Effective buffed AC delta (ac + deflection − penalties). */
function buffAcMod(who) {
  const b = who.buffs || {};
  return (b.ac || 0) + (b.deflect || 0) - (b.acPen || 0);
}

module.exports = { resolveBuff, buffAtkMods, buffAcMod, inspireBonus, ZERO };
