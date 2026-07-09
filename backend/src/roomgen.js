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

module.exports = { generateRoom, ROOM_FLAVORS };
