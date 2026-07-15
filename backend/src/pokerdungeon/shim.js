/**
 * DungeonShim — the Dungeon-compat surface that lets poker's dungeon mixins
 * (abilities/heroAI/enemyAI/summons, transplanted VERBATIM under game/dungeon/)
 * run against a PGM party-run. Poker's Dungeon.js provided ~2200 lines of host;
 * this provides the same surface mapped onto PGM run state + pf1core.
 *
 * Build-out is harness-driven: scripts/shim-harness.js exercises every kit
 * ability and reports missing surface; gaps get filled here until it converges
 * (see docs/SHIM-WORKLIST.md).
 */
const pf1 = require('../pf1core');
const { fighterFeats } = require('../pf1core/pf1data/feats');
const RACES = require('../pf1core/pf1data/races');
// Dice + weapon helpers the mixins import at their own module level — the
// shim's own ported methods (_evadeIncoming/_fireShieldRetaliate/_isDualWielding)
// need them in this scope too.
const { weaponOf, dRoll, dRollN } = require('./game/combat');
// PGM-only cavalier Order mechanics (never synced from poker) — the standard Paizo
// orders' Challenge modifiers + L2/L8/L15 deeds. See pgmCavalierOrders.js.
const cavOrders = require('./pgmCavalierOrders');

// ── Constants poker's factories expect (values lifted from Dungeon.js) ──
const ABILITY_MOD = 4, CAST_MOD = 4;
const { SICKENED_PENALTY, SICKENED_ROUNDS, HIGH_GROUND_AC, HIGH_GROUND_HIT, PARALYZE_DC, mindImmune, fightsNatural, ccd } = pf1.conditions;
const BLIND_ROUNDS = 3;
const EFFECT_CL_FLOOR = { paralyzed: 3, slowed: 5, blinded: 3 };
const SNEAK_CLASSES = new Set(['rogue', 'ninja', 'slayer']);
const isSneakClass = (cls) => SNEAK_CLASSES.has(cls);
const titleCase = (s) => String(s || '').replace(/\b\w/g, c => c.toUpperCase());
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

const deps = { ABILITY_MOD, CAST_MOD, SICKENED_PENALTY, SICKENED_ROUNDS, BLIND_ROUNDS, HIGH_GROUND_AC, HIGH_GROUND_HIT, PARALYZE_DC, EFFECT_CL_FLOOR, mindImmune, fightsNatural, isSneakClass, titleCase, ccd, stepDamage };

class DungeonShim {
  /** @param run  a PGM party-run (partyrun.js state) */
  constructor(run) {
    this.run = run;
    this.blackTentacles = null;
    this.lootRoll = null;
    this.pendingLoot = [];
  }

  // ── State surface (poker shapes ride on PGM combatants via aliases) ──
  get party() { return this.run.combatants.filter(c => c.side === 'hero'); }
  get enemies() { return this.run.combatants.filter(c => c.side === 'enemy' && c.revealed); }
  get round() { return this.run.round; }
  set round(v) { this.run.round = v; }
  get turnOrder() { return this.run.combatants.map(c => ({ kind: c.side === 'hero' ? 'member' : 'enemy', id: c.side === 'hero' ? c.playerId : c.uid })); }

  livingParty() { return this.party.filter(m => m.hp > 0 && !m.down); }
  livingEnemies() { return this.enemies.filter(e => e.hp > 0); }
  present() { return this.party.filter(m => !m.left); }
  member(id) { return this.party.find(m => m.playerId === id || m.id === id) || null; }
  // INVISIBILITY (poker parity — PGM used to ignore it entirely, so going unseen did
  // nothing for either side). An INVISIBLE foe can't be targeted unless somebody in the
  // party can pierce it: darkvision (magical dark), blindsense, See Invisibility or True
  // Seeing. If invisibility/darkness hid EVERY foe, fall back to the full list so the
  // party can still flail into the dark rather than soft-lock.
  _targetableEnemies() {
    const dv = this.livingParty().some(p => p.darkvision || p.blindsense > 0 || p.trueSeeing || p.seeInvis);
    const seen = this.livingEnemies().filter(e => !e.summoned && (dv || (!(e.darkened > 0) && !e.invisible)));
    const live = this.livingEnemies().filter(e => !e.summoned);
    return seen.length ? seen : live;
  }
  // An INVISIBLE hero can't be picked as a target — unless the foe is a TRUE SEER (an
  // Erinyes), which sees the unseen. Same fallback: if everyone's hidden, foes still act.
  _targetableParty(seer) {
    const sees = !!(seer && seer.trueSeeing);
    const live = this.livingParty().filter(m => !m.blinkedBy && !m.untargetable);
    const seen = live.filter(m => sees || !m.invisible);
    return seen.length ? seen : live;
  }

  // ── Narration/IO surface: map to the PGM run log; sockets/banter are no-ops ──
  _note(text, sound, opts) {
    const t = String(text || '').trim();
    if (!t) return;
    this.run.log.push({ seq: ++this.run.seq, text: t, priority: 'event', sound: sound || null });
    if (this.run.log.length > 80) this.run.log.shift();
  }
  _echoToTable() {} _broadcast() {} _summary() {}
  _tryBanter() {} _radianceQuip() {} _emitBanter() {} _log() {}

  // ── Rules helpers the mixins reach for on the host ──
  _isRanged(m) { return !!(m.character && m.character.weapon && m.character.weapon.ranged); }
  _hasteMod(m) { return (m && m.hasted > 0 && m.hasteFull) ? 1 : 0; }
  _hasteBonus() {}
  _spellWorksOn(ab, t) { return pf1.protections.spellWorksOn(ab, t); }
  _isHumanoid(t) { return pf1.protections.isHumanoid(t); }
  _physDR(target, dmg, weapon, pierce) { return [pf1.protections.applyDR(target, dmg, weapon, pierce), '']; }
  _drDesc(dr) { return pf1.protections.drDesc(dr); }
  _partySaveMod(m, tags) {
    return (m.level || 1) + ((m.buffs && m.buffs.save) || 0) + fighterFeats(m.cls, m.level, this._isRanged(m)).save
      + this._hasteMod(m) + RACES.raceSaveBonus(m.race || (m.character && m.character.race), tags)
      - (m.sickened > 0 ? SICKENED_PENALTY : 0) - (m.slowed > 0 && tags && tags.includes('reflex') ? 1 : 0)
      + (m._domWardRounds > 0 ? 2 : 0)
      + cavOrders.orderSaveBonus(this, m);   // Order of the Star: +saves while challenging
  }
  _acPenalty(m) { return ((m.buffs && m.buffs.acPen) || 0) + (m.grappled ? 2 : 0); }
  _acBonus(m) { return pf1.buffs.buffAcMod(m) + cavOrders.orderAcBonus(this, m); }
  _acOf(m) { const base = m.character ? m.character.ac : m.ac; return { ac: (m.flatFooted && m.flatAc != null) ? m.flatAc : base, physical: 4 }; }
  _heroCMD(m) { const d = m.character ? m.character.derived : { bab: 0, mods: {} }; return 10 + (d.bab || 0) + (d.mods.str || 0) + (d.mods.dex || 0); }
  _grantTempHp(m, n) { m.hp += n; m.tempHp = (m.tempHp || 0) + n; }
  _dmgToMember(m, dmg) { m.hp -= dmg; if (m.hp <= 0) { m.down = true; this._note(`${m.nickname || m.name} falls!`); } }
  _downMember(m) { m.down = true; }
  _memberDown(m) { m.down = true; }
  _fmtBonus(n) { return (n >= 0 ? '+' : '') + n; }

  // ── Loadout/char gates: PGM allows the class kit wholesale (no poker DB) ──
  // NOTE: _charAllows is provided by the abilities.js mixin — signature
  // (ability, member), matching m.trueNick/nickname. Do NOT redefine it here;
  // a shim version with a different arg order silently un-gates char abilities
  // (Jason's Force Push leaked into every kit, 2026-07-12). Call it as
  // _charAllows(ability, member) everywhere.
  _computeCastable(m) { m.castableKeys = null; }
  _loadoutAllows(m, ab) { return true; }
  _blackTentaclesTick() {}
}
DungeonShim.BLASTER_OPENERS = new Set(['burninghands', 'fireball', 'lightningbolt', 'coneofcold']);

// ── Assemble the transplanted mixins onto the shim prototype (verbatim) ──
Object.assign(
  DungeonShim.prototype,
  require('./game/dungeon/abilities')(deps),
  require('./game/dungeon/heroAI')(deps),
  require('./game/dungeon/enemyAI')(deps),
  require('./game/dungeon/summons'),
  require('./game/dungeon/swing'),        // _swingVsAC / _canReach / _flankRegister (verbatim Dungeon.js)
  require('./game/dungeon/makeenemy'),    // _makeEnemy / _autoWards (verbatim: boss advancement + pre-cast wards)
);

// Capture the synced kit-builder + attack resolver BEFORE the overrides below
// shadow them, so the PGM wrappers can layer cavalier-Order effects on poker's:
//   · _abilitiesFor → append the cavalier's own Order deeds
//   · _swingVsAC    → fold in Order swing modifiers (Dragon ally-to-hit, and the
//                     bonus-damage seam for Cockatrice/Shield when they land)
const _mixinAbilitiesFor = DungeonShim.prototype._abilitiesFor;
const _mixinSwingVsAC = DungeonShim.prototype._swingVsAC;

// ── PGM-native overrides (assigned after the mixins so they win) ──
let _summonSeq = 0;
Object.assign(DungeonShim.prototype, {
  // Poker's kit-builder + PGM cavalier-Order deeds. The synced _abilitiesFor
  // already appends the Flame deeds (char-gated) to every cavalier; here we add
  // the cavalier's OWN order's deeds (Lion, …), tagged `order:` so _charAllows
  // gates them and level-gated so only usable deeds ever appear. Order content
  // stays out of the synced files — sync-from-poker can't clobber it.
  _abilitiesFor(m) {
    const list = _mixinAbilitiesFor.call(this, m);
    const deeds = cavOrders.orderDeeds(this, m);
    return deeds.length ? list.concat(deeds) : list;
  },
  // Poker's verbatim attack resolver + cavalier-Order swing modifiers. `toHit`/`ac`
  // add to the roll; `dmg` is injected through the challenge-damage path by briefly
  // marking the target as this attacker's quarry (restored right after), so an order
  // can add bonus damage generically even without a standing challenge. Dragon uses
  // toHit today; the dmg seam is ready for Cockatrice/Shield.
  _swingVsAC(attacker, ac, target, extraToHit = 0, offHand = false) {
    const mod = cavOrders.swingMods(this, attacker, target);
    if (mod.dmg && attacker && target) {
      const prevId = attacker.challengedId, prevN = attacker.challengeN;
      const base = (prevId != null && prevId === target.uid) ? (prevN || 0) : 0;
      attacker.challengedId = target.uid;
      attacker.challengeN = base + mod.dmg;
      try { return _mixinSwingVsAC.call(this, attacker, ac + (mod.ac || 0), target, extraToHit + (mod.toHit || 0), offHand); }
      finally { attacker.challengedId = prevId; attacker.challengeN = prevN; }
    }
    return _mixinSwingVsAC.call(this, attacker, ac + (mod.ac || 0), target, extraToHit + (mod.toHit || 0), offHand);
  },
  /** Poker's verbatim _makeEnemy + PGM combatant decoration. */
  // ── Methods the mixins call that the shim lacked (found 2026-07-12 by a
  // call-diff after the silent enemyTurn catch hid a per-hit throw; verbatim
  // ports from poker Dungeon.js unless noted) ──
  // Mirror Image + Displacement + incorporeal: does an incoming attack on this
  // hero get soaked or slip through? True = fully negated (Dungeon.js:1764).
  _evadeIncoming(target, attacker) {
    // TRUE SEEING (Erinyes) pierces ILLUSIONS — never fooled by a mirror image or a
    // displaced/blurred form. It still cannot touch a truly INCORPOREAL ghost below (that
    // is physical, not an illusion). One reveal line per round per foe. Poker parity.
    const pierces = !!(attacker && attacker.trueSeeing);
    if (pierces && (target.images > 0 || target.displaced) && attacker._sawThrough !== this.round) {
      attacker._sawThrough = this.round;
      this._note(`${attacker.name}'s TRUE SEEING picks the real ${target.nickname} out of the illusions.`, null);
    }
    if (!pierces && target.images > 0) {
      target.images -= 1;
      this._note(`\u{1FA9E} the blow strikes a mirror image of ${target.nickname} — it pops! (${target.images} left)`, null);
      return true;
    }
    if (!pierces && target.displaced && dRoll(2) === 1) {
      this._note(`\u{1F32B}\uFE0F ${target.nickname} is displaced — the attack passes through empty air!`, null);
      return true;
    }
    if (target.ghost && dRoll(2) === 1) {
      this._note(`\u{1F47B} the blow passes THROUGH ${target.nickname} — incorporeal!`, null);
      return true;
    }
    return false;
  },
  // Fire Shield: a foe landing a melee hit on the warded hero is scorched (D:1782).
  _fireShieldRetaliate(target, e) {
    if (!target.fireShield || !(e && e.hp > 0)) return;
    const fs = target.fireShield;
    const dealt = this._dmgE(e, dRollN(1, fs.die || 6) + (fs.bonus || 1), 'fire');
    this._note(`\u{1F525} ${e.name} is scorched by ${target.nickname}'s Fire Shield for ${dealt} fire!`, null, { side: 'enemy' });
  },
  // TWF/flurry detection (D: _isDualWielding, verbatim incl. monk flurry).
  _isDualWielding(m) {
    const w = m.weapon || weaponOf(m.gear, m.weaponKey);
    if (m.cls === 'monk' && w && !w.ranged) return true;
    const sneak = ['rogue', 'ninja', 'slayer'].includes(m.cls);
    return !!(w && (w.dual || (sneak && (m.weaponKey === 'dagger' || m.weaponKey === 'kukri'))));
  },
  // Lowest living party level anchors encounter CR (D:613).
  _minLevel() {
    const party = this.members.filter(m => !m.left && m.hp > 0);
    if (!party.length) return 1;
    return Math.max(1, Math.min(...party.map(m => m.level || 1)));
  },
  // The cavalier's chosen Order (character.choices.order). Lord Gweyir is the
  // Order of the Flame by identity even without an explicit pick, so his build
  // needs no edit. PGM-only — order content never touches the synced files.
  _orderOf(m) {
    const o = m && m.character && m.character.choices && m.character.choices.order;
    if (o) return o;
    const who = (m && (m.trueNick || m.nickname || m.playerId) || '').toLowerCase();
    return who === 'lord gweyir' ? 'flame' : null;
  },
  // Order of the Flame: a GLORIOUS crit daunts the room (D:_dauntingSuccess).
  _isFlameCavalier(m) {
    return !!m && m.cls === 'cavalier' && this._orderOf(m) === 'flame';
  },
  // Order-gating for cavaliers. The synced Flame deeds (Glorious Challenge, Blaze
  // of Glory) carry `char: 'Lord Gweyir'`; re-interpret that as `order: 'flame'`
  // so ANY flame-order cavalier gets them. Abilities tagged `order:` (the PGM-only
  // new-order deeds) are gated to a cavalier of that order. Everything else falls
  // through to the original name/notChar gate (Rissa's Beast Mode, etc.).
  _charAllows(ab, m) {
    if (m && m.cls === 'cavalier' && ab) {
      if (ab.order) return this._orderOf(m) === ab.order;
      if (ab.char === 'Lord Gweyir') return this._orderOf(m) === 'flame';
    }
    if (!ab || (!ab.char && !ab.notChar)) return true;
    const who = (m.trueNick || m.nickname || '').toLowerCase();
    const pid = (m.playerId || '').toLowerCase();
    if (ab.char) { const c = ab.char.toLowerCase(); if (who !== c && pid !== c) return false; }
    if (ab.notChar) { const c = ab.notChar.toLowerCase(); if (who === c || pid === c) return false; }
    return true;
  },
  _dauntingSuccess(m) {
    if (!this._isFlameCavalier(m) || (m.level || 1) < 8 || m._dauntedRoom) return;
    m._dauntedRoom = true;
    let n = 0;
    for (const e of this.enemies.filter(x => x.hp > 0)) { e.prayed = Math.max(e.prayed || 0, 2); n++; }
    if (n) this._note(`\u{1F631} ${m.nickname}'s GLORIOUS critical DAUNTS the room — ${n} foe${n > 1 ? 's' : ''} quail!`, null);
  },
  // Bot backup ranged weapon (char-gated pistols, else a light crossbow) (D:359).
  _backupRangedKey(m) {
    const BY_CHAR = { 'el guapo': 'guapopistol', gaspar: 'gasparpistols' };
    return BY_CHAR[(m.playerId || '').toLowerCase()] || 'lightcrossbow';
  },
  // PGM stubs: leveling/death/recruiting are PGM-owned systems.
  _applyDeathPenalty() {},
  _levelGains() { return ''; },
  _recruitableFn() { return []; },
  addMember() { return { ok: false, error: 'PGM parties are fixed at the lobby' }; },
  roomName() { return 'pgm:' + (this.run && this.run.roomsCleared + 1 || 0); },

  _makeEnemyPGM(base, boss, elite) {
    const e = this._makeEnemy(base, !!boss, elite || 0);
    e.id = e.uid; e.side = 'enemy'; e.down = false; e.revealed = true;
    e.initMod = base.init || 0; e.icon = e.glyph || '👹';
    e.creature = { baseName: base.name, undead: base.type === 'undead' };
    return e;
  },
  /** ALLIED summon — PGM adaptation of summons.js _abSummon (same rules: the
   *  minion appears on the SUMMONER'S initiative, right after them, fights for
   *  the party, crumbles after ~level rounds). */
  _abSummon(m, ab) {
    const { MON } = require('./pf1data/monsters');
    const spec = ab.summon || {};
    const pool = (spec.pool || (spec.key ? [spec.key] : [])).filter(k => MON[k]);
    if (!pool.length) { this._note(`${ab.icon || '☠️'} ${m.nickname}'s ${ab.name} fizzles — the grave yields nothing.`); return; }
    const key = pool[Math.floor(Math.random() * pool.length)];
    const rollN = (c) => { if (typeof c === 'number') return Math.max(1, c); const mm = /^(\d+)d(\d+)(?:\+(\d+))?$/.exec(String(c || '1')); if (!mm) return 1; let t = 0; for (let i = 0; i < +mm[1]; i++) t += 1 + Math.floor(Math.random() * +mm[2]); return t + (+mm[3] || 0); };
    const count = Math.max(1, rollN(spec.count));
    const rounds = spec.rounds || Math.max(3, Math.ceil(m.level || 1));
    const run = this.run;
    const at = run.combatants.indexOf(m);
    const news = [];
    for (let i = 0; i < count; i++) {
      const e = this._makeEnemyPGM(MON[key]);
      e.summoned = true; e.summonedBy = m.playerId; e.summonExpiry = rounds;
      e.summonFlavor = spec.flavor || 'undead'; e.init = m.init;
      news.push(e);
    }
    run.combatants.splice((at >= 0 ? at : run.turnIndex) + 1, 0, ...news);
    const nm = MON[key].name;
    const label = count > 1 ? `${count} ${nm}${/s$/.test(nm) ? '' : 's'}` : `a ${nm}`;
    this._note(`${ab.icon || '☠️'} ${m.nickname} tears open the grave — ${label} rise${count > 1 ? '' : 's'} to fight for the party! (${rounds} rounds)`, ab.sound);
  },
});

Object.assign(DungeonShim.prototype, {
  /** ENEMY reinforcements (Whispering Way) — PGM adaptation of _enemySummon:
   *  real foes raised onto the enemy side, spliced after the summoner. */
  _enemySummon(e) {
    const { MON } = require('./pf1data/monsters');
    if (!(e.summonLeft > 0) || !e.summon) return;
    e.summonLeft -= 1;
    const pool = (e.summon.pool || []).filter(k => MON[k]);
    if (!pool.length) return;
    const key = pool[Math.floor(Math.random() * pool.length)];
    const n = Math.max(1, e.summon.count || 1);
    const run = this.run;
    const at = run.combatants.indexOf(e);
    const news = [];
    for (let i = 0; i < n; i++) {
      const m2 = this._makeEnemyPGM(MON[key]);
      m2.init = e.init;
      news.push(m2);
    }
    run.combatants.splice((at >= 0 ? at : run.turnIndex) + 1, 0, ...news);
    const nm = MON[key].name;
    this._note(`☠️ ${e.name} calls out — ${n > 1 ? n + ' ' + nm + 's' : 'a ' + nm} answer${n > 1 ? '' : 's'}, joining the enemy ranks!`);
  },
});

module.exports = { DungeonShim, deps };
