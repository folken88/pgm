/**
 * PF1 skills — shared rules DATA (belongs in pf1core; PGM uses it, poker simply
 * doesn't import it). The 35 standard Pathfinder skills (Knowledge broken into
 * its 10 fields), each class's class-skill list, and skill ranks per level.
 *
 * HOUSE RULE (Tobias, PGM): Perception is a class skill for EVERY class. It is
 * therefore intentionally omitted from the per-class lists below and forced true
 * in classSkillFor(). (Mirrors how poker's free-finesse house rule lives in
 * pf1core/character.js — campaign house rules ride with the shared engine.)
 *
 * A skill: { key, name, ability, trainedOnly, acp }.
 *   ability    — governing ability key (str/dex/con/int/wis/cha)
 *   trainedOnly— needs >=1 rank to attempt
 *   acp        — armor check penalty applies
 */

const SKILLS = [
  { key: 'acrobatics',      name: 'Acrobatics',              ability: 'dex', trainedOnly: false, acp: true },
  { key: 'appraise',        name: 'Appraise',                ability: 'int', trainedOnly: false, acp: false },
  { key: 'bluff',           name: 'Bluff',                   ability: 'cha', trainedOnly: false, acp: false },
  { key: 'climb',           name: 'Climb',                   ability: 'str', trainedOnly: false, acp: true },
  { key: 'craft',           name: 'Craft',                   ability: 'int', trainedOnly: false, acp: false },
  { key: 'diplomacy',       name: 'Diplomacy',               ability: 'cha', trainedOnly: false, acp: false },
  { key: 'disable_device',  name: 'Disable Device',          ability: 'dex', trainedOnly: true,  acp: true },
  { key: 'disguise',        name: 'Disguise',                ability: 'cha', trainedOnly: false, acp: false },
  { key: 'escape_artist',   name: 'Escape Artist',           ability: 'dex', trainedOnly: false, acp: true },
  { key: 'fly',             name: 'Fly',                     ability: 'dex', trainedOnly: false, acp: true },
  { key: 'handle_animal',   name: 'Handle Animal',           ability: 'cha', trainedOnly: true,  acp: false },
  { key: 'heal',            name: 'Heal',                    ability: 'wis', trainedOnly: false, acp: false },
  { key: 'intimidate',      name: 'Intimidate',              ability: 'cha', trainedOnly: false, acp: false },
  { key: 'know_arcana',     name: 'Knowledge (Arcana)',      ability: 'int', trainedOnly: true,  acp: false },
  { key: 'know_dungeon',    name: 'Knowledge (Dungeoneering)', ability: 'int', trainedOnly: true, acp: false },
  { key: 'know_engineering',name: 'Knowledge (Engineering)', ability: 'int', trainedOnly: true,  acp: false },
  { key: 'know_geography',  name: 'Knowledge (Geography)',   ability: 'int', trainedOnly: true,  acp: false },
  { key: 'know_history',    name: 'Knowledge (History)',     ability: 'int', trainedOnly: true,  acp: false },
  { key: 'know_local',      name: 'Knowledge (Local)',       ability: 'int', trainedOnly: true,  acp: false },
  { key: 'know_nature',     name: 'Knowledge (Nature)',      ability: 'int', trainedOnly: true,  acp: false },
  { key: 'know_nobility',   name: 'Knowledge (Nobility)',    ability: 'int', trainedOnly: true,  acp: false },
  { key: 'know_planes',     name: 'Knowledge (Planes)',      ability: 'int', trainedOnly: true,  acp: false },
  { key: 'know_religion',   name: 'Knowledge (Religion)',    ability: 'int', trainedOnly: true,  acp: false },
  { key: 'linguistics',     name: 'Linguistics',             ability: 'int', trainedOnly: true,  acp: false },
  { key: 'perception',      name: 'Perception',              ability: 'wis', trainedOnly: false, acp: false },
  { key: 'perform',         name: 'Perform',                 ability: 'cha', trainedOnly: false, acp: false },
  { key: 'profession',      name: 'Profession',              ability: 'wis', trainedOnly: true,  acp: false },
  { key: 'ride',            name: 'Ride',                    ability: 'dex', trainedOnly: false, acp: true },
  { key: 'sense_motive',    name: 'Sense Motive',            ability: 'wis', trainedOnly: false, acp: false },
  { key: 'sleight_of_hand', name: 'Sleight of Hand',         ability: 'dex', trainedOnly: true,  acp: true },
  { key: 'spellcraft',      name: 'Spellcraft',              ability: 'int', trainedOnly: true,  acp: false },
  { key: 'stealth',         name: 'Stealth',                 ability: 'dex', trainedOnly: false, acp: true },
  { key: 'survival',        name: 'Survival',                ability: 'wis', trainedOnly: false, acp: false },
  { key: 'swim',            name: 'Swim',                    ability: 'str', trainedOnly: false, acp: true },
  { key: 'use_magic_device',name: 'Use Magic Device',        ability: 'cha', trainedOnly: true,  acp: false },
];
const SKILLS_BY_KEY = Object.fromEntries(SKILLS.map(s => [s.key, s]));
const ALL_KNOWLEDGE = SKILLS.filter(s => s.key.startsWith('know_')).map(s => s.key);

// Class-skill lists (Perception omitted — house-ruled class skill for ALL).
const CLASS_SKILLS = {
  fighter: ['climb','craft','handle_animal','intimidate','know_dungeon','know_engineering','profession','ride','survival','swim'],
  barbarian: ['acrobatics','climb','craft','handle_animal','intimidate','know_nature','ride','survival','swim'],
  paladin: ['craft','diplomacy','handle_animal','heal','know_nobility','know_religion','profession','ride','sense_motive','spellcraft'],
  antipaladin: ['bluff','craft','disguise','handle_animal','intimidate','know_religion','ride','sense_motive','spellcraft','stealth'],
  ranger: ['climb','craft','handle_animal','heal','intimidate','know_dungeon','know_geography','know_nature','profession','ride','spellcraft','stealth','survival','swim'],
  rogue: ['acrobatics','appraise','bluff','climb','craft','diplomacy','disable_device','disguise','escape_artist','intimidate','know_dungeon','know_local','linguistics','perform','profession','sense_motive','sleight_of_hand','stealth','swim','use_magic_device'],
  ninja: ['acrobatics','appraise','bluff','climb','craft','disable_device','disguise','escape_artist','intimidate','know_local','linguistics','profession','sense_motive','sleight_of_hand','stealth','swim','use_magic_device'],
  slayer: ['acrobatics','bluff','climb','craft','disguise','handle_animal','heal','intimidate','know_dungeon','know_geography','know_local','profession','ride','sense_motive','sleight_of_hand','stealth','survival','swim'],
  swashbuckler: ['acrobatics','bluff','climb','craft','diplomacy','escape_artist','intimidate','know_local','know_nobility','profession','ride','sense_motive','sleight_of_hand','swim'],
  brawler: ['acrobatics','climb','craft','escape_artist','handle_animal','intimidate','know_dungeon','profession','ride','sense_motive','swim'],
  investigator: ['acrobatics','appraise','bluff','climb','craft','diplomacy','disable_device','disguise','escape_artist','heal','intimidate','know_arcana','know_dungeon','know_engineering','know_geography','know_history','know_local','know_nature','know_nobility','know_planes','know_religion','linguistics','profession','sense_motive','sleight_of_hand','spellcraft','stealth','use_magic_device'],
  monk: ['acrobatics','climb','craft','escape_artist','intimidate','know_history','know_religion','profession','ride','sense_motive','stealth','swim'],
  wizard: ['appraise','craft','fly','know_arcana','know_dungeon','know_engineering','know_geography','know_history','know_local','know_nature','know_nobility','know_planes','know_religion','linguistics','profession','spellcraft'],
  sorcerer: ['appraise','bluff','craft','fly','intimidate','know_arcana','profession','spellcraft','use_magic_device'],
  arcanist: ['appraise','craft','fly','know_arcana','know_dungeon','know_engineering','know_geography','know_history','know_local','know_nature','know_nobility','know_planes','know_religion','linguistics','profession','spellcraft','use_magic_device'],
  witch: ['craft','fly','heal','intimidate','know_arcana','know_history','know_nature','know_planes','profession','spellcraft','use_magic_device'],
  magus: ['climb','craft','fly','intimidate','know_arcana','know_dungeon','know_planes','profession','ride','spellcraft','swim','use_magic_device'],
  cleric: ['appraise','craft','diplomacy','heal','know_arcana','know_history','know_nobility','know_planes','know_religion','linguistics','profession','sense_motive','spellcraft'],
  druid: ['climb','craft','fly','handle_animal','heal','know_geography','know_nature','profession','ride','spellcraft','survival','swim'],
  inquisitor: ['bluff','climb','craft','diplomacy','disguise','heal','intimidate','know_arcana','know_dungeon','know_nature','know_planes','know_religion','profession','ride','sense_motive','spellcraft','stealth','survival','swim'],
  shaman: ['craft','diplomacy','fly','handle_animal','heal','know_nature','know_planes','know_religion','profession','ride','sense_motive','spellcraft','survival'],
  bard: ['acrobatics','appraise','bluff','climb','craft','diplomacy','disguise','escape_artist','intimidate','know_arcana','know_dungeon','know_engineering','know_geography','know_history','know_local','know_nature','know_nobility','know_planes','know_religion','linguistics','perform','profession','sense_motive','sleight_of_hand','spellcraft','stealth','use_magic_device'],
  oracle: ['craft','diplomacy','heal','know_history','know_planes','know_religion','profession','sense_motive','spellcraft'],
  summoner: ['craft','fly','handle_animal','know_arcana','know_dungeon','know_planes','linguistics','profession','ride','spellcraft','use_magic_device'],
  warpriest: ['climb','craft','diplomacy','handle_animal','heal','intimidate','know_engineering','know_religion','profession','ride','sense_motive','spellcraft','survival','swim'],
  bloodrager: ['acrobatics','climb','craft','handle_animal','intimidate','know_arcana','profession','ride','spellcraft','survival','swim'],
};

// Skill ranks per level (before Int mod), by class. Default 2 if unlisted.
const SKILL_RANKS = {
  fighter: 2, barbarian: 4, paladin: 2, antipaladin: 2, ranger: 6, warpriest: 2,
  bloodrager: 4, slayer: 6, rogue: 8, ninja: 8, swashbuckler: 4, investigator: 6,
  monk: 4, brawler: 4, wizard: 2, arcanist: 2, witch: 2, magus: 2, cleric: 2,
  druid: 4, inquisitor: 6, shaman: 4, sorcerer: 2, bard: 6, oracle: 4, summoner: 2,
};

/** Is `skillKey` a class skill for `cls`? (Perception house-ruled true for all.) */
function classSkillFor(cls, skillKey) {
  if (skillKey === 'perception') return true;                 // HOUSE RULE
  const list = CLASS_SKILLS[cls];
  return !!(list && list.includes(skillKey));
}

/** Base skill ranks per level for a class (before Int mod), default 2. */
function ranksPerLevel(cls) {
  return SKILL_RANKS[cls] != null ? SKILL_RANKS[cls] : 2;
}

/**
 * Skill points gained at a level = max(1, ranksPerLevel + intMod) + racial bonus.
 * (racialSkillBonus is +1/level for humans, 0 otherwise.)
 */
function skillPointsForLevel(cls, intMod, racialSkillBonus = 0) {
  return Math.max(1, ranksPerLevel(cls) + (intMod || 0)) + (racialSkillBonus || 0);
}

/** Total skill modifier = ranks + abilityMod + (class skill w/ >=1 rank ? +3 : 0). */
function skillModifier(skillKey, ranks, mods, cls) {
  const sk = SKILLS_BY_KEY[skillKey];
  if (!sk) return 0;
  const abil = (mods && mods[sk.ability]) || 0;
  const classBonus = (ranks > 0 && classSkillFor(cls, skillKey)) ? 3 : 0;
  return ranks + abil + classBonus;
}

module.exports = {
  SKILLS, SKILLS_BY_KEY, ALL_KNOWLEDGE, CLASS_SKILLS, SKILL_RANKS,
  classSkillFor, ranksPerLevel, skillPointsForLevel, skillModifier,
};
