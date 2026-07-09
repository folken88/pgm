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

/**
 * Party encounter: scales the number of foes to the party (roughly one per two
 * heroes, 1-4), draws each from the VETTED roster, and disambiguates duplicate
 * names with a letter suffix. Returns { flavor, enemies:[instances], reward }.
 */
function generatePartyRoom(partySize, roll = Math.random) {
  const count = Math.max(1, Math.min(4, Math.ceil((partySize || 1) / 2)));
  const enemies = [];
  const nameTally = {};
  for (let i = 0; i < count; i++) {
    const t = pick(CREATURES, roll);
    nameTally[t.key] = (nameTally[t.key] || 0) + 1;
    enemies.push({
      key: t.key, baseName: t.name,
      hp: t.hp, maxHp: t.hp, ac: t.ac, attack: t.attack,
      initBonus: t.initBonus || 0, dmg: t.dmg, flavor: t.flavor,
      stealth: t.stealth != null ? t.stealth : 10, sneaky: !!t.sneaky,
    });
  }
  // Suffix duplicates: "goblin A", "goblin B" (only when >1 of a kind).
  const totals = {};
  enemies.forEach(e => { totals[e.key] = (totals[e.key] || 0) + 1; });
  const seen = {};
  enemies.forEach(e => {
    if (totals[e.key] > 1) {
      seen[e.key] = (seen[e.key] || 0) + 1;
      e.name = e.baseName + ' ' + String.fromCharCode(64 + seen[e.key]); // A, B, ...
    } else {
      e.name = e.baseName;
    }
  });
  const gp = rollDice(count + 1, 6, roll) + count * 2;
  return { flavor: pick(ROOM_FLAVORS, roll), enemies, reward: { gp } };
}

module.exports = { generateRoom, generatePartyRoom, ROOM_FLAVORS };
