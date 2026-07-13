/**
 * AI/enemy turn pacing (Tobias 2026-07-13: "each needs a 1-2 second delay to
 * give the appearance of deliberation"). Live runs set run.onUpdate → partyrun
 * defers each AI/enemy turn behind a setTimeout and streams it via SSE. Tests
 * without onUpdate keep the synchronous batch (covered by every other test).
 */
const { test, mock } = require('node:test');
const assert = require('node:assert');
const pr = require('../src/partyrun');
const { createCharacter } = require('../src/characters');
const { seededRoller } = require('../src/dice');

test('paced mode DEFERS the next enemy turn behind a timer, then resolves it on fire', () => {
  mock.timers.enable({ apis: ['setTimeout'] });
  try {
    const roll = seededRoller(2);
    const run = pr.createPartyRun([{ clientId: 'c1', icon: 'X', character: createCharacter({ name: 'T', race: 'human', cls: 'fighter' }) }], roll);
    let updates = 0;
    run.onUpdate = () => { updates++; };            // ← flips partyrun into paced mode
    pr.applyAction(run, 'c1', { type: 'initiative' }, roll);

    // Arrange a clean human→enemy hand-off: hero acts, an enemy is up next.
    const hero = run.heroes[0];
    const enemy = run.combatants.find(c => c.side === 'enemy' && c.hp > 0);
    enemy.revealed = true;
    run.combatants = [hero, enemy].concat(run.combatants.filter(c => c !== hero && c !== enemy));
    run.turnIndex = 0; run.phase = 'combat';
    hero.hp = 80; hero.maxHp = 80;

    const logBefore = run.log.length;
    pr.applyAction(run, 'c1', { type: 'pass' }, roll);   // hero holds → nextTurn → enemy is up

    // The enemy has NOT acted yet — it's deferred behind the deliberation timer.
    assert.ok(run.paceTimer, 'a pace timer is pending for the enemy turn');
    const logAfterPass = run.log.length;

    // Fire the delay: now the enemy resolves and a fresh SSE update is pushed.
    const updatesBefore = updates;
    mock.timers.tick(2100);
    assert.ok(run.log.length > logAfterPass, 'the enemy acted only after the delay elapsed');
    assert.ok(updates > updatesBefore, 'a state update (SSE broadcast) fired when the enemy acted');
  } finally {
    mock.timers.reset();
  }
});

test('without onUpdate (tests/headless) turns still resolve synchronously', () => {
  const roll = seededRoller(2);
  const run = pr.createPartyRun([{ clientId: 'c1', icon: 'X', character: createCharacter({ name: 'T', race: 'human', cls: 'fighter' }) }], roll);
  pr.applyAction(run, 'c1', { type: 'initiative' }, roll);
  // No timers involved: after initiative it is synchronously a human's turn or the room resolved.
  assert.ok(!run.paceTimer, 'no pace timer is used in synchronous mode');
  assert.ok(run.phase === 'combat' || run.phase === 'cleared' || run.phase === 'exploring', 'resolved synchronously');
});
