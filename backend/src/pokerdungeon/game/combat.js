/**
 * Poker game/combat.js COMPAT — the exact API the transplanted dungeon mixins
 * import (weaponOf, SND, dRoll, dRollN, pick), assembled from pf1core weapon
 * data + PGM's transplanted sound pools. weaponOf resolves standard PF1 weapons
 * AND the named SIGNATURE weapons (2026-07-14: poker binds those to a character
 * and a human can never pick one; in PGM they are LOOT — see pf1data/signatures).
 */
const { WEAPON_BY_NAME } = require('../../pf1core/pf1data/weapons');
const { CUSTOM_WEAPONS: SIGNATURES } = require('../../pf1core/pf1data/signatures');
const { SND, pick: sfxPick } = require('../../sounds');

function dRoll(sides) { return 1 + Math.floor(Math.random() * sides); }
function dRollN(count, sides) { let t = 0; for (let i = 0; i < count; i++) t += dRoll(sides); return t; }
function pick(arr) { return Array.isArray(arr) ? arr[Math.floor(Math.random() * arr.length)] : arr; }

// Poker staple keys → pf1core WEAPON_BY_NAME keys (lowercased names).
const KEY_TO_NAME = {
  shortsword: 'short sword', battleaxe: 'battle axe', longspear: 'longspear',
  bastardsword: 'bastard sword', greatsword: 'greatsword', greataxe: 'greataxe',
  longsword: 'longsword', dagger: 'dagger', kukri: 'kukri', warhammer: 'warhammer',
  quarterstaff: 'quarterstaff', katana: 'katana', scimitar: 'scimitar',
  rapier: 'rapier', glaive: 'glaive', whip: 'whip', morningstar: 'morningstar',
  unarmed: null, shillelagh: 'club', longbow: 'longbow',
};
const UNARMED = { name: 'Unarmed Strike', cat: 'light', ranged: false, dmgCount: 1, dmgDie: 3, crit: 20, mult: 2, type: 'B', group: 'natural' };

/** Poker-shape weaponOf(gear, weaponKey): stat object with tier-enhancement. */
function weaponOf(gear, weaponKey) {
  const tier = (gear && Number(gear.weapon)) || 0;
  // SIGNATURE WEAPONS (poker's CUSTOM_WEAPONS) are standalone stat blocks, not
  // Foundry base weapons — they carry their own dice AND their intrinsic magic
  // (`special`), which is always on regardless of the +N tier. Check them first;
  // a signature key would otherwise fall through to the dagger default.
  const sig = SIGNATURES[weaponKey];
  if (sig) {
    const enhanced = tier >= 1;
    return {
      ...sig,
      name: `${enhanced ? `+${tier} ` : ''}${sig.name}`,   // a signature is never "Masterwork X" — it has a NAME
      isDagger: false,
      toHit: tier + (enhanced ? 0 : 1), dmgBonus: tier,
      critRange: sig.crit || 20, critMult: sig.mult || 2,
      dtype: sig.type,
      dual: !!sig.dual, noShield: !!sig.noShield || !!sig.ranged,
      naturalAttacks: sig.naturalAttacks || 0, reachFly: !!sig.reachFly,
      impCritAt: sig.impCritAt || 0, grapple: !!sig.grapple,
      atkSound: sig.atkSound || null, special: sig.special || {},
    };
  }
  const name = KEY_TO_NAME[weaponKey] !== undefined ? KEY_TO_NAME[weaponKey] : weaponKey;
  const base = (weaponKey === 'unarmed' ? UNARMED : WEAPON_BY_NAME[name] || WEAPON_BY_NAME[String(weaponKey || '').toLowerCase()]) || WEAPON_BY_NAME['dagger'];
  const enhanced = tier >= 1;
  const mwHit = enhanced ? 0 : 1;
  const prefix = enhanced ? `+${tier} ` : 'Masterwork ';
  const isDagger = base.cat === 'light' && !base.ranged;
  return {
    key: weaponKey || 'dagger', name: `${prefix}${base.name}`, isDagger,
    dmgCount: base.dmgCount || 1, dmgDie: base.dmgDie, toHit: tier + mwHit, dmgBonus: tier,
    critRange: base.crit || 20, crit: base.crit || 20, critMult: base.mult || 2, mult: base.mult || 2,
    cat: base.cat, ranged: !!base.ranged, dtype: base.type, group: base.group,
    finesse2h: !!base.finesse2h, prof: 'martial', custom: false,
    dual: false, noShield: !!base.ranged, naturalAttacks: 0, reachFly: false,
    impCritAt: 0, grapple: false, atkSound: null,
  };
}

module.exports = { weaponOf, SND, dRoll, dRollN, pick, pickSfx: sfxPick };
