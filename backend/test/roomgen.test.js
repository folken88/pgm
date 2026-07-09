const { test } = require('node:test');
const assert = require('node:assert');
const { seededRoller } = require('../src/dice');
const { generatePartyRoom } = require('../src/roomgen');

function totalXp(room) { return room.enemies.reduce((s, e) => s + (e.xp || 0), 0); }
function totalHp(room) { return room.enemies.reduce((s, e) => s + e.maxHp, 0); }

test('every encounter has at least one foe and valid instances', () => {
  for (let s = 1; s <= 40; s++) {
    const room = generatePartyRoom(3, 1, 0, seededRoller(s));
    assert.ok(room.enemies.length >= 1, 'at least one foe');
    room.enemies.forEach(e => { assert.ok(e.maxHp > 0 && e.ac > 0 && e.name); });
  }
});

test('a SOLO level-1 hero faces a light room-1 encounter (not a wipe)', () => {
  let maxXp = 0, maxHp = 0;
  for (let s = 1; s <= 60; s++) {
    const room = generatePartyRoom(1, 1, 0, seededRoller(s));
    maxXp = Math.max(maxXp, totalXp(room));
    maxHp = Math.max(maxHp, totalHp(room));
  }
  // Solo APL-1 room 1: budget caps around one weak foe. Should never be a wall of HP.
  assert.ok(maxXp <= 400, 'solo room-1 XP stays low, got up to ' + maxXp);
  assert.ok(maxHp <= 20, 'solo room-1 total HP is beatable, got up to ' + maxHp);
});

test('a 4-hero party gets a bigger budget than a solo hero', () => {
  function avgXp(size) {
    let t = 0; for (let s = 1; s <= 40; s++) t += totalXp(generatePartyRoom(size, 1, 0, seededRoller(s)));
    return t / 40;
  }
  assert.ok(avgXp(4) > avgXp(1) * 1.5, 'party encounters scale up with size');
});

test('depth ramps difficulty (deeper rooms average tougher)', () => {
  function avgXp(depth) {
    let t = 0; for (let s = 1; s <= 40; s++) t += totalXp(generatePartyRoom(4, 1, depth, seededRoller(s)));
    return t / 40;
  }
  assert.ok(avgXp(8) > avgXp(0), 'depth-8 rooms are tougher than depth-0');
});

test('reward scales with the challenge', () => {
  const easy = generatePartyRoom(1, 1, 0, seededRoller(3));
  const hard = generatePartyRoom(6, 1, 6, seededRoller(3));
  assert.ok(hard.reward.gp >= easy.reward.gp, 'tougher rooms pay better');
});
