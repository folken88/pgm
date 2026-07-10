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
  _targetableEnemies() { return this.livingEnemies().filter(e => !(e.darkened > 0) && !e.summoned); }
  _targetableParty() { return this.livingParty().filter(m => !m.blinkedBy && !m.untargetable); }

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
  _partySaveMod(m, tags) {
    return (m.level || 1) + ((m.buffs && m.buffs.save) || 0) + fighterFeats(m.cls, m.level, this._isRanged(m)).save
      + this._hasteMod(m) + RACES.raceSaveBonus(m.race || (m.character && m.character.race), tags)
      - (m.sickened > 0 ? SICKENED_PENALTY : 0) - (m.slowed > 0 && tags && tags.includes('reflex') ? 1 : 0)
      + (m._domWardRounds > 0 ? 2 : 0);
  }
  _acPenalty(m) { return ((m.buffs && m.buffs.acPen) || 0) + (m.grappled ? 2 : 0); }
  _acBonus(m) { return pf1.buffs.buffAcMod(m); }
  _acOf(m) { return { ac: (m.character ? m.character.ac : m.ac), physical: 4 }; }
  _heroCMD(m) { const d = m.character ? m.character.derived : { bab: 0, mods: {} }; return 10 + (d.bab || 0) + (d.mods.str || 0) + (d.mods.dex || 0); }
  _grantTempHp(m, n) { m.hp += n; m.tempHp = (m.tempHp || 0) + n; }
  _dmgToMember(m, dmg) { m.hp -= dmg; if (m.hp <= 0) { m.down = true; this._note(`${m.nickname || m.name} falls!`); } }
  _downMember(m) { m.down = true; }
  _memberDown(m) { m.down = true; }
  _fmtBonus(n) { return (n >= 0 ? '+' : '') + n; }

  // ── Loadout/char gates: PGM allows the class kit wholesale (no poker DB) ──
  _computeCastable(m) { m.castableKeys = null; }
  _charAllows(m, ab) { return !ab.char || String(ab.char).toLowerCase() === String(m.playerId || m.name || '').toLowerCase(); }
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
);

module.exports = { DungeonShim, deps };
