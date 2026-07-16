/**
 * TTS SHORT NAMES (Tobias 2026-07-15): "we need shortnames/nicknames for all
 * characters and entities for tts to save time." The VISIBLE text keeps full
 * names; only SPEECH substitutes them (client-side, in blindmode's earFix and
 * on the 11labs text). Served to the client via /api/meta as `ttsShort`.
 *
 * Rules agreed with Tobias:
 *   · characters → first name (Duristan Silvio → Duristan, Farrus Richton → Farrus)
 *   · honorifics drop (Lord Gweyir → Gweyir, Mr. Brow → Brow) — EXCEPT Ser Toche:
 *     "ser is her first name", so she stays whole
 *   · Auren Vrood → Vrood (how Carrion Crown knows him)
 *   · monsters shorten too — to the word that stays DISTINCT within the gangs
 *     they fight alongside (vampires gang together, so Vampire Knight → Knight
 *     is safe; Hill Giant / Stone Giant would both become "Giant", so they keep
 *     their full names). Snappy two-word names that save no real time also stay.
 *   · player-typed character names are spoken exactly as typed (no entry here).
 *
 * PGM-ONLY file — monster names come from the poker-synced bestiary, but this
 * map lives here so sync-from-poker can't clobber it. An entry whose full name
 * leaves the bestiary simply never matches; harmless.
 */
const SHORT = {
  // ── Companions (the poker cast) ──────────────────────────────────────────
  'Bujon, Storm of Cheliax': 'Bujon',
  'Kate Blackwood': 'Kate',
  'Lou Candlebean': 'Lou',
  'Rodney Smith': 'Rodney',
  'Farrus Richton': 'Farrus',
  'Storgrim Thunderbeard': 'Storgrim',
  'Kai Ginn': 'Kai',
  'Duristan Silvio': 'Duristan',
  'Femmik Embersword': 'Femmik',
  'Freya Kusanagi': 'Freya',
  'Lord Gweyir': 'Gweyir',
  'Mr. Brow': 'Brow',
  // (kept whole on purpose: Ser Toche — Ser is her first name; El Guapo; J'Mal;
  //  Tar Baphon — the name is the two words.)

  // ── Bestiary: named villains ─────────────────────────────────────────────
  'Auren Vrood': 'Vrood',
  'Tar-Baphon, the Whispering Tyrant': 'Tar-Baphon',
  'Kevoth-Kul, the Black Sovereign': 'Kevoth-Kul',
  'Amalokla, the First Sovereign': 'Amalokla',
  'Brogwort the Dim': 'Brogwort',
  'Master Uke': 'Uke',
  'Captain Maris': 'Maris',
  'Captain Elliot Thrune': 'Elliot',
  'Barzillai Thrune': 'Barzillai',
  'Abrogail Thrune II': 'Abrogail',
  'Knight Commander Graxus Phand': 'Graxus',
  'Sevestra Hanail': 'Sevestra',
  'Bent-Beak Charney': 'Charney',
  'The Golden Saurian': 'Saurian',
  'Erelim (Angel Bro)': 'Erelim',

  // ── Bestiary: mooks — the distinctive word, kept unique within each gang ──
  // Kobold warren
  'Kobold Spearman': 'Spearman', 'Kobold Shaman': 'Shaman', 'Kobold Rogue': 'Rogue',
  'Kobold Monk': 'Monk', 'Kobold Adept': 'Adept',
  // Goblin tribe
  'Goblin Rogue': 'Rogue', 'Goblin Shaman': 'Shaman', 'Goblin Barbarian': 'Barbarian',
  // Beasts & vermin
  'Dire Rat': 'Rat', 'Giant Centipede': 'Centipede', 'Giant Spider': 'Spider',
  'Dire Ape': 'Ape', 'Dire Boar': 'Boar', 'Dire Bear': 'Bear',
  'Gibbering Mouther': 'Mouther', 'Mecha Gargoyle': 'Gargoyle', 'Blood Caimon': 'Caimon',
  'Harpy Sorcerer': 'Harpy',
  // Undead & the Whispering Way
  'Skeletal Champion': 'Champion', 'Whispering Cultist': 'Cultist',
  'Ghoul Antipaladin': 'Antipaladin', 'Ghoul Crusader': 'Crusader',
  'WW Initiate': 'Initiate', 'WW Knife': 'Knife', 'WW Gravecaller': 'Gravecaller',
  'WW Bladebound': 'Bladebound', 'WW Necromancer': 'Necromancer', 'WW Slayer': 'Slayer',
  'WW Death Priest': 'Death Priest', 'WW Deathblade': 'Deathblade', 'WW Archnecromancer': 'Archnecromancer',
  // Vampires (gang together — the roles stay distinct)
  'Vampire Spawn': 'Spawn', 'Vampire Knight': 'Knight', 'Vampire Inquisitor': 'Inquisitor',
  'Vampire Rogue': 'Rogue', 'Vampire Scout': 'Scout', 'Vampire Warrior': 'Warrior',
  'Vampire Bodyguard': 'Bodyguard', 'Vampire Priest': 'Priest', 'Vampire Assassin': 'Assassin',
  'Vampire Nightguard': 'Nightguard', 'Vampire Monk': 'Monk', 'Vampire Tech Witch': 'Witch',
  // Humans & mortals
  'Shaolin Monk': 'Monk', 'Shackles Brawler': 'Brawler', 'Greenbriar Adept': 'Adept',
  'Chelish Redactor': 'Redactor', 'Medusa Archer': 'Archer', 'Medusa Swashbuckler': 'Swashbuckler',
  'Medusa Sorceress': 'Sorceress',
  // Pirates & the Shackles
  'Damned Lubber': 'Lubber', 'Fever Sea Buccaneer': 'Buccaneer', 'Fever Sea Scallywag': 'Scallywag',
  'Chelish Marine': 'Marine', 'Shackles Sea-Caster': 'Sea-Caster', 'Port Peril Kingsguard': 'Kingsguard',
  'Bronze Fleet Officer': 'Officer',
  'Sahuagin Scout': 'Scout', 'Sahuagin Reefstalker': 'Reefstalker', 'Sahuagin Rager': 'Rager',
  'Sahuagin Shaman': 'Shaman', 'Sahuagin Prince': 'Prince',
  'Charau-Ka Warrior': 'Warrior', 'Charau-Ka Stepper': 'Stepper', 'Charau-Ka Mancer': 'Mancer',
  'Fungal Pirate': 'Pirate', 'Fungal Oracle': 'Oracle', 'Fungal Captain': 'Captain',
  // Devils (gang together — role words stay distinct; "X Devil" pairs stay whole)
  'Devil Swordsman': 'Swordsman', 'Devil Samurai': 'Samurai', 'Accuser Devil': 'Accuser',
  // Celestials (gang together)
  'Angelic Cleric': 'Cleric', 'Angelic Cavalier': 'Cavalier',
  'Bralani Azata': 'Bralani', 'Lillend Azata': 'Lillend', 'Ghaele Azata': 'Ghaele',
  "Inheritor's Holy Gun": 'Holy Gun',
  // Clockwork legion (gang together — the role words stay distinct)
  'Drone 0.5 Rhoomba': 'Rhoomba', 'Drone 1.0 Collector': 'Collector', 'Drone 2.5 Stinger': 'Stinger',
  'Drone 3.0 Repairs': 'Repairs', 'Gearsman 1.0': 'Gearsman', 'Gearsman 3.6 Pugilist': 'Pugilist',
  'Gearsman 5.0 Gunslinger': 'Gunslinger', 'Gearsman 5.5 Sniper': 'Sniper',
  'Gearsman 3.0 Riot Suppressor': 'Suppressor', 'Gearsman 6.0 Thought Harvester': 'Harvester',
  'Gearsman 4.0 Juggernaut': 'Juggernaut', 'Gearsman 6.7 Scraper': 'Scraper',
  'Mecha 3.4 Railgun Tank': 'Railgun Tank', 'Mecha 3.2 Repeater Tank': 'Repeater Tank',
  'Mecha 5.5 Warden': 'Warden',
  // Kept whole on purpose (snappy, or shortening would collide inside a gang):
  //   Hill Giant / Stone Giant · Black Dragon / Void Dragon · Skeletal Ogre (vs Ogre)
  //   Fire Skeleton (vs Skeleton) · Winter Wolf · Gray Ooze · Wood Golem / Brass Golem
  //   Bog Brute · Barbed/Bone/Horned/Bomb Devil · Pit Fiend · Hound Archon
  //   Movanic/Astral Deva · 4th/5th/6th Sword Knight · Fist of Iomedae
  //   Abyssal Horror / Nameless Horror · Vampire Knight vs 4th Sword Knight is
  //   cross-faction (undead vs celestials never gang) — safe.
};

/** [ [fullName, shortName], … ] — longest names first so nested matches can't
 *  mis-fire ("Captain Elliot Thrune" before "Captain Maris" is irrelevant, but
 *  longest-first is the safe general order for substitution). */
function pairs() {
  return Object.entries(SHORT)
    .filter(([full, short]) => short && short !== full)
    .sort((a, b) => b[0].length - a[0].length);
}

module.exports = { SHORT, pairs };
