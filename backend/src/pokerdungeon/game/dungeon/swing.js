/**
 * The ATTACK PIPELINE — _swingVsAC + _canReach + _flankRegister, extracted
 * VERBATIM from poker game/Dungeon.js L365-375 + L1464-1710 (the last big
 * rules block trapped in the Dungeon host). Module-scope deps reproduced from
 * Dungeon.js top-of-file. Mixin: assembled onto DungeonShim.
 */
const { weaponOf, SND, dRoll, dRollN, pick } = require('../combat');
const { attackProfile } = require('../character');
const { babFor, weaponProficient, NON_PROFICIENT_PENALTY } = require('../../pf1data/classes');
const { fighterFeats } = require('../../pf1data/feats');

const SNEAK_CLASSES = new Set(['rogue', 'ninja', 'slayer']);
const SNEAK_DICE_CAP = 5;
const SMITE_TOHIT = 2;
const BANE_TOHIT = 2, BANE_DMG = 2, BANE_DICE = 2;
const SICKENED_PENALTY = 2;
const HIGH_GROUND_AC = 2;
const ABILITY_MOD = 4;
const FINESSE_KEYS = new Set(['rapier', 'scimitar', 'shortsword', 'dagger', 'kukri', 'cutlass', 'estoc', 'sword_cane', 'starknife', 'sap']);
function isFinesseWeapon(w) { return !!w && !w.ranged && (w.cat === 'light' || FINESSE_KEYS.has(w.key)); }
const DMG_STEP = {
  '1d2': [1, 3], '1d3': [1, 4], '1d4': [1, 6], '1d6': [1, 8], '1d8': [2, 6], '1d10': [2, 8], '1d12': [3, 6],
  '2d6': [3, 6], '2d8': [3, 8], '2d10': [4, 8], '3d6': [4, 6], '3d8': [4, 8], '4d6': [6, 6], '4d8': [6, 8],
  '6d6': [8, 6], '6d8': [8, 8], '8d6': [12, 6],
};
function stepDamage(count, die, steps) {
  let c = count || 1, d = die || 4;
  for (let i = 0; i < (steps || 0); i++) { const nx = DMG_STEP[`${c}d${d}`]; if (!nx) break; c = nx[0]; d = nx[1]; }
  return { count: c, die: d };
}

module.exports = {
  _atkStr(r) {
    // A roll that BEAT the AC but was foiled by the foe's defenses shouldn't print
    // "[40 vs AC 19]" as if the math failed — say what actually stopped it (Tobias:
    // "the calculation does not make sense"). Mirror image / concealment, not a miss.
    if (r && r.image)   return '— a mirror-image decoy soaks the hit (not the real foe).';
    if (r && r.conceal) return '— the foe is UNSEEN: 50% concealment foils it (True Seeing / blindsense pierces it).';
    return `[d20 ${r.roll} ${this._fmtBonus(r.toHit)} = ${r.total} vs AC ${r.ac}]`;
  },
  _canReach(m, e) {
    if (m && m._tpStrike > 0) return true;   // Dimension Door/Teleport: the next strike reaches ANY foe
    if (!e || !e.flying) return true;
    // A CORPOREAL flyer that is HELD (paralyzed) or GRAPPLED has fallen / been dragged
    // down out of the air — grounded melee CAN now reach it. Real wings (Reese) beat
    // DISPEL, but not Hold Person or Black Tentacles. Incorporeal flyers (ghosts) still
    // drift out of reach regardless.
    if (!(e.incorporeal || e.ghost) && ((e.paralyzed > 0) || e.grappled)) return true;
    const w = m.weapon || weaponOf(m.gear, m.weaponKey);
    return !!(w.ranged || w.reachFly || (m.canHitFlyers && m.flying));
  },
  _flankRegister(attacker, target, weapon) {
    if (!(attacker && attacker.playerId && weapon && !weapon.ranged && target)) return false;
    target._meleeBy = target._meleeBy || new Set();
    const flanking = [...target._meleeBy].some(id => id !== attacker.playerId);
    target._meleeBy.add(attacker.playerId);
    return flanking;
  },
  _swingVsAC(attacker, ac, target, extraToHit = 0, offHand = false) {
    const weapon = attacker.weapon;
    if (weapon && !weapon.ranged) attacker._lastMeleeRound = this.round;   // "melee weapon is OUT" this round — drives Jason's Force Push (ally free attacks)
    const sick = attacker.sickened > 0 ? SICKENED_PENALTY : 0;
    const lvl = attacker.level || 1;
    const cls = attacker.cls || 'fighter';
    // Strength Surge (domain): +½ level hit & damage on ONE attack — consumed by
    // THIS swing whether it lands or not (a Good Fortune reroll restores it first).
    const _dStrike = attacker._domStrike || 0;
    if (_dStrike) attacker._domStrike = 0;
    // MAGUS Arcane Pool — an automatic, level-scaled weapon enhancement (the magus
    // is always treated as wielding at least this grade): +1@1, +2@5, keen@6,
    // flaming@8, +3@9, flaming burst@11, +4@13, +5@17. The real weapon's enchant
    // wins if it's higher; keen/flaming layer on top.
    let arcEnhDelta = 0, arcKeen = false, arcFlame = 0, arcFlameBurst = false, arcHoly = 0, arcUnholy = 0, arcShock = 0, arcFrost = 0, arcFrostBurst = false;
    if (cls === 'magus') {
      const arcEnh = lvl >= 17 ? 5 : lvl >= 13 ? 4 : lvl >= 9 ? 3 : lvl >= 5 ? 2 : 1;
      arcEnhDelta = Math.max(0, arcEnh - (weapon.dmgBonus || 0));   // only the part above the real enchant
      arcKeen = lvl >= 6;
      arcFlame = lvl >= 8 ? 1 : 0;        // +1d6 fire on each hit
      arcFlameBurst = lvl >= 11;          // flaming burst: extra fire dice on a crit
    } else if ((cls === 'paladin' || cls === 'antipaladin') && lvl >= 5) {
      // DIVINE BOND (paladin) / FIENDISH BOON (antipaladin) — a celestial/fiendish
      // spirit pours into the weapon: an automatic enhancement of +1@5, +2@8, +3@11,
      // +4@14, +5@17, +6@20 (PF1). The real weapon's enchant wins if it's higher.
      // From 8th the blade turns HOLY/UNHOLY: +2d6 vs EVIL (paladin) / vs GOOD
      // (antipaladin), granted free on top — the way the magus gets flaming.
      const bond = lvl >= 20 ? 6 : lvl >= 17 ? 5 : lvl >= 14 ? 4 : lvl >= 11 ? 3 : lvl >= 8 ? 2 : 1;
      arcEnhDelta = Math.max(0, bond - (weapon.dmgBonus || 0));
      if (lvl >= 8) { if (cls === 'paladin') arcHoly = 2; else arcUnholy = 2; }
    }
    // WEAPON-BORNE special abilities — a NAMED/signature weapon carries its own
    // magic (flaming, holy, keen…) INTRINSICALLY: always on, regardless of the
    // wielder's class, level, or +N tier (Gabriel's Redeemer burns even at +0).
    // These layer onto any class rider (magus flaming / paladin holy) — take the
    // stronger, never double-stack. Enhancement (+N to hit/damage) still rides the
    // in-game gear tier; these are the flavour that's ALWAYS on the blade.
    const wsp = weapon.special;
    if (wsp) {
      if (wsp.keen) arcKeen = true;
      if (wsp.flaming || wsp.flamingBurst) arcFlame = Math.max(arcFlame, 1);
      if (wsp.flamingBurst) arcFlameBurst = true;
      // holy/unholy accept a NUMBER of d6 (Rovadra is a "little bit holy" = 1d6);
      // a bare `true` is the standard 2d6.
      if (wsp.holy) arcHoly = Math.max(arcHoly, typeof wsp.holy === 'number' ? wsp.holy : 2);
      if (wsp.unholy) arcUnholy = Math.max(arcUnholy, typeof wsp.unholy === 'number' ? wsp.unholy : 2);
      if (wsp.shock) arcShock = Math.max(arcShock, 1);
      if (wsp.frost || wsp.frostBurst) arcFrost = Math.max(arcFrost, 1);
      if (wsp.frostBurst) arcFrostBurst = true;   // FREEZING BURST: +1d6 cold, extra cold on a crit (Voidshard)
    }
    // Dimensional Blade — for 1 round the magus's strikes resolve as TOUCH attacks.
    if (attacker.touchStrike > 0 && target) ac = this._enemyAC(target, { touch: true, melee: true });   // Dimensional Blade = a MELEE touch → prone stays a −4 (melee) AC
    // Fly / Overland Flight (magus) — a flyer can melee airborne foes (no high-ground gap).
    if (attacker.canHitFlyers && attacker.flying && target && target.flying) ac -= HIGH_GROUND_AC;
    // Point Blank Shot: +1 to hit & damage with a bow/crossbow, but ONLY against a
    // foe that has closed to melee — i.e. one that has struck an ally this room
    // (_engagedAlly). A distant/untouched foe is out of point-blank range.
    const pbs = (weapon && weapon.ranged && target && target._engagedAlly) ? (fighterFeats(cls, lvl, true).pbs || 0) : 0;
    // Smite Evil: an ACTIVATED smite (paladin's ability) vs an evil foe adds a
    // to-hit bump + bonus (un-multiplied) damage equal to level.
    const smite = !!(attacker.smiteActive && target && (target.evil || target.markedEvil));   // Detect Evil marks neutral foes smite-able
    // Sneak Attack: rogue-likes add precision dice vs a target that's denied its
    // defenses — flat-footed, prone, sickened, or paralyzed (PF1e). NOT crit-multiplied.
    // A target is denied its Dex vs an UNSEEN attacker too — Greater Invisibility
    // keeps a rogue striking from concealment, so every hit is a Sneak Attack.
    const denied = !!(target && (target.flatFooted || target.prone || target.sickened > 0 || target.paralyzed > 0 || target.fascinated || target.blinded > 0)) || !!attacker.greaterInvis || !!attacker._unseenStrike;   // _unseenStrike: the one blow struck while still invisible (before it breaks) catches the foe unseen — denies its Dex
    // FLANK (Tobias 2026-07-04): once TWO+ melee allies work the SAME foe, they
    // flank it — +2 to hit, and Sneak Attack switches on for rogue-likes. The
    // first to close gets nothing (moved up alone); every ally who joins the
    // melee on that foe afterward is flanking. Tracked per-room on the foe.
    const flanking = this._flankRegister(attacker, target, weapon);
    const flankHit = flanking ? 2 : 0;   // PF1 flanking bonus (both flankers, once positioned)
    // SLAYER Studied Target: the foe this slayer has MARKED takes +N insight to hit
    // AND damage from them (N scales with the slayer's level; set by _abStudyTarget).
    const studied = !!(target && attacker.studiedId != null && attacker.studiedId === target.uid);
    const studiedN = studied ? (attacker.studiedN || 0) : 0;
    // CAVALIER Challenge: +level bonus DAMAGE (not to-hit) vs the challenged foe.
    const challengeN = (target && attacker.challengedId != null && attacker.challengedId === target.uid) ? (attacker.challengeN || 0) : 0;
    const sneakOk = SNEAK_CLASSES.has(cls) && (denied || flanking);
    const sneakDice = sneakOk ? Math.min(SNEAK_DICE_CAP, Math.max(1, Math.ceil(lvl / 2))) : 0;
    // Sticky room buffs (Rage / Judgment / Bane / Inspire Courage / Prayer)
    // PLUS run-long buffs (Bless's +1 to-hit) that persist across rooms.
    const rb = attacker.runBuffs || {};
    const rbuff = attacker.buffs || {};
    const buff = {
      toHit: (rbuff.toHit || 0) + (rb.toHit || 0),
      dmg: (rbuff.dmg || 0) + (rb.dmg || 0),
      bonusDice: rbuff.bonusDice || 0,
    };
    // Inquisitor BANE — declared against ONE creature type (see _abBane). Its
    // +2 hit / +2d6+2 damage applies ONLY when THIS target is that type.
    const baneOn = !!(attacker.bane && target && target.type && target.type === attacker.bane.type);
    const baneHit = baneOn ? BANE_TOHIT : 0;
    // PF1e to-hit = class BAB (level-scaled) + ability mod + weapon bonus
    // (masterwork +1 / +N enhancement, carried on weapon.toHit) + smite + buffs,
    // minus a non-proficiency penalty if the class can't use this weapon.
    const bab = babFor(cls, lvl);
    const smiteHit = smite ? SMITE_TOHIT : 0;
    // NPCs are hand-assigned their signature weapons, so they're always
    // proficient; the −4 penalty only guides human weapon choices.
    // PF1 proficiency applies to EVERY combatant — bots, humans, and piloted
    // personas alike (no AI exemption). Signature `custom` weapons are always
    // proficient (weaponProficient handles that), so iconic gear is unaffected.
    const notProf = weaponProficient(cls, weapon) ? 0 : NON_PROFICIENT_PENALTY;
    const ff = fighterFeats(cls, lvl, !!(weapon && weapon.ranged));   // bonus feats — RANGED ladder with a bow/crossbow, else melee
    // Swashbuckler — only with a finessable weapon: Weapon Focus, Weapon
    // Specialization, Precise Strike (+level, NOT crit-multiplied), Improved Critical.
    const swashFin = cls === 'swashbuckler' && isFinesseWeapon(weapon);
    const swashWF = swashFin ? 1 : 0;
    const swashSpec = (swashFin && lvl >= 4) ? 2 : 0;
    const preciseDmg = (swashFin && lvl >= 3) ? lvl : 0;   // Precise Strike: +swashbuckler level
    // Real PF1 ability mods: to-hit from STR (or DEX for a finesse/ranged weapon),
    // damage from STR ×1 / ×1.5 two-handed / ×0.5 off-hand (or DEX). Falls back to
    // the legacy +4 if a member has no derived mods yet. Replaces the ABILITY_MOD
    // placeholder, and the level-scaled damage ramp is dropped (iteratives + feats
    // now carry high-level scaling — see the iterative loop in _playerAttack).
    const _ap = attacker.mods ? attackProfile({ mods: attacker.mods }, weapon, { offHand }) : { toHitMod: ABILITY_MOD, dmgBonus: ABILITY_MOD };   // off-hand swing → ½ ability mod to DAMAGE (PF1 two-weapon fighting)
    const toHit = bab + _ap.toHitMod + (weapon.toHit || 0) + arcEnhDelta + smiteHit + baneHit + (buff.toHit || 0) + pbs + flankHit + studiedN + extraToHit + notProf - sick - (attacker.grappled ? 2 : 0) - (attacker.slowed > 0 ? 1 : 0) - (attacker.prone && !(weapon && weapon.ranged) ? 4 : 0) + _dStrike + ff.hit + swashWF;   // PF1: a prone attacker takes −4 on MELEE attacks (ranged unaffected here — crossbow rule simplified); Strength Surge (domain) rides this one swing
    const roll = dRoll(20), total = roll + toHit;
    // Luck domain — GOOD FORTUNE: the next missed swing (fumble included) is
    // rerolled once, keep the better outcome. Consumed on the reroll.
    const _fortune = () => {
      if (!attacker._domFortune) return null;
      attacker._domFortune = false;
      if (_dStrike) attacker._domStrike = _dStrike;   // the surge rides into the reroll
      this._note(`🍀 GOOD FORTUNE — ${attacker.nickname}'s miss is rerolled!`);
      return this._swingVsAC(attacker, ac, target, extraToHit, offHand);
    };
    if (roll === 1) return _fortune() || { hit: false, fumble: true, roll, toHit, total, ac, sound: SND.fumble };
    const hit = roll === 20 || total >= ac;
    if (!hit) return _fortune() || { hit: false, roll, toHit, total, ac, sound: weapon.isDagger ? SND.whiffDagger : pick(SND.whiffSword) };
    // A foe that has self-buffed defenses turns a clean hit aside (enemy casters
    // can now go Invisible / Mirror Image mid-fight). A hero who pierces the unseen
    // — True Seeing or blindsense — ignores the concealment.
    if (target && !attacker.trueSeeing && !(attacker.blindsense > 0)) {
      if (target.invisible && dRoll(2) === 1) {   // total concealment vs an unseen foe → 50% miss
        return { hit: false, conceal: true, roll, toHit, total, ac, sound: weapon.isDagger ? SND.whiffDagger : pick(SND.whiffSword) };
      }
      // PF1 MIRROR IMAGE: the blow HIT the AC — now roll which of (real + N figments)
      // it lands on. 1/(N+1) chance it's the REAL foe (fall through to normal damage;
      // DR & other defenses still apply); otherwise it strikes a figment, destroyed
      // outright (one hit, no damage). So piling on attacks BOTH whittles the decoys
      // AND keeps a real-hit chance each swing — exactly RAW. (True Seeing / blindsense
      // skip the whole illusion, handled by the guard above.)
      if (target.images > 0 && dRoll(target.images + 1) !== 1) {
        target.images -= 1;
        const _nm = target.name === undefined ? target.nickname : target.name;
        this._note(`🪞 a mirror image of ${_nm} POPS — ${target.images} decoy${target.images === 1 ? '' : 's'} left.`, null);
        return { hit: false, image: true, imagesLeft: target.images, roll, toHit, total, ac, sound: pick(SND.flesh) };
      }
    }
    // Damage = weapon dice (NdX) + enhancement + ½ level + ability mod + buff dmg (+ Point Blank).
    const judgDmg = attacker.judgment === 'destruction' ? Math.max(1, Math.floor(lvl / 3)) : 0;   // inquisitor Judgement: Destruction
    const flatDmg = _ap.dmgBonus + (buff.dmg || 0) + (baneOn ? BANE_DMG : 0) + pbs + judgDmg + ff.dmg + swashSpec + arcEnhDelta;
    // Natural attacks (a druid's claws/bite) grow their DICE with the wielder's SIZE
    // (the bigger combat forms enlarge them) and with Improved Natural Weapon — both
    // step the dice up the PF1 size table (1d6→1d8→2d6→…), stacking.
    let dmgCount = weapon.dmgCount, dmgDie = weapon.dmgDie;
    // MONK Improved Unarmed Strike (free class feature): fists follow the PF1 monk
    // ladder — 1d6, 1d8@L4, 1d10@L8, 2d6@L12, 2d8@L16, 2d10@L20 (replaces the 1d3).
    if (attacker.cls === 'monk' && weapon.key === 'unarmed') {
      const MONK_FIST = [[1, 6], [1, 8], [1, 10], [2, 6], [2, 8], [2, 10]];
      const t = MONK_FIST[Math.min(5, Math.floor(lvl / 4))];
      dmgCount = t[0]; dmgDie = t[1];
    }
    if (weapon.group === 'natural') {
      const steps = ((attacker.form && attacker.form.sizeSteps) || 0) + (ff.inw ? 1 : 0);
      if (steps > 0) { const st = stepDamage(dmgCount, dmgDie, steps); dmgCount = st.count; dmgDie = st.die; }
    }
    const rollDmg = () => dRollN(dmgCount, dmgDie) + weapon.dmgBonus + flatDmg;
    let dmg = rollDmg() - sick, crit = false;
    // Improved Critical doubles the weapon's threat range (fighter L8; swashbuckler
    // L5 with a finesse blade). Critical Focus (fighter L9) adds +4 to confirm.
    const impCrit = ff.impCrit || (weapon.impCritAt && lvl >= weapon.impCritAt) || (swashFin && lvl >= 5) || arcKeen;   // fighter / swashbuckler / magus arcane-pool keen / weapon-borne (Bastard's Blade at 9) — don't stack
    const effCritRange = impCrit ? (2 * weapon.critRange - 21) : weapon.critRange;
    const critFocus = ((ff.critFocus || (weapon && weapon.critFocus)) ? 4 : 0) + (ff.critMastery ? 4 : 0);   // Critical Focus +4 (fighter feat OR weapon-borne — Lammas / Sawtooth Sabers), Critical Mastery +4 more (+8 confirm)
    if (roll >= effCritRange) { const conf = dRoll(20) + bab + _ap.toHitMod + (weapon.toHit || 0) + smiteHit + baneHit + (buff.toHit || 0) + pbs + flankHit + studiedN + extraToHit + notProf + ff.hit + swashWF + critFocus; if (conf === 20 || conf >= ac) { crit = true; for (let i = 1; i < weapon.critMult; i++) dmg += rollDmg(); } }
    // Precision (sneak / swashbuckler Precise Strike), smite, and bane dice ride on
    // top — NOT multiplied by a crit.
    let sneakDmg = 0;
    if (preciseDmg) dmg += preciseDmg;   // swashbuckler Precise Strike
    if (sneakDice) { sneakDmg = dRollN(sneakDice, 6); dmg += sneakDmg; }
    if (buff.bonusDice) dmg += dRollN(buff.bonusDice, 6);   // misc bonus dice
    if (baneOn) dmg += dRollN(BANE_DICE, 6);                // Inquisitor Bane — +2d6 vs the declared type
    if (smite) dmg += 2 * lvl;   // Smite Evil: +double level damage
    if (studiedN) dmg += studiedN;   // Studied Target: +N insight damage vs the marked foe (un-multiplied)
    if (challengeN) dmg += challengeN;   // Cavalier Challenge: +level damage vs the challenged foe (un-multiplied)
    // DOMAIN riders — Strength Surge (+½ level dmg on this one swing; to-hit added
    // above, consumed at the top) and War's Battle Rage (+level dmg on ONE landed
    // hit — consumed here; a fully-missed action forfeits it, cleared in
    // _playerAttack). Neither is crit-multiplied (precision-style riders).
    if (_dStrike) dmg += _dStrike;
    if (attacker._domSmite) { dmg += attacker._domSmite; attacker._domSmite = 0; }
    // Sun domain — passive: the faithful's blows BURN the undead (+½ level, min 1).
    if (attacker.domainSunVuln && target && target.type === 'undead') dmg += Math.max(1, Math.ceil(lvl / 2));
    // Death domain — Bleeding Touch rides the first landed hit: the foe bleeds
    // 1d6 at the top of each of its turns until it drops (no heal-check sim).
    // PF1: bloodless creatures (undead, constructs, oozes, elementals) can't bleed
    // — the touch is spent anyway (the hit landed), it just finds no blood.
    if (attacker._domBleed && target) {
      attacker._domBleed = false;
      const bloodless = target.type === 'undead' || target.type === 'construct'
        || /golem|skelet|zombie|ooze|elemental|wraith|ghost|shadow|specter|spectre/i.test(target.name || '');
      if (bloodless) this._note(`💀 ${attacker.nickname}'s Bleeding Touch finds no blood in ${target.name} — no wound to open.`);
      else { target._bleeding = true; this._note(`🩸 ${target.name} is BLEEDING (Death domain) — 1d6 each round until it falls!`); }
    }
    // PRECISION BLEED (poker parity, Tobias 2026-07-11): a rogue's SNEAK ATTACK or a
    // swashbuckler's PRECISE STRIKE opens a bleeding wound — the foe bleeds 1d6 at the top
    // of each of its turns until it drops (same tick as the Death domain's Bleeding Touch).
    // FIRST precision hit per foe only (doesn't stack); bloodless foes (undead / constructs
    // / oozes…) can't bleed.
    if ((sneakDmg > 0 || preciseDmg > 0) && target && target.hp > 0 && !target._bleeding) {
      const bloodless = target.type === 'undead' || target.type === 'construct'
        || /golem|skelet|zombie|ooze|elemental|wraith|ghost|shadow|specter|spectre/i.test(target.name || '');
      if (!bloodless) { target._bleeding = true; this._note(`🩸 ${attacker.nickname}'s precise strike opens a wound — ${target.name} BLEEDS 1d6 each round until it falls.`); }
    }
    // PHYSICAL DR: the foe soaks the weapon's physical damage (dice + static + crit +
    // precision/sneak/bane/smite) unless this weapon's TYPE (S/P/B) or its magic
    // bypasses the foe's DR. A clean hit is ≥1 before DR; DR can soak it to 0 (a sword
    // glancing off a skeleton). Elemental riders (flaming) ride on top, unsoaked.
    dmg = Math.max(1, dmg);
    let drTag = '';
    [dmg, drTag] = this._physDR(target, dmg, weapon, ff.prStrike || 0);   // Penetrating Strike pierces 5/10 of the DR
    // First time the party lands a blow on a creature with DR, announce what it has
    // (once per creature TYPE per run) so they can switch to the weapon that bites.
    const _drAmt = target.dr ? (typeof target.dr === 'object' ? target.dr.amount : target.dr) : 0;
    if (_drAmt > 0) { this._drSeen = this._drSeen || new Set(); if (!this._drSeen.has(target.name)) { this._drSeen.add(target.name); this._note(`🛡️ ${target.name}: ${this._drDesc(target.dr)}.`); } }
    // Magus arcane-pool FLAMING: +1d6 FIRE each hit (elemental — not soaked by physical
    // DR, not crit-multiplied); FLAMING BURST adds extra fire dice on a confirmed crit.
    // Routed through the target's FIRE resistance/immunity/vulnerability (Phase 4) —
    // a flaming blade does nothing extra to a devil and ×1.5 to a wood golem.
    if (arcFlame) dmg += this._resisted(target, dRollN(arcFlame, 6), 'fire');
    if (crit && arcFlameBurst) dmg += this._resisted(target, dRollN(Math.max(1, (weapon.critMult || 2) - 1), 10), 'fire');
    // SHOCK (electricity) / FROST (cold) weapon riders — same as flaming, routed
    // through the target's resistance (a shocking blade does nothing to an angel,
    // ×1.5 to a robot). Weapon-borne only (Stormcaller's storm shot); no burst tier.
    if (arcShock) dmg += this._resisted(target, dRollN(arcShock, 6), 'electricity');
    if (arcFrost) dmg += this._resisted(target, dRollN(arcFrost, 6), 'cold');
    if (crit && arcFrostBurst) dmg += this._resisted(target, dRollN(Math.max(1, (weapon.critMult || 2) - 1), 10), 'cold');   // freezing burst: extra cold dice on a confirmed crit (matches flaming burst, ×the crit multiplier)
    // Divine Bond HOLY (paladin) / Fiendish Boon UNHOLY (antipaladin): +2d6 of aligned
    // energy that only bites the opposed alignment — vs EVIL foes (holy) / GOOD foes
    // (unholy). Rides on top: not soaked by physical DR, not crit-multiplied.
    if (arcHoly && (target.evil || target.markedEvil)) dmg += dRollN(arcHoly, 6);
    if (arcUnholy && target.good) dmg += dRollN(arcUnholy, 6);
    return { hit: true, crit, smite, sneakDice, sneakDmg, damage: Math.max(0, dmg), drTag, roll, toHit, total, ac, sound: pick(SND.flesh) };
  }
  // (the villain brain — _monsterSwing/_enemyAct/maneuvers/caster brains — moved to game/dungeon/enemyAI.js — Phase-2 seam 3)
  // (the hero-bot brain — _allyAct/_botAbility/_botStance/_preferredFoe/_sneakPrey/_forcedFoe/_drBlocksWeapon — moved to game/dungeon/heroAI.js — heroAI seam)
  // ── AI SPELL KNOWLEDGE ─────────────────────────────────────────────────────
  // Would this spell actually WORK on this foe? The bot brain consults the same
};
