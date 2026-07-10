/**
 * Shim convergence harness — exercises poker's transplanted ability engine
 * against a PGM run and reports every failure, grouped, so the shim gets built
 * out gap-by-gap. Run: node scripts/shim-harness.js
 */
const { seededRoller } = require('../backend/src/dice');
const { createCharacter } = require('../backend/src/characters');
const pr = require('../backend/src/partyrun');
const pf1 = require('../backend/src/pf1core');

let DungeonShim;
try { ({ DungeonShim } = require('../backend/src/pokerdungeon/shim')); }
catch (e) { console.error('SHIM FAILED TO LOAD:\n', e.stack); process.exit(1); }

const CLASSES = ['wizard', 'cleric', 'sorcerer', 'bard', 'druid', 'inquisitor', 'oracle', 'magus', 'paladin', 'rogue', 'fighter', 'barbarian', 'theurge', 'witch'];
const roll = seededRoller(42);

const failures = new Map();   // message -> [class:key,...]
let tried = 0, ok = 0;

for (const cls of CLASSES) {
  // Fresh run per class: 1 caster of the class + a fighter, vs whatever spawns.
  const party = [
    { clientId: 'c1', icon: '🧪', character: createCharacter({ name: 'Probe', race: 'human', cls }) },
    { clientId: 'c2', icon: '🛡️', character: createCharacter({ name: 'Wall', race: 'dwarf', cls: 'fighter' }) },
  ];
  let run;
  try { run = pr.createPartyRun(party, roll); } catch (e) { note('createPartyRun: ' + e.message, cls); continue; }
  const shim = new DungeonShim(run);
  const m = run.heroes[0];
  // Poker member aliases + resource shape the engine expects.
  m.playerId = m.name.toLowerCase(); m.nickname = m.name; m.left = false;
  m.abilityScores = m.character.derived.scores; m.abilityUses = m.roomUses; m.runAbilityUses = m.runUses || {};
  m.spellPool = (m.level || 1) * 4; m.gear = {}; m.weaponKey = 'dagger'; m.weapon = m.character.weapon;
  m.kitAbilityState = {};
  run.combatants.filter(c => c.side === 'enemy').forEach((e, i) => { e.uid = e.id; e.glyph = '👹'; e.revealed = true; });

  let kit;
  try { kit = shim._abilitiesFor(m); } catch (e) { note('_abilitiesFor: ' + firstLine(e), cls); continue; }
  (kit || []).forEach((ab, slot) => {
    tried++;
    try {
      shim._useAbility(m, slot, { targetUid: (shim._targetableEnemies()[0] || {}).uid });
      ok++;
    } catch (e) { note(firstLine(e), cls + ':' + (ab.key || slot)); }
  });
}

function firstLine(e) { return String(e && e.stack || e).split('\n').slice(0, 2).join(' | '); }
function note(msg, where) { if (!failures.has(msg)) failures.set(msg, []); failures.get(msg).push(where); }

console.log(`\n=== SHIM HARNESS: ${ok}/${tried} abilities resolved ===\n`);
const sorted = [...failures.entries()].sort((a, b) => b[1].length - a[1].length);
for (const [msg, where] of sorted.slice(0, 25)) {
  console.log(`[${where.length}×] ${msg}\n    e.g. ${where.slice(0, 4).join(', ')}\n`);
}
if (sorted.length > 25) console.log(`(+${sorted.length - 25} more failure kinds)`);

// ── Phase 2: AI-driven FIGHT SIM — drives _allyAct/_enemyAct until terminal ──
console.log('\n=== FIGHT SIM (poker AI brains) ===');
const simFails = new Map();
let fights = 0, finished = 0;
for (const cls of ['wizard', 'cleric', 'rogue', 'barbarian', 'bard', 'magus', 'paladin', 'druid']) {
  const party = [
    { clientId: 'a1', ai: true, icon: '🧪', character: createCharacter({ name: 'Bot' + cls, race: 'human', cls }) },
    { clientId: 'a2', ai: true, icon: '🛡️', character: createCharacter({ name: 'Tank', race: 'dwarf', cls: 'fighter' }) },
  ];
  let run;
  try { run = pr.createPartyRun(party, roll); } catch (e) { simNote('createPartyRun: ' + firstLine(e), cls); continue; }
  const shim = new DungeonShim(run);
  run.heroes.forEach(m => {
    m.playerId = m.name.toLowerCase(); m.nickname = m.name; m.left = false; m.isBot = true;
    m.abilityScores = m.character.derived.scores; m.abilityUses = m.roomUses; m.runAbilityUses = m.runUses || {};
    m.spellPool = (m.level || 1) * 4; m.gear = {}; m.weaponKey = 'dagger'; m.weapon = m.character.weapon;
  });
  run.combatants.filter(c => c.side === 'enemy').forEach(e => { e.uid = e.id; e.glyph = '👹'; e.revealed = true; e.toHit = e.creature.attack; });
  fights++;
  let guard = 0, dead = false;
  while (guard++ < 60 && !dead) {
    const foes = run.combatants.filter(c => c.side === 'enemy' && c.hp > 0);
    const heroes = run.combatants.filter(c => c.side === 'hero' && c.hp > 0 && !c.down);
    if (!foes.length || !heroes.length) { finished++; break; }
    for (const m of heroes) { try { shim._allyAct(m); } catch (e) { simNote('_allyAct: ' + firstLine(e), cls); dead = true; break; } }
    for (const e of run.combatants.filter(c => c.side === 'enemy' && c.hp > 0)) {
      try { shim._enemyAct(e); } catch (err) { simNote('_enemyAct: ' + firstLine(err), cls); dead = true; break; }
    }
  }
}
function simNote(msg, where) { if (!simFails.has(msg)) simFails.set(msg, []); simFails.get(msg).push(where); }
console.log(`fights finished cleanly: ${finished}/${fights}`);
for (const [msg, where] of [...simFails.entries()].sort((a, b) => b[1].length - a[1].length).slice(0, 15)) {
  console.log(`[${where.length}×] ${msg}\n    e.g. ${where.slice(0, 4).join(', ')}\n`);
}
