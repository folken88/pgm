/**
 * AI auto-claims relevant party loot (Tobias 2026-07-13: "if relevant items —
 * like a restoration component for a cleric — become party treasure, the AI
 * should take it if no human does by the next round start"). The party clears a
 * room, treasure lands in the pile; humans have the between-rooms window (and
 * round 1) to claim; by the next fight's start / round 2 an AI companion sweeps
 * role-relevant leftovers. Irrelevant loot (gems the leader may divvy) is left.
 */
const { test } = require('node:test');
const assert = require('node:assert');
const pr = require('../src/partyrun');
const { createCharacter } = require('../src/characters');
const { seededRoller } = require('../src/dice');

// Build a party but DON'T roll initiative yet — lets us seed the pile first,
// mimicking treasure that arrived from the previous room.
function party(seed) {
  const roll = seededRoller(seed);
  const run = pr.createPartyRun([
    { clientId: 'c1', icon: 'X', character: createCharacter({ name: 'Fig', race: 'human', cls: 'fighter' }), ai: false },
    { clientId: 'ai1', icon: 'Y', character: createCharacter({ name: 'Cler', race: 'human', cls: 'cleric' }), ai: true },
  ], roll);
  return { run, roll };
}

test('an AI cleric claims a Restoration component no human took by the next fight', () => {
  const { run, roll } = party(3);
  run.inventory.push({ key: 'diamond_dust', qty: 1, party: true });   // Restoration reagent in the pile
  const cleric = run.heroes.find(h => h.ai);
  assert.ok(!(cleric.pack || []).some(s => s.key === 'diamond_dust'), 'cleric starts without it');
  pr.applyAction(run, 'c1', { type: 'initiative' }, roll);   // next fight begins → AI sweeps
  assert.ok(!run.inventory.some(s => s.key === 'diamond_dust'), 'the component left the pile');
  assert.ok((cleric.pack || []).some(s => s.key === 'diamond_dust'), 'the AI cleric claimed it');
});

test('the AI does NOT claim irrelevant loot (a gem the leader may divvy)', () => {
  const { run, roll } = party(4);
  run.inventory.push({ key: 'gem_emerald', qty: 1, party: true });   // 1000gp gem — not role-relevant
  pr.applyAction(run, 'c1', { type: 'initiative' }, roll);
  assert.ok(run.inventory.some(s => s.key === 'gem_emerald'), 'the gem stays in the pile for the party to divide');
});

test('a human who already took the item leaves nothing for the AI', () => {
  const { run, roll } = party(5);
  run.inventory.push({ key: 'diamond_dust', qty: 1, party: true });
  // the human leader takes it first (party-flagged → take-at-will)
  const r = pr.applyAction(run, 'c1', { type: 'loot_take', item: 'diamond_dust' }, roll);
  assert.ok(r.ok, r.error);
  const cleric = run.heroes.find(h => h.ai);
  pr.applyAction(run, 'c1', { type: 'initiative' }, roll);
  assert.ok(!(cleric.pack || []).some(s => s.key === 'diamond_dust'), 'AI does not claim what the human already took');
});
