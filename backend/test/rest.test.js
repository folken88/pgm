/**
 * REST between rooms (Tobias 2026-07-14): the party can make camp in a cleared
 * room. A night's sleep heals everyone (to FULL if a healer is along — they expend
 * the day's remaining cures on the wounded), and the campfire draws a deadlier next
 * room (+1 CR). Once per cleared room; consumed on descend.
 */
const { test } = require('node:test');
const assert = require('node:assert');
const pr = require('../src/partyrun');
const { createCharacter } = require('../src/characters');
const { seededRoller } = require('../src/dice');

function clearedRun(clsList) {
  const roll = seededRoller(11);
  const members = clsList.map((cls, i) => ({ clientId: 'c' + i, icon: 'X', character: createCharacter({ name: cls, race: 'human', cls }) }));
  const run = pr.createPartyRun(members, roll);
  run.phase = 'cleared';
  return { run, roll };
}

test('a healer along heals the party to FULL at camp', () => {
  const { run, roll } = clearedRun(['cleric', 'fighter']);
  run.heroes[0].hp = 3; run.heroes[1].hp = 5;
  const r = pr.applyAction(run, 'c0', { type: 'rest' }, roll);
  assert.ok(r.ok, 'rest succeeds');
  assert.strictEqual(run.heroes[0].hp, run.heroes[0].maxHp, 'cleric to full');
  assert.strictEqual(run.heroes[1].hp, run.heroes[1].maxHp, 'fighter to full');
});

test('with no healer, camp heals a chunk but not to full', () => {
  const { run, roll } = clearedRun(['fighter']);
  const h = run.heroes[0];
  h.hp = 2;
  pr.applyAction(run, 'c0', { type: 'rest' }, roll);
  assert.ok(h.hp > 2 && h.hp < h.maxHp, 'healed but not to full');
  assert.ok(h.hp - 2 >= Math.floor(h.maxHp * 0.4), 'roughly a half-max-HP night of rest');
});

test('resting sets +1 CR for the next room and is once-per-room', () => {
  const { run, roll } = clearedRun(['cleric']);
  run.heroes[0].hp = 1;
  pr.applyAction(run, 'c0', { type: 'rest' }, roll);
  assert.strictEqual(run._restCR, 1, '+1 CR queued');
  assert.ok(pr.publicRun(run, 'c0').rested, 'exposed as rested');
  const again = pr.applyAction(run, 'c0', { type: 'rest' }, roll);
  assert.ok(!again.ok, 'cannot rest twice in the same cleared room');
});

test('descending consumes the rest CR bump and clears the rested flag', () => {
  const { run, roll } = clearedRun(['cleric']);
  pr.applyAction(run, 'c0', { type: 'rest' }, roll);
  assert.strictEqual(run._restCR, 1);
  pr.applyAction(run, 'c0', { type: 'descend' }, roll);
  assert.strictEqual(run._restCR, 0, 'CR bump consumed by the next room');
  assert.ok(!run._rested, 'rested flag cleared for the new room');
});

test('a non-member cannot make the party rest', () => {
  const { run, roll } = clearedRun(['cleric']);
  const r = pr.applyAction(run, 'stranger', { type: 'rest' }, roll);
  assert.ok(!r.ok, 'only a party member rests');
});
