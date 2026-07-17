/**
 * _makeEnemy + _autoWards — VERBATIM from poker Dungeon.js (boss advancement,
 * pre-cast wards, special-ability budgets). Mixin for DungeonShim. The shim's
 * PGM decoration (id/side/revealed/creature) wraps this via _makeEnemyPGM.
 */
const { dRoll, pick } = require('../combat');
const { crToNum } = require('../../pf1data/monsters');

const PARALYZE_DC = 14;
let _uidSeq = 0;
function rint(a, b) { return a + Math.floor(Math.random() * (b - a + 1)); }

module.exports = {
  _autoWards(base) {
    const arcane = !!base.arcane || !!base.spellstrike;
    const divine = !!base.healer;
    if (!arcane && !divine && !base.caster) return [];   // not a caster — no wards
    const cr = (base.crNum != null) ? base.crNum : (crToNum(base.cr) || 1);
    const w = [];
    if (arcane) {
      w.push('magearmor', 'shield');
      if (cr >= 7 && !base.dr) w.push('stoneskin');
      if (cr >= 9)  w.push('fly');
      if (cr >= 11) w.push('protfire');
    }
    if (divine || (!arcane && base.caster)) {
      w.push('shieldoffaith');
      if (cr >= 6) w.push('protfire');
      if (cr >= 9 && !base.dr) w.push('stoneskin');
    }
    return [...new Set(w)];
  },
  _makeEnemy(base, boss, elite = 0) {
    // BOSS ADVANCEMENT — a designated boss gains 1d4 EXTRA LEVELS (PF1 advancing
    // by class levels/HD): +12% HP and +1 to-hit per level; +1 AC, saves, damage,
    // ability DCs and special-use counts per 2 levels; bigger sneak/spellstrike/
    // heal dice; +1 effective CR per 2 levels (so XP and loot scale with the
    // tougher fight); and a fatter gold pouch. `bossLevels` feeds the lich's
    // caster level too, so its spells grow with the advancement.
    // ADVANCEMENT (PF1, Tobias 2026-07-04): +2..4 class levels = +1-2 CR, and
    // the levels bring EVERYTHING — hp, to-hit, saves, DCs. A boss ALWAYS
    // advances (2-4 levels; the old 1d4 could roll a wet +1); a regular spawn
    // advances only when the spawner flags it ELITE to fill a thin CR band.
    const extra = boss ? 1 + dRoll(3) : (elite || 0);
    const half = Math.floor(extra / 2);
    // BOSS PRE-CAST WARDS — a caster boss "cheats": every long-duration buff
    // (anything NOT measured in rounds/level — Mage Armor, Shield, Stoneskin,
    // Protection from Fire, Fly, Shield of Faith) is assumed already up when the
    // party walks in. Stored on e.precast so the enemy's chips show the wards and
    // Dispel Magic can strip them one by one (Greater sweeps them all).
    const pre = Array.isArray(base.precast) ? base.precast.slice() : this._autoWards(base);   // explicit wards (boss or not) else derive from caster type/CR
    const preAC = (pre.includes('magearmor') ? 4 : 0) + (pre.includes('shield') ? 4 : 0) + (pre.includes('shieldoffaith') ? 3 : 0);
    const preTouch = pre.includes('shieldoffaith') ? 3 : 0;   // deflection counts vs touch; armor/shield bonuses don't
    return {
      uid: `e${++_uidSeq}`,
      // NAME: "Elite"/"Boss:" tells the player it's tougher; the raw advancement count
      // (the old " +3") is meaningless noise in combat lines and confusing over TTS
      // (Josh: "reported as Deathblade Monk +3 — the +3 doesn't matter"). Dropped from the
      // name; the level count still drives the stats via bossLevels below.
      name: boss ? `Boss: ${base.name}` : (extra ? `Elite ${base.name}` : base.name),
      glyph: base.glyph, art: base.tokenPool ? pick(base.tokenPool) : (base.art || null), artPos: base.artPos || null, boss,
      // Advanced CR, ROUNDED for display: a CR-1/3 (or 1/4, 1/2) creature advanced to Elite
      // used to stringify as "1.3333333333333335" and read that way in the inspector (Josh).
      // Round to 2 places → "1.33"; crToNum still parses it for XP/loot (negligible delta).
      cr: half ? String(Math.round(((base.crNum || 0) + half) * 100) / 100) : (base.cr || null),   // advanced CR (boss OR elite) → bigger XP + loot rolls
      bossLevels: extra,
      hype: base.hype || null,   // Maestro hype track (from the FVTT worlds) — plays when the boss room opens
      hp: Math.round(base.hp * (1 + 0.12 * extra)), maxHp: Math.round(base.hp * (1 + 0.12 * extra)),
      ac: base.ac + half + preAC,
      // PF1 AC types. touchAC: spells/firearms ignore armor & natural armor (an
      // optional per-monster `touch` overrides the heuristic). Flat-footed AC is
      // derived (−2, denied Dex) in _enemyAC. Refine per-monster touch values later.
      touchAC: (base.touch != null ? base.touch : Math.max(10, base.ac - 5)) + half + preTouch,
      precast: pre,                                         // pre-cast wards (chips + dispellable)
      shieldUp: pre.includes('shield'),                     // PF1 Shield: also IMMUNE to Magic Missile
      fireWard: pre.includes('protfire') ? Math.min(120, 12 * Math.max(10, (base.crNum || 10) + extra)) : 0,   // absorption pool, 12/CL
      toHit: base.toHit + extra,
      dmgDie: base.dmgDie, dmgCount: base.dmgCount || 1, dmgBonus: base.dmgBonus + half,
      fort: base.fort + Math.ceil(extra / 2), reflex: base.reflex + Math.ceil(extra / 2),
      align: base.align || 'NE', evil: !!base.evil, markedEvil: false, type: base.type || 'humanoid',
      flatFooted: true, prone: false, fascinated: false, asleep: false, loseTurn: false,
      paralyze: !!base.paralyze, paralyzeDC: (base.paralyzeDC || PARALYZE_DC) + half, sickened: 0,
      attacks: base.attacks || 1,
      // ARCHER/GUNNER flag (poker v3.37.65 hand-port): enemyAI reads e.ranged ("shoots"
      // narration, bow/gun SFX on a MISS too, archers don't wrestle, reach flyers) but
      // the flag was never copied off the base entry — the feature was dead here too.
      ranged: !!base.ranged,
      atkSound: base.atkSound || null,
      atkSounds: base.atkSounds || null,
      caster: base.caster || null,
      spellDC: (base.spellDC || 13) + half,
      castsLeft: base.caster ? 2 + half : 0,
      // special shout attack (e.g. Skeletal Champion) — boss levels raise the DC + uses
      shout: base.shout ? { ...base.shout, dc: (base.shout.dc || 14) + half } : null,
      shoutsLeft: base.shout ? 2 + half : 0,
      // goblin barbarian: roars a taunt that pulls AI allies onto it
      taunt: base.taunt ? { ...base.taunt, dc: (base.taunt.dc || 13) + half } : null,
      tauntsLeft: base.taunt ? 1 : 0,
      hook: base.hook || null,             // barbed devil: chain hook → grapple + constrict
      // barbed devil hellfire / dragon breath — boss levels add dice, DC and uses
      hellfire: base.hellfire ? { ...base.hellfire, dc: (base.hellfire.dc || 18) + half, dice: (base.hellfire.dice || 5) + extra } : null,
      hellfireLeft: base.hellfire ? ((base.hellfire.uses || 2) + half) : 0,   // per-monster satchel size (the Bomb Devil packs 6)
      arcane: base.arcane || null,         // lich (wizard of its level): _lichCast adds bossLevels to its caster level
      arcaneLeft: base.arcane ? 3 + half : 0,
      summon: base.summon || null,         // Whispering Way: raises undead reinforcements onto the ENEMY side (see _enemySummon)
      summonLeft: base.summon ? ((base.summon.uses || 2) + half) : 0,
      // vampire (magus of its level): Vampiric Touch on its strike — boss = more dice
      spellstrike: base.spellstrike ? { ...base.spellstrike, dice: (base.spellstrike.dice || 4) + half } : null,
      // priestly foes mend their allies (see _enemyHeal) — boss priests heal harder, more often
      healer: base.healer ? { ...base.healer, dice: (base.healer.dice || 1) + half } : null,
      healsLeft: base.healer ? (base.healer.uses || 1) + half : 0,
      // rogue-types: sneak attack dice vs denied defenses (was never copied — latent
      // bug: enemy sneak attacks silently never fired). Boss rogues sneak harder.
      sneakDice: base.sneakDice ? base.sneakDice + half : 0,
      prayed: 0,                           // cleric Prayer: −1 to this enemy's attacks/damage/saves
      acid: null,                          // Acid Arrow lingering burn: { rounds, dice, die }
      resist: base.resist || null,         // energy resistances / vulnerabilities (see RESIST_BY_KEY)
      dr: (pre.includes('stoneskin') && !base.dr) ? 10 : (base.dr || 0),   // physical DAMAGE REDUCTION — number (DR/— / Stoneskin) or { amount, bypass } (see _physDR); a boss keeps its own DR over a pre-cast Stoneskin
      size: base.size || 'M',               // PF1 size category (S/M/L/H…) — trip & flavor (see MON_BODY)
      legs: (base.legs != null ? base.legs : 2),   // leg count — 0 = untrippable; >2 = +4 trip defense per extra leg
      flying: !!base.flying || pre.includes('fly'),   // airborne: immune to prone + "high ground" vs grounded foes (a pre-cast Fly can be DISPELLED — the boss crashes)
      trueSeeing: !!base.trueSeeing,   // Erinyes devils: pierce ILLUSIONS — target invisible heroes + never fooled by mirror image / displacement (parity with poker)
      evasion: !!base.evasion,             // rogues/monks: a made Reflex save vs an area effect = NO damage
      natural: !!base.natural,             // fights with natural weapons / unarmed (claws, bite, slams) → cannot be DISARMED
      detonate: base.detonate || null,     // fire skeleton: rushes in and blows itself up on its turn
      taunted: null,                       // barbarian Taunt: playerId it's compelled to attack next turn
      slowed: 0, _slowTick: 0,             // Slow spell: sluggish for N rounds, acts every other turn
      gold: Math.round(rint(base.gold[0], base.gold[1]) * (1 + 0.25 * extra)),   // an advanced boss carries a fatter pouch
    };
  }
};
