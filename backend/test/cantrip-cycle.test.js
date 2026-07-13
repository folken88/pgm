/**
 * Cantrip cycling (Tobias 2026-07-13: "as sorcerer when I change my cantrip, the
 * icon and name don't change"). Two coupled bugs, both fixed in partyrun.js:
 *  1. The at-will button surfaced the STATIC base kit name/icon, ignoring the
 *     player's selection → cycling never changed the display.
 *  2. The human at-will CAST passed the base kd.atwill to _abCantrip, so it always
 *     fired the BASE element regardless of the cycle. Now it resolves the live
 *     element via _activeCantrip (poker parity — matches how bots pick).
 * The button KEY stays the base at-will key so the cast handler still matches.
 */
const { test } = require('node:test');
const assert = require('node:assert');
const pr = require('../src/partyrun');
const { createCharacter } = require('../src/characters');
const { seededRoller } = require('../src/dice');
const pf1 = require('../src/pf1core');

function sorcererRun(seed) {
  const roll = seededRoller(seed);
  const run = pr.createPartyRun([{ clientId: 'c1', icon: 'X', character: createCharacter({ name: 'S', race: 'human', cls: 'sorcerer' }) }], roll);
  pr.applyAction(run, 'c1', { type: 'initiative' }, roll);
  const cb = run.combatants.find(c => c.ownerClientId === 'c1');
  const onTurn = () => { run.turnIndex = run.combatants.indexOf(cb); run.phase = 'combat'; };
  return { run, cb, roll, onTurn };
}
function atwill(run, onTurn) { onTurn(); const p = pr.publicRun(run); return p.turn && p.turn.kit && p.turn.kit.atwill; }

test('cycling a cantrip changes the surfaced name + icon (key stays the base at-will)', () => {
  const { run, roll, onTurn } = sorcererRun(3);
  const baseKey = atwill(run, onTurn).key;
  const seen = new Set();
  for (let i = 0; i < 4; i++) {
    pr.applyAction(run, 'c1', { type: 'cantrip' }, roll);
    const aw = atwill(run, onTurn);
    seen.add(aw.name + '|' + aw.icon);
    assert.strictEqual(aw.key, baseKey, 'button key stays the base at-will key so the cast handler matches');
    assert.ok(aw.name && aw.icon, 'name and icon are present');
  }
  assert.ok(seen.size >= 2, 'cycling surfaced more than one distinct name/icon, got: ' + [...seen].join(', '));
});

test('the human at-will cast fires the SELECTED element, not the base', () => {
  const { run, roll, onTurn } = sorcererRun(9);
  const cb = run.combatants.find(c => c.ownerClientId === 'c1');
  const foe = run.shim._makeEnemyPGM(pf1.monsters.MON['goblin']);
  foe.key = 'goblin'; foe.revealed = true; foe.hp = 500; foe.maxHp = 500; run.combatants.push(foe);
  const kd = pf1.abilities.kitFor('sorcerer');
  const cast = () => {
    onTurn();
    const before = run.log.length;
    pr.applyAction(run, 'c1', { type: 'cast', spell: kd.atwill.key, target: foe.id }, roll);
    return run.log.slice(before).map(e => e.text).join(' | ');
  };
  pr.applyAction(run, 'c1', { type: 'cantrip', spell: 'acidsplash' }, roll);
  assert.match(cast(), /Acid Splash/, 'selecting Acid Splash fires Acid Splash');
  pr.applyAction(run, 'c1', { type: 'cantrip', spell: 'jolt' }, roll);
  assert.match(cast(), /Jolt/, 'selecting Jolt fires Jolt');
});
