/**
 * PGM skill allocation (app layer). Uses pf1core's skill DATA + math; owns the
 * "quick and convenient" level-1 spending UX:
 *   - points = class ranks/level + Int mod (min 1) + human racial +1
 *   - at level 1, max ranks per skill = 1, so allocation = choosing which skills
 *     get their single rank
 *   - SMART DEFAULT: always Perception (house rule / Tobias preference), then the
 *     most broadly-useful CLASS skills, up to the point total
 *   - players may re-select freely, including non-class skills
 */
const pf1 = require('./pf1core');
const S = pf1.skills;

// Broadly-useful adventuring skills, best-first — the default picker walks this
// and keeps the ones that are class skills for the character.
const PRIORITY = [
  'perception', 'stealth', 'sense_motive', 'acrobatics', 'diplomacy',
  'disable_device', 'know_dungeon', 'survival', 'heal', 'climb', 'swim',
  'intimidate', 'bluff', 'use_magic_device', 'spellcraft', 'know_arcana',
  'ride', 'escape_artist', 'appraise', 'fly', 'linguistics', 'know_religion',
];

/** Skill points for a level-1 character of this race/class/Int. */
function pointsFor(cls, intMod, race) {
  const racial = race === 'human' ? 1 : 0;
  return S.skillPointsForLevel(cls, intMod, racial);
}

/** The default level-1 selection: Perception + top class skills up to `points`. */
function smartDefault(cls, points) {
  const sel = ['perception'];                       // always (house rule)
  for (const k of PRIORITY) {
    if (sel.length >= points) break;
    if (k === 'perception') continue;
    if (S.classSkillFor(cls, k) && !sel.includes(k)) sel.push(k);
  }
  // If still room, take any remaining class skills, then anything.
  if (sel.length < points) {
    for (const k of (S.CLASS_SKILLS[cls] || [])) {
      if (sel.length >= points) break;
      if (!sel.includes(k)) sel.push(k);
    }
  }
  return sel.slice(0, points);
}

/**
 * Normalize a requested selection: unique, real keys only, capped at `points`.
 * (At level 1 each chosen skill = exactly 1 rank.)
 */
function normalizeSelection(selected, points) {
  const seen = new Set();
  const out = [];
  for (const k of (selected || [])) {
    if (S.SKILLS_BY_KEY[k] && !seen.has(k)) { seen.add(k); out.push(k); }
    if (out.length >= points) break;
  }
  return out;
}

/** Full skill sheet for display: every skill with ranks, modifier, flags. */
function buildSheet(cls, mods, selected) {
  const chosen = new Set(selected);
  return S.SKILLS.map(sk => {
    const ranks = chosen.has(sk.key) ? 1 : 0;
    return {
      key: sk.key, name: sk.name, ability: sk.ability,
      ranks,
      classSkill: S.classSkillFor(cls, sk.key),
      trainedOnly: sk.trainedOnly,
      modifier: S.skillModifier(sk.key, ranks, mods, cls),
      trainedMod: S.skillModifier(sk.key, 1, mods, cls),   // bonus if you put a rank here
      usable: ranks > 0 || !sk.trainedOnly,
    };
  }).sort((a, b) => {
    // class skills first, then by name
    if (a.classSkill !== b.classSkill) return a.classSkill ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
}

/**
 * Plan for the allocation UI: point total + full skill list (class-first) +
 * the smart-default selection to pre-check.
 */
function planFor(cls, mods, race) {
  const points = pointsFor(cls, mods.int || 0, race);
  const dflt = smartDefault(cls, points);
  return {
    points,
    intMod: mods.int || 0,
    smartDefault: dflt,
    skills: buildSheet(cls, mods, dflt),
  };
}

/** Trained skills (ranks > 0), formatted for narration. */
function trainedSummary(sheet) {
  return sheet.filter(s => s.ranks > 0)
    .map(s => `${s.name} ${s.modifier >= 0 ? '+' : ''}${s.modifier}`);
}

module.exports = {
  pointsFor, smartDefault, normalizeSelection, buildSheet, planFor, trainedSummary,
};
