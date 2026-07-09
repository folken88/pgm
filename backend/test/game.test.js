const { test } = require('node:test');
const assert = require('node:assert');
const { seededRoller } = require('../src/dice');
const game = require('../src/game');

test('startRun produces an in_combat run with a room, creature, and choices', () => {
  const { run, events, choices, status } = game.startRun(
    { name: 'Test', race: 'human', cls: 'fighter' }, seededRoller(3));
  assert.strictEqual(status, 'in_combat');
  assert.ok(run.room.creature.hp > 0, 'creature has hp');
  assert.ok(events.length >= 1 && /enter/i.test(events[0].text), 'narrates room entry');
  assert.ok(choices.some(c => c.id === 'attack'), 'offers attack');
});

test('attacking repeatedly resolves the fight to a terminal state', () => {
  const roll = seededRoller(11);
  let state = game.startRun({ name: 'Kara', race: 'half-orc', cls: 'fighter' }, roll);
  let guard = 0;
  while (state.status === 'in_combat' && guard++ < 200) {
    state = game.applyAction(state.run, 'attack', roll);
  }
  assert.ok(['cleared', 'dead'].includes(state.status), `ended in terminal state, got ${state.status}`);
  assert.ok(state.events.length >= 1);
});

test('a strong hero vs weak seed clears the room and gains gold', () => {
  // Search seeds for a clear (fighter should win most); assert the cleared path works.
  let cleared = null;
  for (let s = 1; s <= 50 && !cleared; s++) {
    const roll = seededRoller(s);
    let state = game.startRun({ name: 'Bron', race: 'half-orc', cls: 'barbarian' }, roll);
    let guard = 0;
    while (state.status === 'in_combat' && guard++ < 200) state = game.applyAction(state.run, 'attack', roll);
    if (state.status === 'cleared') cleared = state;
  }
  assert.ok(cleared, 'at least one seed yields a cleared room');
  assert.ok(cleared.run.gold > 0, 'gold awarded on clear');
  const snap = game.snapshot(cleared.run);
  assert.strictEqual(snap.status, 'cleared');
  assert.ok(snap.choices.some(c => c.id === 'continue'), 'can descend deeper');
});

test('status/look are answerable mid-combat without ending the fight', () => {
  const roll = seededRoller(5);
  const start = game.startRun({ name: 'Ivy', race: 'elf', cls: 'wizard' }, roll);
  const s1 = game.applyAction(start.run, 'status', roll);
  assert.strictEqual(s1.status, 'in_combat', 'checking status does not end combat');
  assert.ok(/wizard/i.test(s1.events[0].text));
  const s2 = game.applyAction(start.run, 'look', roll);
  assert.ok(/health|stands|room/i.test(s2.events[0].text));
});
