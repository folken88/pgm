/**
 * Poker-parity port (2026-07-14): the two "seeing the unseen" spells.
 *
 * SEE INVISIBILITY (2nd) — beats the INVISIBILITY concealment miss, but NOT an
 *   illusion. Mirror Image / Displacement still fool it (RAW: glamers). Only
 *   True Seeing / blindsense pierce those. The two guards in swing.js diverge.
 *
 * INVISIBILITY PURGE (3rd) — reveals EVERY invisible creature in the room,
 *   ALLIES INCLUDED, and locks out re-vanishing for the rest of the room
 *   (room flag `shim.invisPurged` + per-foe `_invisPurged`). Cleared at the
 *   next door — PGM's shim outlives the room, so spawnRoom has to reset it.
 *
 * The handlers arrived in an earlier sync but the SPELL DATA never did, so both
 * spells were uncastable and the room flag was never set or read. This guards that.
 */
const { test } = require('node:test');
const assert = require('node:assert');
const pr = require('../src/partyrun');
const { createCharacter } = require('../src/characters');
const { seededRoller } = require('../src/dice');
const pf1 = require('../src/pf1core');
const { SPELL, KITS } = pf1.abilities;

// ---------- the spells exist and carry the right flags ----------

test('See Invisibility is a 2nd-level self buff that sets seeInvis and lasts the room', () => {
  const s = SPELL.seeinvisibility;
  assert.ok(s, 'See Invisibility is missing from the SPELL table');
  assert.strictEqual(s.slvl, 2);
  assert.strictEqual(s.effect, 'buff');
  assert.strictEqual(s.target, 'self');
  assert.strictEqual(s.seeInvis, true, 'must set the seeInvis flag swing.js reads');
  assert.strictEqual(s.sticky, true, 'lasts the room');
  assert.notStrictEqual(s.trueSeeing, true, 'it must NOT grant True Seeing (no illusion pierce)');
});

test('Invisibility Purge is a 3rd-level spell that runs the invispurge effect', () => {
  const s = SPELL.invisibilitypurge;
  assert.ok(s, 'Invisibility Purge is missing from the SPELL table');
  assert.strictEqual(s.slvl, 3);
  assert.strictEqual(s.effect, 'invispurge', 'must route to _abInvisPurge');
});

test('the casters who should get them, do — at poker’s levels', () => {
  const has = (cls, key) => KITS[cls].abilities.some(a => a.key === key);
  for (const cls of ['wizard', 'sorcerer', 'magus', 'inquisitor', 'bard']) {
    assert.ok(has(cls, 'seeinvisibility'), `${cls} should know See Invisibility`);
  }
  for (const cls of ['cleric', 'inquisitor']) {
    assert.ok(has(cls, 'invisibilitypurge'), `${cls} should know Invisibility Purge`);
  }
  // A dead spell is one nothing can cast — that was the bug.
  assert.ok(!has('fighter', 'seeinvisibility'), 'the fighter is not a caster');
});

// ---------- the concealment guards actually diverge ----------

function staged(cls, seed) {
  const roll = seededRoller(seed);
  const run = pr.createPartyRun(
    [{ clientId: 'c1', icon: 'X', character: createCharacter({ name: 'T', race: 'human', cls }) }],
    roll
  );
  pr.applyAction(run, 'c1', { type: 'initiative' }, roll);
  const hero = run.heroes[0];
  hero.hp = 200; hero.maxHp = 200; hero.level = 10;
  return { run, hero, roll, shim: run.shim };
}

// Swing 200 times and count how often an unseen/illusory foe turns the blow aside.
function missRate(shim, attacker, target, n = 200) {
  let turned = 0;
  for (let i = 0; i < n; i++) {
    const t = Object.assign({}, target);
    // force a clean hit on AC so only the concealment/illusion guards can stop it
    const r = shim._swingVsAC(attacker, -100, t, 0, false);
    if (r && (r.conceal || r.image)) turned++;
  }
  return turned / n;
}

test('See Invisibility beats invisibility concealment, but NOT mirror image', () => {
  const { shim, hero } = staged('wizard', 77);
  const invisFoe = { name: 'Lurker', hp: 100, maxHp: 100, invisible: true, images: 0, ac: 10 };
  const imageFoe = { name: 'Trickster', hp: 100, maxHp: 100, invisible: false, images: 4, ac: 10 };

  // Blind to the unseen: the invisible foe turns roughly half the blows aside.
  hero.seeInvis = false; hero.trueSeeing = false; hero.blindsense = 0;
  assert.ok(missRate(shim, hero, invisFoe) > 0.25, 'without See Invisibility, invisibility should conceal');

  // With See Invisibility: NO concealment miss at all.
  hero.seeInvis = true;
  assert.strictEqual(missRate(shim, hero, invisFoe), 0, 'See Invisibility must remove the concealment miss entirely');

  // …but the ILLUSION still fools it — this is the RAW distinction.
  assert.ok(missRate(shim, hero, imageFoe) > 0.25, 'See Invisibility must NOT pierce mirror images');

  // True Seeing pierces both.
  hero.trueSeeing = true;
  assert.strictEqual(missRate(shim, hero, imageFoe), 0, 'True Seeing must pierce the illusion');
});

// ---------- the purge, and its room-scoped lockout ----------

test('Invisibility Purge reveals foes AND allies, then bars anyone from re-vanishing', () => {
  const { run, shim, hero } = staged('cleric', 5);
  const ally = { nickname: 'Rogue', hp: 40, maxHp: 40, invisible: true, side: 'hero', playerId: 'p2' };
  run.combatants.push(Object.assign(ally, { side: 'hero' }));
  const foe = shim.livingEnemies()[0];
  assert.ok(foe, 'need a foe staged');
  foe.invisible = true;

  shim._abInvisPurge(hero, SPELL.invisibilitypurge);

  assert.strictEqual(foe.invisible, false, 'the hidden foe is dragged into the light');
  assert.strictEqual(foe._invisPurged, true, 'the foe is flagged so it cannot re-hide');
  assert.strictEqual(shim.invisPurged, true, 'the ROOM flag is set (a foe summoned later cannot hide either)');
  assert.strictEqual(ally.invisible, false, 'it does NOT discriminate — your own rogue is burned too');
});

test('a hero cannot cast invisibility into a live purge (the cast is refused, the action kept)', () => {
  const { shim, hero } = staged('wizard', 9);
  hero.level = 10;                                  // high enough that Invisibility is unlocked
  hero.slots = { 1: 4, 2: 4, 3: 4, 4: 4, 5: 4 };    // and actually has the slot to spend
  const kit = shim._abilitiesFor(hero);
  const slot = kit.findIndex(a => a.effect === 'invisible');
  assert.ok(slot >= 0, 'the wizard should have an invisibility spell to refuse');

  shim.invisPurged = true;
  const res = shim._useAbility(hero, slot, {});
  assert.ok(res && res.ok === false, 'the cast must be refused, not silently wasted');
  assert.match(res.error, /purge/i, 'and the refusal must say why');
});

test('the purge burns for its ROOM only — descending clears it', () => {
  const { run, shim, roll } = staged('cleric', 11);
  shim.invisPurged = true;
  run.phase = 'cleared';
  pr.applyAction(run, 'c1', { type: 'descend' }, roll);
  assert.strictEqual(run.shim.invisPurged, false, 'a new room can hide again');
  assert.strictEqual(run.shim.blackTentacles, null, 'the tentacle field does not follow the party downstairs');
});
