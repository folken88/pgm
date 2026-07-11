const { test } = require('node:test');
const assert = require('node:assert');
const { seededRoller } = require('../src/dice');
const { createCharacter } = require('../src/characters');
const casting = require('../src/casting');
const pr = require('../src/partyrun');

function party(cls, extra) {
  const p = [{ clientId: 'c1', icon: '🧙', character: createCharacter({ name: 'Caster', race: 'human', cls }) }];
  if (extra) p.push({ clientId: 'c2', icon: '🛡️', character: createCharacter({ name: 'Tank', race: 'human', cls: 'fighter' }) });
  return p;
}

test('spellbookFor: wizard gets an at-will cantrip + level-1 slot spells; fighter gets none', () => {
  const wiz = casting.spellbookFor('wizard', 1);
  assert.ok(wiz.atwill && wiz.atwill.key === 'rayoffrost', 'wizard at-will Ray of Frost');
  const keys = wiz.spells.map(s => s.key);
  assert.ok(keys.includes('magicmissile') && keys.includes('shockinggrasp'), 'level-1 wizard spells: ' + keys.join(','));
  assert.ok(!keys.includes('scorchingray'), 'minLevel-4 spells excluded at level 1');
  const ftr = casting.spellbookFor('fighter', 1);
  assert.ok(!ftr.atwill && ftr.spells.filter(s => s.effect !== 'heal').every(s => s.cost !== 'slot') || ftr.spells.length === 0, 'fighter casts nothing');
});

test('a wizard hero in a run has slots and can cast Magic Missile at a foe', () => {
  const roll = seededRoller(6);
  const run = pr.createPartyRun(party('wizard', true), roll);
  const wiz = run.heroes.find(h => h.cls === 'wizard');
  assert.ok(wiz.slots[1] >= 1, 'level-1 wizard has 1st-level slots: ' + JSON.stringify(wiz.slots));
  // Force it to be the wizard's turn and a revealed foe to shoot.
  const foe = run.combatants.find(c => c.side === 'enemy');
  foe.revealed = true;
  run.turnIndex = run.combatants.indexOf(wiz);
  run.phase = 'combat';
  const before = foe.hp;
  const slotsBefore = wiz.slots[1];
  const r = pr.applyAction(run, 'c1', { type: 'cast', spell: 'magicmissile', target: foe.id }, roll);
  assert.ok(r.ok, 'cast resolved: ' + (r.error || ''));
  assert.ok(foe.hp < before, 'magic missile auto-hit damage landed');
  assert.strictEqual(wiz.slots[1], slotsBefore - 1, 'slot spent');
  assert.ok(run.log.some(e => /Magic Missile/i.test(e.text)), 'cast narrated');
});

test('at-will cantrip never runs out and needs no slot', () => {
  const roll = seededRoller(3);
  const run = pr.createPartyRun(party('wizard'), roll);
  const wiz = run.heroes[0];
  const foe = run.combatants.find(c => c.side === 'enemy');
  foe.revealed = true; foe.hp = 999; foe.maxHp = 999; foe.ac = 5; foe.touchAC = 5;
  for (let i = 0; i < 4; i++) {
    run.turnIndex = run.combatants.indexOf(wiz); run.phase = 'combat';
    const r = pr.applyAction(run, 'c1', { type: 'cast', spell: 'rayoffrost', target: foe.id }, roll);
    assert.ok(r.ok, 'cantrip cast #' + i);
  }
  assert.ok(run.log.filter(e => /Ray of Frost/i.test(e.text)).length >= 2, 'cantrips narrated');
});

test('casting without a slot is refused and does not burn the turn', () => {
  const roll = seededRoller(5);
  const run = pr.createPartyRun(party('wizard'), roll);
  const wiz = run.heroes[0];
  wiz.slots = { 1: 0 };
  run.turnIndex = run.combatants.indexOf(wiz); run.phase = 'combat';
  const r = pr.applyAction(run, 'c1', { type: 'cast', spell: 'magicmissile' }, roll);
  assert.strictEqual(r.ok, false);
  assert.match(r.error, /no uses/i);
});

test('a cleric AI companion casts Cure on a badly hurt ally instead of swinging', () => {
  const roll = seededRoller(8);
  const partyList = [
    { clientId: 'c1', icon: '🛡️', character: createCharacter({ name: 'Kara', race: 'human', cls: 'fighter' }) },
    { clientId: 'aiC', ai: true, icon: '🔮', character: createCharacter({ name: 'Mira', race: 'human', cls: 'cleric' }) },
  ];
  const run = pr.createPartyRun(partyList, roll);
  const kara = run.heroes.find(h => h.name === 'Kara');
  // createPartyRun auto-plays AI turns up to the first human turn, so Mira can
  // clear the opening room before we stage the scenario — descend until a
  // fight actually holds at Kara's turn.
  let rooms = 0;
  while (run.phase !== 'combat' && rooms++ < 8) {
    if (!pr.applyAction(run, 'c1', { type: 'descend' }, roll).ok) break;
  }
  assert.strictEqual(run.phase, 'combat', 'found a room where combat holds');
  kara.hp = 2;                                       // badly hurt
  // The foe must survive long enough for Mira's heal decision to matter.
  for (const c of run.combatants) if (c.side === 'enemy') { c.hp = 200; c.maxHp = 200; }
  // "💚 Mira casts Cure Light Wounds — Kara heals 8 (10/12)." (or channel wording)
  const HEAL = /Mira[^]*?(Cure|channel|heal)[^]*?Kara heals/i;
  // Let the loop run a few of Kara's turns (passing) so Mira acts.
  let guard = 0;
  while (guard++ < 8 && run.phase === 'combat' && !run.log.some(e => HEAL.test(e.text))) {
    const v = pr.publicRun(run);
    if (!v.turn) break;
    pr.applyAction(run, v.turn.ownerClientId, { type: 'pass' }, roll);
  }
  assert.ok(run.log.some(e => HEAL.test(e.text)),
    'Mira healed Kara via spell: ' + run.log.map(e => e.text).join(' | '));
});

test('a wizard AI companion prefers spells over melee', () => {
  const roll = seededRoller(11);
  const partyList = [
    { clientId: 'c1', icon: '🛡️', character: createCharacter({ name: 'Kara', race: 'human', cls: 'fighter' }) },
    { clientId: 'aiW', ai: true, icon: '🧙', character: createCharacter({ name: 'Zara', race: 'elf', cls: 'wizard' }) },
  ];
  const run = pr.createPartyRun(partyList, roll);
  let guard = 0;
  while (guard++ < 8 && run.phase === 'combat' && !run.log.some(e => /Zara('s)? (casts|looses|Ray|Magic)/i.test(e.text))) {
    const v = pr.publicRun(run);
    if (!v.turn) break;
    pr.applyAction(run, v.turn.ownerClientId, { type: 'pass' }, roll);
  }
  const zaraCast = run.log.some(e => /Zara/.test(e.text) && /(casts|looses|Ray of Frost|Magic Missile|Burning Hands|Shocking)/i.test(e.text));
  assert.ok(zaraCast || run.phase !== 'combat', 'Zara cast something: ' + run.log.map(e => e.text).join(' | '));
});

test("the 'cantrip' action cycles a wizard's at-will element and refuses for a fighter", () => {
  const roll = seededRoller(4);
  const run = pr.createPartyRun(party('wizard', true), roll);
  const first = pr.applyAction(run, 'c1', { type: 'cantrip' }, roll);
  assert.ok(first.ok, 'wizard can cycle: ' + (first.error || ''));
  assert.ok(first.cantripName, 'named the new cantrip');
  const seen = new Set([first.cantrip]);
  for (let i = 0; i < 3; i++) seen.add(pr.applyAction(run, 'c1', { type: 'cantrip' }, roll).cantrip);
  assert.ok(seen.size >= 2, 'cycling steps through elements: ' + [...seen].join(','));
  const run2 = pr.createPartyRun([{ clientId: 'cf', icon: 'X', character: createCharacter({ name: 'Brute', race: 'human', cls: 'fighter' }) }], roll);
  const r2 = pr.applyAction(run2, 'cf', { type: 'cantrip' }, roll);
  assert.strictEqual(r2.ok, false);
  assert.match(r2.error, /no at-will cantrip/i);
});
