const { test } = require('node:test');
const assert = require('node:assert');
const { seededRoller } = require('../src/dice');
const { createCharacter } = require('../src/characters');
const pr = require('../src/partyrun');

// Initiative is now the PLAYERS' roll (Tobias 2026-07-11): tests roll it
// immediately after run creation / each descend so combat proceeds as before.
function rollInit(run, roll) {
  if (run.phase !== 'initiative') return;
  const human = run.heroes.find(h => h.ownerClientId);
  require('../src/partyrun').applyAction(run, human && human.ownerClientId, { type: 'initiative' }, roll);
}


test('Summon Undead I raises a minion on the caster initiative that fights for the party', () => {
  const roll = seededRoller(7);
  const run = pr.createPartyRun([
    { clientId: 'c1', icon: '🧙', character: require('../src/cast').buildCompanion('Draymus').character },
  ], roll);
  const wiz = run.heroes[0];
  const foe = run.combatants.find(c => c.side === 'enemy');
  foe.revealed = true; foe.hp = 40; foe.maxHp = 40;    // durable target
  run.turnIndex = run.combatants.indexOf(wiz); run.phase = 'combat';
  const before = run.combatants.length;
  const r = pr.applyAction(run, 'c1', { type: 'cast', spell: 'summonundead1' }, roll);
  assert.ok(r.ok, 'summon cast resolved: ' + (r.error || ''));
  const minion = run.combatants.find(c => c.summoned);
  assert.ok(minion, 'a summoned minion joined: ' + run.log.map(e => e.text).slice(-3).join(' | '));
  assert.ok(run.combatants.length > before, 'combatant added');
  assert.ok(run.combatants.indexOf(minion) === run.combatants.indexOf(wiz) + 1, 'spliced right after the caster');
  assert.ok(run.log.some(e => /rise|fight for the party/i.test(e.text)), 'summon narrated');
  // Play a few turns: the minion should attack the foe (or at least tick expiry).
  let guard = 0;
  const startExpiry = minion.summonExpiry;
  while (guard++ < 4 && run.phase === 'combat') {
    const v = pr.publicRun(run); if (!v.turn) break;
    pr.applyAction(run, v.turn.ownerClientId, { type: 'pass' }, roll);
  }
  assert.ok(minion.summonExpiry < startExpiry || minion.down || run.phase !== 'combat', 'minion turns ticked');
  assert.ok(run.log.some(e => /(rends|claws at)/i.test(e.text)) || run.phase !== 'combat', 'minion acted: ' + run.log.map(e => e.text).slice(-5).join(' | '));
});

test('summons never block room-clear and crumble when the room clears', () => {
  const roll = seededRoller(3);
  const run = pr.createPartyRun([
    { clientId: 'c1', icon: '🧙', character: require('../src/cast').buildCompanion('Draymus').character },
  ], roll);
  const wiz = run.heroes[0];
  run.turnIndex = run.combatants.indexOf(wiz); run.phase = 'combat';
  pr.applyAction(run, 'c1', { type: 'cast', spell: 'summonundead1' }, roll);
  // Kill all real foes directly.
  run.combatants.filter(c => c.side === 'enemy' && !c.summoned).forEach(e => { e.hp = 0; });
  run.turnIndex = run.combatants.indexOf(wiz); run.phase = 'combat';
  pr.applyAction(run, 'c1', { type: 'pass' }, roll);
  assert.strictEqual(run.phase, 'cleared', 'room cleared despite the living summon');
  const minion = run.combatants.find(c => c.summoned);
  if (minion) assert.ok(minion.down, 'summon crumbled at room end');
});

test('every 5th room is a BOSS room: advanced foe with Boss: prefix and fatter stats', () => {
  const { seededRoller: sr } = require('../src/dice');
  const { createCharacter: cc } = require('../src/characters');
  const roll = sr(12);
  const run = pr.createPartyRun([{ clientId: 'c1', icon: '🛡️', character: cc({ name: 'Kara', race: 'human', cls: 'fighter' }) }], roll); rollInit(run, roll);
  // Fast-forward: clear 4 rooms by fiat, then descend into room 5.
  for (let i = 0; i < 4; i++) {
    run.combatants.filter(c => c.side === 'enemy' && !c.summoned).forEach(e => { e.hp = 0; });
    run.turnIndex = run.combatants.indexOf(run.heroes[0]); run.phase = 'combat';
    pr.applyAction(run, 'c1', { type: 'pass' }, roll);           // clears
    if (i < 3) pr.applyAction(run, 'c1', { type: 'descend' }, roll);
  }
  pr.applyAction(run, 'c1', { type: 'descend' }, roll);          // into room 5
  const boss = run.combatants.find(c => c.side === 'enemy' && /^Boss:/.test(c.name));
  assert.ok(boss, 'a Boss-prefixed foe in room 5: ' + run.combatants.filter(c => c.side === 'enemy').map(c => c.name).join(', '));
  assert.ok(boss.bossLevels >= 2 && boss.bossLevels <= 4, 'advanced 2-4 levels: ' + boss.bossLevels);
  assert.ok(boss.hp > 0 && boss.toHit >= 2, 'advanced stats');
});
