/**
 * THE QUIET ROOM (Tobias 2026-07-16): when every foe is stealthed and nobody
 * perceived a thing, the room reads as EMPTY — no "something lurks" tell. The
 * party may SEARCH (one sweep: flush the ambush, or pocket the treasure), rest,
 * or press on — and unfound lurkers FOLLOW them into the next room's fight.
 */
const { test } = require('node:test');
const assert = require('node:assert');
const pr = require('../src/partyrun');
const { createCharacter } = require('../src/characters');
const { seededRoller } = require('../src/dice');

// perceptionMod −100 → a d20 can never reach DC 10 (all foes stay hidden);
// +100 → every roll spots everything.
function quietRun(seed) {
  const roll = seededRoller(seed);
  const ch = createCharacter({ name: 'Scout', race: 'human', cls: 'fighter' });
  const run = pr.createPartyRun([{ clientId: 'c1', icon: 'X', character: ch }], roll);
  run.heroes[0].perceptionMod = -100;
  pr.spawnRoom(run, roll);
  return { run, roll };
}

test('an all-hidden room reads as EMPTY — cleared phase, no lurk tell, no fight', () => {
  const { run } = quietRun(7);
  assert.strictEqual(run.phase, 'cleared', 'no combat starts');
  assert.ok(run._seemsEmpty, 'flagged seems-empty');
  assert.ok(run._lurkers && run._lurkers.length >= 1, 'the lurkers are stored off-board');
  assert.strictEqual(run.combatants.filter(c => c.side === 'enemy').length, 0, 'no enemies on the board');
  const text = run.log.map(e => e.text).join(' | ');
  assert.ok(/The room seems empty/.test(text), 'GM says the room seems empty');
  assert.ok(!/lurks here — be ready/.test(text), 'NO ambush tell');
  assert.ok(pr.publicRun(run, 'c1').seemsEmpty, 'exposed to the client');
});

test('a failed search finds the treasure; the sweep is once-only', () => {
  const { run, roll } = quietRun(7);
  const gold0 = run.gold;
  const r = pr.applyAction(run, 'c1', { type: 'search' }, roll);   // perception still −100 → never spots
  assert.ok(r.ok && r.found, 'search succeeds and finds the hoard');
  assert.ok(run.gold >= gold0, 'coins banked');
  assert.ok(/You search the room/.test(run.log.map(e => e.text).join(' | ')));
  assert.strictEqual(run.phase, 'cleared', 'still out of combat');
  const again = pr.applyAction(run, 'c1', { type: 'search' }, roll);
  assert.ok(!again.ok, 'one deliberate sweep only');
});

test('a sharp-eyed search FLUSHES the ambush into a real fight', () => {
  const { run, roll } = quietRun(7);
  const depth0 = run.roomsCleared;
  run.heroes[0].perceptionMod = 100;   // now the sweep spots everything
  const r = pr.applyAction(run, 'c1', { type: 'search' }, roll);
  assert.ok(r.ok && r.ambush, 'the ambush is flushed');
  assert.strictEqual(run.phase, 'initiative', 'the fight the room owed them');
  assert.ok(run.combatants.some(c => c.side === 'enemy' && c.revealed), 'flushed foes are revealed');
  assert.strictEqual(run.roomsCleared, depth0, 'the room was never counted as passed — the real clear counts it exactly once');
  assert.ok(/flushes an AMBUSH/.test(run.log.map(e => e.text).join(' | ')));
});

test('unfound lurkers FOLLOW the party into the next room', () => {
  const { run, roll } = quietRun(7);
  const stalkerIds = run._lurkers.map(e => e.id);
  run.heroes[0].perceptionMod = 100;   // in the NEXT room they spot everything — including the tail
  pr.applyAction(run, 'c1', { type: 'descend' }, roll);
  const foes = run.combatants.filter(c => c.side === 'enemy');
  assert.ok(stalkerIds.every(id => foes.some(f => f.id === id)), 'the stalkers joined the new fight');
  assert.ok(foes.length > stalkerIds.length, "…alongside the new room's own foes");
  assert.ok(!run._lurkers, 'the lurker pocket is consumed');
  assert.ok(run.phase === 'initiative' || run.phase === 'combat', 'a fight starts');
});

test('search is refused in a normally-cleared room (treasure already awarded)', () => {
  const roll = seededRoller(3);
  const ch = createCharacter({ name: 'S', race: 'human', cls: 'fighter' });
  const run = pr.createPartyRun([{ clientId: 'c1', icon: 'X', character: ch }], roll);
  run.phase = 'cleared';   // a real clear — no seems-empty flag
  const r = pr.applyAction(run, 'c1', { type: 'search' }, roll);
  assert.ok(!r.ok, 'nothing to search after a true clear');
});
