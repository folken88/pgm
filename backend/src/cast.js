/**
 * THE POKER CAST as PGM AI companions (Tobias: "all the ai-heroes from the
 * poker game, exactly as they are there") — races + authored builds from
 * dungeon-port/characterBuilds.js, classes from poker's BOT_CLASSES, their
 * ElevenLabs voices from character_voices.js (for the coming companion chat).
 * Signature weapons stay poker-only (locked rule): here everyone starts on the
 * class-default basic weapon and uses what the party finds.
 */
const { BUILDS } = require('./dungeon-port/characterBuilds');
const { CHARACTER_VOICES } = require('./dungeon-port/character_voices');
const characters = require('./characters');
const pf1 = require('./pf1core');
const { artFor } = require('./art');

// Transplanted verbatim from poker persistence/db.js (data, not poker logic).
const BOT_CLASSES = {
  'Sirona': 'paladin', 'Gaspar': 'inquisitor', 'Tar Baphon': 'wizard', 'Bujon, Storm of Cheliax': 'sorcerer',
  'Kelda': 'rogue', 'Kate Blackwood': 'magus', 'Toni': 'magus', 'Adimarus': 'antipaladin',
  'Rhyarca': 'oracle', 'Conchobar': 'bard', 'Nomkath': 'rogue', 'Lou Candlebean': 'fighter',
  'Elodie': 'bard', 'Dismas': 'paladin', 'Vorkstag': 'rogue', 'Estovion': 'wizard',
  'Auren Vrood': 'wizard', 'Casandalee': 'oracle', 'Meyanda': 'cleric', 'Daramid': 'wizard',
  'Kovira': 'wizard', 'Tokala': 'barbarian', 'Mr. Brow': 'investigator', 'Tamsin': 'bard',
  'Concetta': 'swashbuckler', 'Farrah': 'sorcerer', 'Fera': 'rogue',
  'Elfrip': 'oracle', 'Rodney Smith': 'ranger', 'Olbryn': 'sorcerer', 'Binch': 'cleric', 'Celeb': 'theurge',
  'Vesorianna': 'oracle', 'Farrus Richton': 'barbarian', 'Dinvaya': 'cleric', 'Storgrim Thunderbeard': 'fighter',
  'Agu': 'inquisitor', 'Chef': 'rogue', 'Kai Ginn': 'slayer', 'Lirienne': 'ranger',
  'Rissa': 'druid', 'Taelys': 'gunslinger', 'Ulfred': 'cleric', 'Vaughan': 'magus', 'Duristan Silvio': 'gunslinger',
  'Holden': 'swashbuckler',
  'Ser Toche': 'rogue', 'El Guapo': 'swashbuckler', 'Gabriel': 'paladin',
  'Femmik Embersword': 'bard', 'Freya Kusanagi': 'cavalier', "J'Mal": 'rogue', 'Jason': 'cleric',
  'Reese': 'magus', 'Savage': 'bloodrager', 'Draymus': 'wizard',
  'Azwraith': 'fighter', 'Lord Gweyir': 'cavalier',
};
// ('Crisp' the deinonychus is omitted — a creature companion needs the
// natural-attack model; he rejoins with the full attack pipeline.)

const CLASS_ICON = {
  fighter: '🛡️', paladin: '⚜️', antipaladin: '🩸', barbarian: '🪓', ranger: '🏹', slayer: '🗡️',
  rogue: '🗡️', ninja: '🥷', swashbuckler: '🤺', investigator: '🔎', monk: '👊', cavalier: '🐎',
  wizard: '🧙', sorcerer: '🔥', arcanist: '📖', witch: '🕯️', magus: '⚡', bloodrager: '💢',
  cleric: '✨', druid: '🐺', inquisitor: '⚖️', oracle: '🔮', shaman: '🌿', theurge: '☯️',
  bard: '🎵', summoner: '🌀', warpriest: '🔨', gunslinger: '🔫',
};

/** The selectable companion roster (sorted; every entry buildable). */
const ROSTER = Object.keys(BOT_CLASSES).sort().map(name => {
  const cls = BOT_CLASSES[name];
  const b = BUILDS[name] || {};
  return { name, cls, race: b.race || 'human', icon: CLASS_ICON[cls] || '🎭', art: artFor(name), voiceId: CHARACTER_VOICES[name] || null };
});
const BY_NAME = Object.fromEntries(ROSTER.map(r => [r.name.toLowerCase(), r]));

/** Build a cast member as a full PGM character (level 1, basic gear, smart-
 *  default skills; authentic race mods incl. flex via pf1core races). */
function buildCompanion(name) {
  const r = BY_NAME[String(name || '').toLowerCase()];
  if (!r) return null;
  const b = BUILDS[r.name] || {};
  const baseScores = b.scores || null;                        // authored 25-pt build when present
  const raceMods = pf1.races.raceModsFor(r.race, baseScores || undefined, b.flex);
  const character = characters.createCharacter({
    name: r.name, race: r.race, cls: r.cls,
    baseScores, raceMods,
  });
  return { roster: r, character };
}

module.exports = { ROSTER, BY_NAME, BOT_CLASSES, buildCompanion };
