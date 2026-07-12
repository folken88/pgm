/**
 * Character/creature art — poker-dungeon's portrait library (public/portraits/,
 * crop-station-baked webp, committed per poker's asset policy). Resolves a
 * display name to its portrait via slug variants; heroes AND enemies both.
 * The crop tool for custom player art is a follow-up (see SHIM-WORKLIST).
 */
const fs = require('node:fs');
const path = require('node:path');

const DIR = path.join(__dirname, '..', '..', 'public', 'portraits');
let FILES = new Set();
try { FILES = new Set(fs.readdirSync(DIR).filter(f => /\.(webp|png|jpg)$/i.test(f))); } catch (e) {}

// Known name→file mismatches (poker's slugs drifted from display names).
const ALIAS = {
  'kai ginn': 'kai-gin', 'giant spider': 'spider', 'giant centipede': 'centipede',
  'wolf': 'winter_wolf', 'goblin dog': 'goblin',
  // roster nicknames whose portrait carries a fuller name
  'agu': 'aguclandos-lem', 'bujon': 'bujon-storm-of-cheliax', 'storm of cheliax': 'bujon-storm-of-cheliax',
  'mr. brow': 'augustus-teabrow', 'mr brow': 'augustus-teabrow',
};

function slugs(name) {
  const base = String(name || '').toLowerCase().replace(/['’]/g, '').trim();
  return [
    ALIAS[base],
    base.replace(/\s+/g, '-'),
    base.replace(/\s+/g, '_'),
    base.replace(/\s+/g, ''),
    base.split(/\s+/)[0],                       // first name ("Kai Ginn" → kai)
  ].filter(Boolean);
}

/** Portrait URL for a display name, or null. */
function artFor(name) {
  const ss = slugs(name);
  // 1) exact slug match
  for (const s of ss) {
    for (const ext of ['.webp', '.png', '.jpg']) {
      if (FILES.has(s + ext)) return '/portraits/' + s + ext;
    }
  }
  // 2) PREFIX match — many portraits carry a surname the roster drops
  //    ("Dismas" -> dismas-aevrett.webp, "Lirienne" -> lirienne-voss.webp).
  //    Require a separator so "dismas" can't swallow "dis...".
  for (const s of ss) {
    if (s.length < 3) continue;
    const hit = [...FILES].find(f => f.startsWith(s + '-') || f.startsWith(s + '_'));
    if (hit) return '/portraits/' + hit;
  }
  return null;
}

module.exports = { artFor, count: () => FILES.size };
