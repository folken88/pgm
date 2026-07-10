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
  for (const s of slugs(name)) {
    for (const ext of ['.webp', '.png', '.jpg']) {
      if (FILES.has(s + ext)) return '/portraits/' + s + ext;
    }
  }
  return null;
}

module.exports = { artFor, count: () => FILES.size };
