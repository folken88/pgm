/**
 * Character creation — turns a (name, race, class) choice into a full playable
 * character via pf1core derivation + a basic starting kit. v0 uses a standard
 * 25-point-ish stat array; full point-buy / ability assignment is a later step.
 */
const pf1 = require('./pf1core');
const { heroAC } = require('./combat');
const skillAlloc = require('./skills');
const { STARTING_WEAPON, DEFAULT_WEAPON, STARTING_ARMOR_BONUS } = require('./content');

// Sensible level-1 array; assigned by class priority later. v0: fixed spread.
const DEFAULT_SCORES = { str: 15, dex: 13, con: 14, int: 12, wis: 10, cha: 8 };

// Class-priority stat spreads so a wizard isn't a bad fighter and vice-versa.
const MELEE = { str: 15, dex: 13, con: 14, int: 10, wis: 12, cha: 8 };
const FINESSE = { str: 12, dex: 15, con: 13, int: 10, wis: 12, cha: 10 };
const ARCANE = { str: 8, dex: 14, con: 13, int: 15, wis: 12, cha: 10 };
const DIVINE = { str: 12, dex: 10, con: 14, int: 8, wis: 15, cha: 13 };
const CHA_CASTER = { str: 10, dex: 14, con: 13, int: 10, wis: 12, cha: 15 };

const SCORES_BY_CLASS = {
  fighter: MELEE, barbarian: MELEE, paladin: MELEE, antipaladin: MELEE,
  ranger: MELEE, warpriest: MELEE, bloodrager: MELEE, slayer: FINESSE,
  rogue: FINESSE, ninja: FINESSE, swashbuckler: FINESSE, investigator: FINESSE,
  monk: FINESSE, brawler: FINESSE,
  wizard: ARCANE, arcanist: ARCANE, witch: ARCANE, magus: ARCANE,
  cleric: DIVINE, druid: DIVINE, inquisitor: DIVINE, shaman: DIVINE,
  sorcerer: CHA_CASTER, bard: CHA_CASTER, oracle: CHA_CASTER, summoner: CHA_CASTER,
};

const RACE_MODS = {
  human: null,               // +2 to one; handled as null (flat) for v0 simplicity
  elf: { dex: 2, int: 2, con: -2 },
  dwarf: { con: 2, wis: 2, cha: -2 },
  halfling: { dex: 2, cha: 2, str: -2 },
  'half-orc': { str: 2 },
  gnome: { con: 2, cha: 2, str: -2 },
  'half-elf': null,
};

function validClass(cls) {
  return pf1.classes.CLASSES[cls] ? cls : pf1.classes.DEFAULT_CLASS;
}

/**
 * Build a playable character. Returns the persistable/serializable shape.
 */
function createCharacter({ name, race = 'human', cls = 'fighter', skills = null }) {
  cls = validClass(cls);
  const baseScores = SCORES_BY_CLASS[cls] || DEFAULT_SCORES;
  const raceMods = RACE_MODS[race] || null;

  const weaponName = STARTING_WEAPON[cls] || DEFAULT_WEAPON;
  const weapon = pf1.weapons.WEAPON_BY_NAME[weaponName] || pf1.weapons.WEAPON_BY_NAME[DEFAULT_WEAPON];

  const derived = pf1.character.deriveCharacter({
    cls, level: 1, baseScores, race, raceMods, weapon,
  });

  const ac = heroAC(derived, STARTING_ARMOR_BONUS);

  // Skills: use the provided selection, else fall back to the smart default.
  const points = skillAlloc.pointsFor(cls, derived.mods.int || 0, race);
  const selected = skillAlloc.normalizeSelection(
    skills || skillAlloc.smartDefault(cls, points), points);
  const skillSheet = skillAlloc.buildSheet(cls, derived.mods, selected);

  return {
    name: String(name || 'Adventurer').slice(0, 40),
    race, cls,
    weaponName, weapon,
    derived,                 // full pf1core derivation (bab, mods, saves, hp, ...)
    maxHp: derived.hp,
    ac,
    skillPoints: points,
    skills: selected,        // chosen skill keys (1 rank each at level 1)
    skillSheet,              // full display sheet
  };
}

/** Preview a character's ability mods + skill plan without committing a run. */
function planCharacter({ name, race = 'human', cls = 'fighter' }) {
  cls = validClass(cls);
  const baseScores = SCORES_BY_CLASS[cls] || DEFAULT_SCORES;
  const raceMods = RACE_MODS[race] || null;
  const derived = pf1.character.deriveCharacter({ cls, level: 1, baseScores, race, raceMods });
  return skillAlloc.planFor(cls, derived.mods, race);
}

const RACES = Object.keys(RACE_MODS);
const CLASSES = Object.keys(SCORES_BY_CLASS);

module.exports = { createCharacter, planCharacter, RACES, CLASSES, validClass };
