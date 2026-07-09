/**
 * v0 vetted content: the minimal roster PGM can actually run.
 *
 * Per the vetting-gated-generation rule (docs/ENCOUNTERS-VETTING.md,
 * docs/ITEMS-VETTING.md): the game may only ever spawn/grant VETTED content.
 * v0 seeds the ledgers with what this slice can fully resolve — a couple of
 * low-CR creatures whose only need is a basic melee attack, plus basic starting
 * weapons + coins. Everything here is authentic PF1 (standard stat blocks /
 * pf1core weapon data); the full table-driven roster + diversion engine comes
 * with the world-gen subsystem.
 *
 * VETTED creatures (mechanism: v0 app-layer combat resolver — basic attack).
 * VETTED treasure: coins (cp/sp/gp), basic melee weapons (pf1core weapon data).
 */

// Low-CR creatures. Stats are standard PF1 (Bestiary). `attack` is a flat melee
// attack bonus; `dmg` is {count,sides,bonus}. `xp`/`cr` for later scaling.
const CREATURES = [
  {
    key: 'goblin', name: 'goblin', cr: '1/3', xp: 135,
    hp: 6, ac: 16, attack: 2,
    dmg: { count: 1, sides: 4, bonus: 0 }, dmgType: 'S',   // short sword
    weaponName: 'short sword',
    flavor: 'a snarling little humanoid with a rusty blade and too many teeth',
  },
  {
    key: 'dire_rat', name: 'dire rat', cr: '1/3', xp: 135,
    hp: 5, ac: 14, attack: 1,
    dmg: { count: 1, sides: 4, bonus: 1 }, dmgType: 'P',   // bite
    weaponName: 'bite',
    flavor: 'a dog-sized rat, fur matted and eyes gleaming with hunger',
  },
  {
    key: 'kobold', name: 'kobold', cr: '1/4', xp: 100,
    hp: 5, ac: 15, attack: 1,
    dmg: { count: 1, sides: 6, bonus: -1 }, dmgType: 'P',  // spear
    weaponName: 'spear',
    flavor: 'a wiry scaled reptilian, hissing and brandishing a crude spear',
  },
];

const CREATURE_BY_KEY = Object.fromEntries(CREATURES.map(c => [c.key, c]));

// Class -> starting melee weapon name (must exist in pf1core weapons.js).
// Basic gear only — PGM parties start at level 1 with what they can find.
const STARTING_WEAPON = {
  fighter: 'longsword', paladin: 'longsword', antipaladin: 'longsword',
  barbarian: 'greataxe', ranger: 'longsword', slayer: 'longsword',
  cleric: 'morningstar', warpriest: 'morningstar', inquisitor: 'longsword',
  rogue: 'short sword', ninja: 'short sword', bard: 'short sword',
  swashbuckler: 'rapier', investigator: 'rapier',
  wizard: 'quarterstaff', sorcerer: 'dagger', arcanist: 'dagger',
  witch: 'dagger', magus: 'longsword', druid: 'scimitar', monk: 'quarterstaff',
};
const DEFAULT_WEAPON = 'dagger';

// Base leather armor for everyone in v0 (AC 10 + dex + this). Simple starting kit.
const STARTING_ARMOR_BONUS = 2;

module.exports = {
  CREATURES, CREATURE_BY_KEY,
  STARTING_WEAPON, DEFAULT_WEAPON, STARTING_ARMOR_BONUS,
};
