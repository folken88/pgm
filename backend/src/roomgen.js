/**
 * v0 room generator — makes ONE room with one vetted creature and a coin reward.
 * This is the seam the full donjon spatial generator + terrain×CR encounter
 * tables (with vetting-diversion) replace later. For now: pick a vetted creature
 * and roll a small coin hoard. Everything it can produce is VETTED by
 * construction (it only draws from content.js).
 */
const { CREATURES } = require('./content');
const { pick, rollDice } = require('./dice');

const ROOM_FLAVORS = [
  'a cramped stone chamber, its walls slick with damp',
  'a collapsed corridor opening into a dusty vault',
  'a torchlit guardroom that reeks of old smoke',
  'a root-choked cellar half-reclaimed by the earth',
  'a low cave whose ceiling drips in the dark',
];

/**
 * Generate one room. Returns { flavor, creature (a fresh combat instance),
 * reward: { gp } }.
 */
function generateRoom(roll = Math.random) {
  const template = pick(CREATURES, roll);
  const creature = {
    key: template.key,
    name: template.name,
    flavor: template.flavor,
    weaponName: template.weaponName,
    maxHp: template.hp,
    hp: template.hp,
    ac: template.ac,
    attack: template.attack,
    dmg: template.dmg,
    cr: template.cr,
    xp: template.xp,
  };
  const gp = rollDice(2, 6, roll) + 2;          // 4-14 gp — the minimal VETTED drop
  return {
    flavor: pick(ROOM_FLAVORS, roll),
    creature,
    reward: { gp },
  };
}

function instantiate(t) {
  return {
    key: t.key, baseName: t.name, xp: t.xp || 100,
    hp: t.hp, maxHp: t.hp, ac: t.ac, attack: t.attack,
    initBonus: t.initBonus || 0, dmg: t.dmg, flavor: t.flavor,
    stealth: t.stealth != null ? t.stealth : 10, sneaky: !!t.sneaky, undead: !!t.undead,
  };
}
const CHEAPEST_XP = Math.min.apply(null, CREATURES.map(c => c.xp || 100));

// PF1-style XP budget for an APL-1 encounter, by difficulty tier (total XP for a
// standard 4-person party). We scale this by party size, APL, and depth.
const BASE_XP = { easy: 200, average: 400, hard: 600 };

function pickTier(depth, roll) {
  const hardBias = Math.min(0.22, depth * 0.03);   // rooms get a little nastier deeper
  const r = roll();
  if (r < 0.40 - hardBias) return 'easy';
  if (r < 0.85 - hardBias) return 'average';
  return 'hard';
}

/**
 * Party encounter, built to a CR/XP budget so a level-1 party isn't wiped in
 * room 1. Budget = tier base × (partySize/4) × APL × depth-ramp. Foes are drawn
 * from the VETTED roster until the budget is spent (a foe may exceed the
 * remaining budget by ≤25%). Returns { flavor, enemies, reward, tier }.
 */
function generatePartyRoom(partySize, apl, depth, roll = Math.random) {
  partySize = Math.max(1, partySize || 1); apl = Math.max(1, apl || 1); depth = depth || 0;
  const tier = pickTier(depth, roll);
  const budget = Math.max(CHEAPEST_XP, Math.round(
    BASE_XP[tier] * (partySize / 4) * apl * (1 + depth * 0.08)));

  const enemies = [];
  let remaining = budget, guard = 0;
  while (guard++ < 12 && enemies.length < 6) {
    const affordable = CREATURES.filter(c => (c.xp || 100) <= remaining * 1.25);
    if (!affordable.length) break;
    const t = pick(affordable, roll);
    enemies.push(instantiate(t));
    remaining -= (t.xp || 100);
    if (remaining < CHEAPEST_XP * 0.6) break;      // budget effectively spent
  }
  if (!enemies.length) enemies.push(instantiate(CREATURES.reduce((a, b) => ((a.xp || 100) <= (b.xp || 100) ? a : b))));

  // Suffix duplicates: "goblin A", "goblin B".
  const totals = {};
  enemies.forEach(e => { totals[e.key] = (totals[e.key] || 0) + 1; });
  const seen = {};
  enemies.forEach(e => {
    if (totals[e.key] > 1) { seen[e.key] = (seen[e.key] || 0) + 1; e.name = e.baseName + ' ' + String.fromCharCode(64 + seen[e.key]); }
    else e.name = e.baseName;
  });

  const spent = enemies.reduce((s, e) => s + (e.xp || 100), 0);
  const gp = Math.round(spent / 12) + rollDice(2, 6, roll);   // reward tracks the challenge
  return { flavor: pick(ROOM_FLAVORS, roll), enemies, reward: { gp }, tier, budget };
}

module.exports = { generateRoom, generatePartyRoom, ROOM_FLAVORS };
