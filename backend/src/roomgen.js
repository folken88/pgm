/**
 * v0 room generator — makes ONE room with one vetted creature and a coin reward.
 * This is the seam the full donjon spatial generator + terrain×CR encounter
 * tables (with vetting-diversion) replace later. For now: pick a vetted creature
 * and roll a small coin hoard. Everything it can produce is VETTED by
 * construction (it only draws from content.js).
 */
const { CREATURES } = require('./content');
const { pick, rollDice } = require('./dice');

// ── ROOM FLAVOR (Tobias 2026-07-13: "more variety of room types and
// descriptions"). A room is an ARCHETYPE (its kind) × a phrasing × an optional
// sensory detail — combinatorial variety instead of a fixed handful. Deeper
// rooms bias toward the ominous archetypes. Each phrasing reads cleanly after
// "You enter ".
const ROOM_ARCHETYPES = [
  { type: 'cave', omen: 0, phrases: [
    'a low natural cave whose ceiling drips in the dark',
    'a jagged cavern where your footsteps echo too far',
    'a damp grotto veined with pale, sweating stone',
    'a rough-hewn hollow that swallows the torchlight' ] },
  { type: 'hall', omen: 0, phrases: [
    'a long pillared hall, its flagstones worn smooth by ages of feet',
    'a vaulted stone hall hung with rotted, colorless banners',
    'a broad audience hall, its far end lost in shadow',
    'a colonnaded gallery where dust hangs in the still air' ] },
  { type: 'guardroom', omen: 0, phrases: [
    'a torchlit guardroom that reeks of old smoke and sweat',
    'a cramped barrack-room, cots overturned and weapons rusting on racks',
    'a watch-post ringed with arrow-slits and cold ash',
    'a sentry chamber where a game of dice lies abandoned mid-throw' ] },
  { type: 'cellar', omen: 0, phrases: [
    'a root-choked cellar half-reclaimed by the earth',
    'a musty storeroom stacked with split casks and mildewed crates',
    'a provisioning cellar, its shelves furred with grey mold',
    'a cramped larder that stinks of things gone to rot' ] },
  { type: 'flooded', omen: 1, phrases: [
    'a flooded gallery where black water laps at your ankles',
    'a half-drowned chamber, its far wall dissolving into still dark water',
    'a seeping cistern whose surface ripples with no wind to stir it',
    'a waterlogged passage where every step sends echoes slapping the walls' ] },
  { type: 'shrine', omen: 1, phrases: [
    'a defiled shrine, its idol toppled and its altar stained black',
    'a low chapel to a forgotten god, votive niches choked with ash',
    'a ruined sanctum where a cold draft guttered the last candle long ago',
    'a prayer-hall whose frescoes have been clawed from the walls' ] },
  { type: 'crypt', omen: 2, phrases: [
    'a silent crypt lined with niches, each holding its patient dead',
    'a burial vault where stone sarcophagi sit with lids ajar',
    'an ossuary, walls tiled floor-to-ceiling in yellowed bone',
    'a catacomb whose air is thick and old and utterly still' ] },
  { type: 'prison', omen: 2, phrases: [
    'a row of rusted cells, chains still hanging from the walls',
    'a dungeon block that reeks of old fear and iron',
    'an oubliette antechamber, a black pit gaping at its center',
    'a torture-room, its grim tools laid out with awful care' ] },
  { type: 'library', omen: 0, phrases: [
    'a collapsed library, shelves spilled into drifts of rotting vellum',
    'a scriptorium where ink has dried to dust in a hundred pots',
    'a records-vault, its pigeonholes stuffed with crumbling scrolls',
    'a study choked with mildewed books and cobwebbed orreries' ] },
  { type: 'forge', omen: 0, phrases: [
    'a cold forge, its great anvil scabbed with rust',
    'a smithy where the bellows hang rotted and the coals are long dead',
    'a foundry hall ringed with cracked crucibles and slag',
    'a workshop littered with half-finished, abandoned work' ] },
  { type: 'fungal', omen: 1, phrases: [
    'a fungal grove aglow with soft, sickly phosphorescence',
    'a spore-choked chamber where pale mushrooms crowd every crack',
    'a cavern hung with luminous fungus that pulses faintly as you pass',
    'a rotting hollow furred with mold and creeping, glowing lichen' ] },
  { type: 'collapsed', omen: 1, phrases: [
    'a collapsed corridor opening into a dust-choked vault',
    'a caved-in chamber, half its ceiling now a slope of rubble',
    'a sagging gallery shored with rotten timbers that groan overhead',
    'a broken passage where a rockfall has half-sealed the way on' ] },
  { type: 'kennel', omen: 1, phrases: [
    'a foul kennel strewn with gnawed bones and matted straw',
    'a beast-pen that reeks of musk and old blood',
    'a den littered with the cracked bones of former meals',
    'a lair whose floor is a filth of hide, bone, and dung' ] },
  { type: 'treasury', omen: 0, phrases: [
    'a plundered treasury, its strongboxes splintered and empty',
    'a counting-room where a few coins still glint in the dust',
    'a strongroom, its vault door hanging from a single hinge',
    'a reliquary stripped of everything but a lingering smell of incense' ] },
];
const ROOM_DETAILS = [
  'Water drips somewhere in the dark, steady as a heartbeat.',
  'A cold draft carries the smell of rot from further in.',
  'Old bones crunch underfoot.',
  'Something skitters away just beyond the torchlight.',
  'The silence here has a weight to it.',
  'Scratch-marks score the walls at shoulder height.',
  'A guttering phosphorescence clings to the stones.',
  'The air is close and tastes of iron.',
  'Faint, half-heard whispers fade the moment you listen.',
  'Dust lies thick and undisturbed — until now.',
  'A dark stain spreads across the flagstones.',
  'The far corners refuse to give up their shadows.',
];
// Backward-compat pool (a flat list some callers/tests still reference).
const ROOM_FLAVORS = ROOM_ARCHETYPES.flatMap(a => a.phrases);

/** Build one room's flavor: an archetype phrasing (+ ~55% a sensory detail).
 *  Deeper rooms lean toward the ominous archetypes (crypt/prison/flooded…). */
function roomFlavor(roll = Math.random, depth = 0) {
  const omenBias = Math.min(2, Math.floor(depth / 4));   // depth 8+ → the grim ones weight in
  const pool = ROOM_ARCHETYPES.filter(a => a.omen <= 1 + omenBias);
  const arch = pool[Math.floor(roll() * pool.length)] || ROOM_ARCHETYPES[0];
  let flavor = arch.phrases[Math.floor(roll() * arch.phrases.length)];
  if (roll() < 0.55) flavor += '. ' + ROOM_DETAILS[Math.floor(roll() * ROOM_DETAILS.length)].replace(/\.$/, '');
  return flavor;
}

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
    flavor: roomFlavor(roll, 0),
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
    type: t.type || null, fort: t.fort || 0, reflex: t.reflex || 0,
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
  return { flavor: roomFlavor(roll, depth), enemies, reward: { gp }, tier, budget };
}

/** MON-bestiary room: same CR/XP budget engine, drawing from poker's bestiary.
 *  Returns { flavor, monKeys, reward, tier } — the caller builds combatants via
 *  shim._makeEnemy. Vetted-by-provenance (the proven poker engine runs them). */
const STEALTH_OVERRIDES = { giant_spider: 19, ghoul: 13, shadow: 18, wight: 13 };
function generateMonRoom(partySize, apl, depth, MON, xpForCR, roll = Math.random, MON_GANGS = {}) {
  partySize = Math.max(1, partySize || 1); apl = Math.max(1, apl || 1); depth = depth || 0;
  // DIFFICULTY = PARTY CAPABILITY, NOT DEPTH (Tobias 2026-07-12: never throw
  // foes the party can't handle, even if a big party levels slowly). Foe CR is
  // capped to the party's level; a large party (action economy) handles a
  // slightly higher cap. Depth adds VARIETY/quantity + XP, never raw lethality.
  const effApl = apl + (partySize >= 5 ? 1 : 0);
  const maxCr = Math.max(1, effApl + 1);
  const cands = Object.keys(MON).filter(k => (MON[k].crNum || 99) <= maxCr && !MON[k].boss);
  const tier = pickTier(depth, roll);
  // Budget sizes the fight to party + level (bigger party → more foes), NOT
  // depth — so a level-1 party faces level-1 fights at depth 1 or 20.
  const budget = Math.max(50, Math.round(BASE_XP[tier] * (partySize / 4) * apl));
  const monKeys = [];
  // GANG THEMING (poker): the first pick sets the room's gang; the rest fill
  // from the same gang (unlisted creatures are wildcards). Multi-gang monsters
  // anchor ONE of their gangs at random. If the gang can't fill, fall back.
  let gang = null;
  const inGang = (k) => { if (!gang) return true; const g = MON_GANGS[k]; return !g || g.includes(gang); };
  let remaining = budget, guard = 0;
  while (guard++ < 12 && monKeys.length < 6) {
    const affordAll = cands.filter(k => xpForCR(MON[k].crNum || 0.25) <= remaining * 1.25);
    const afford = affordAll.filter(inGang).length ? affordAll.filter(inGang) : affordAll;
    if (!afford.length) break;
    const k = afford[Math.floor(roll() * afford.length)];
    monKeys.push(k);
    if (!gang) { const g = MON_GANGS[k]; if (g && g.length) gang = g[Math.floor(roll() * g.length)]; }
    remaining -= xpForCR(MON[k].crNum || 0.25);
    if (remaining < 40) break;
  }
  if (!monKeys.length) monKeys.push(cands.sort((a, b) => (MON[a].crNum || 9) - (MON[b].crNum || 9))[0] || 'goblin');
  const spent = monKeys.reduce((s2, k) => s2 + xpForCR(MON[k].crNum || 0.25), 0);
  const gp = Math.round(spent / 12) + rollDice(2, 6, roll);
  return { flavor: roomFlavor(roll, depth), monKeys, reward: { gp }, tier, budget };
}

module.exports = { generateRoom, generatePartyRoom, generateMonRoom, STEALTH_OVERRIDES, ROOM_FLAVORS, ROOM_ARCHETYPES, roomFlavor };
