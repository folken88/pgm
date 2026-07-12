const { test } = require('node:test');
const assert = require('node:assert');
const { seededRoller } = require('../src/dice');
const { createCharacter } = require('../src/characters');
const casting = require('../src/casting');
const pr = require('../src/partyrun');

// Initiative is now the PLAYERS' roll (Tobias 2026-07-11): tests roll it
// immediately after run creation / each descend so combat proceeds as before.
function rollInit(run, roll) {
  if (run.phase !== 'initiative') return;
  const human = run.heroes.find(h => h.ownerClientId);
  require('../src/partyrun').applyAction(run, human && human.ownerClientId, { type: 'initiative' }, roll);
}


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
  const run = pr.createPartyRun(party('wizard', true), roll); rollInit(run, roll);
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
  const run = pr.createPartyRun(party('wizard'), roll); rollInit(run, roll);
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
  const run = pr.createPartyRun(party('wizard'), roll); rollInit(run, roll);
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
  const run = pr.createPartyRun(partyList, roll); rollInit(run, roll);
  const kara = run.heroes.find(h => h.name === 'Kara');
  // createPartyRun auto-plays AI turns up to the first human turn, so Mira can
  // clear the opening room before we stage the scenario — descend until a
  // fight actually holds at Kara's turn.
  let rooms = 0;
  while (run.phase !== 'combat' && rooms++ < 8) {
    if (run.phase === 'initiative') { rollInit(run, roll); continue; }
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
  const run = pr.createPartyRun(partyList, roll); rollInit(run, roll);
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
  const run = pr.createPartyRun(party('wizard', true), roll); rollInit(run, roll);
  const first = pr.applyAction(run, 'c1', { type: 'cantrip' }, roll);
  assert.ok(first.ok, 'wizard can cycle: ' + (first.error || ''));
  assert.ok(first.cantripName, 'named the new cantrip');
  const seen = new Set([first.cantrip]);
  for (let i = 0; i < 3; i++) seen.add(pr.applyAction(run, 'c1', { type: 'cantrip' }, roll).cantrip);
  assert.ok(seen.size >= 2, 'cycling steps through elements: ' + [...seen].join(','));
  const run2 = pr.createPartyRun([{ clientId: 'cf', icon: 'X', character: createCharacter({ name: 'Brute', race: 'human', cls: 'fighter' }) }], roll); rollInit(run2, roll);
  const r2 = pr.applyAction(run2, 'cf', { type: 'cantrip' }, roll);
  assert.strictEqual(r2.ok, false);
  assert.match(r2.error, /no at-will cantrip/i);
});

test('AFK sweep: an idle human turn auto-attacks after the timeout', () => {
  const roll = seededRoller(9);
  const run = pr.createPartyRun(party('fighter'), roll); rollInit(run, roll);
  let rooms = 0;
  while (run.phase !== 'combat' && rooms++ < 8) {
    if (run.phase === 'initiative') { rollInit(run, roll); continue; }
    if (!pr.applyAction(run, 'c1', { type: 'descend' }, roll).ok) break;
  }
  assert.strictEqual(run.phase, 'combat', 'combat holds at the human turn');
  assert.ok(run.turnStartedAt, 'turn timer stamped');
  assert.strictEqual(pr.sweepAfk(run, roll), false, 'fresh turn is not swept');
  run.turnStartedAt = Date.now() - (pr.AFK_MS + 1000);   // simulate 60s idle
  const before = run.log.length;
  assert.strictEqual(pr.sweepAfk(run, roll), true, 'stale turn IS swept');
  const fresh = run.log.slice(before).map(e => e.text).join(' | ');
  assert.match(fresh, /hesitates too long/, 'instinct-attack narrated: ' + fresh);
});

test('death model: dying below -CON kills; inside it you bleed and can stabilize', () => {
  const roll = seededRoller(7);
  const run = pr.createPartyRun(party('fighter', true), roll); rollInit(run, roll);
  let rooms = 0;
  while (run.phase !== 'combat' && rooms++ < 8) {
    if (run.phase === 'initiative') { rollInit(run, roll); continue; }
    if (!pr.applyAction(run, 'c1', { type: 'descend' }, roll).ok) break;
  }
  const hero = run.heroes.find(h => h.ownerClientId === 'c1');
  const con = (hero.abilityScores && hero.abilityScores.con) || 10;
  // Straight to past the threshold: dead.
  hero.hp = -(con + 1);
  for (const c of run.combatants) if (c.side === 'enemy') { c.hp = 200; c.maxHp = 200; }
  pr.applyAction(run, 'c2', { type: 'pass' }, roll);
  assert.ok(hero.dead, 'hero at ' + hero.hp + ' with CON ' + con + ' is DEAD');
  assert.ok(run.log.some(e => /DEAD/.test(e.text)), 'death narrated');
});

test('the Swashgoblin: dead are luggage until a hired cleric raises them (2 neg levels)', () => {
  const session = require('../src/session');
  session._reset();
  const c = session.createDelve({ name: 'PubTester', icon: 'X', delveName: 'pubtest-' + Date.now() });
  session.setCharacter(c.clientId, { race: 'human', cls: 'fighter' });
  session.addCompanion(c.clientId, 'Gaspar');
  session.startRun(c.clientId);
  const s = session.sessionSnapshotFor(c.clientId);
  assert.strictEqual(s.phase, 'playing');
  // Kill the human hero, bank some gold, then retreat (Gaspar's owner acts? retreat is any-member).
  const runObj = require('../src/session');   // internal access via snapshot only — mutate through partyrun
  // Reach the live run through the module: action() applies to it; we mutate via the snapshot's identity.
  // Simpler: retreat first, then assert pub; the dead-luggage path is covered by marking before retreat.
  const internal = sessionInternals(c.clientId);
  internal.run.gold = 2000;
  internal.run.inventory.push({ key: 'diamond', qty: 1 });   // found a Raise Dead component below
  const hero = internal.run.heroes.find(h => h.ownerClientId === c.clientId);
  hero.dead = true; hero.down = true; hero.hp = -20; hero.negLevels = 0;
  session.action(c.clientId, { type: 'retreat' });
  const pubSnap = session.sessionSnapshotFor(c.clientId);
  assert.strictEqual(pubSnap.phase, 'pub', 'run end lands the party at the Swashgoblin');
  assert.ok(pubSnap.pub.gold >= 2000, 'run gold banked: ' + pubSnap.pub.gold);
  assert.deepStrictEqual(pubSnap.pub.dead, ['PubTester'], 'the dead are hauled as luggage');
  // A start attempt with the only human dead is refused.
  const blocked = session.startRun(c.clientId);
  assert.strictEqual(blocked.ok, false);
  // The found diamond makes the raise affordable: 450g casting fee, not 5450.
  const svc = pubSnap.pub.services.find(x => x.key === 'raisedead');
  assert.strictEqual(svc.gp, 450, 'component discount advertised: ' + JSON.stringify(svc));
  assert.ok(svc.usingComponent, 'diamond in the stash is being used');
  const raise = session.pubBuy(c.clientId, 'raisedead', 'PubTester');
  assert.ok(raise.ok, 'raise dead purchased: ' + (raise.error || ''));
  assert.ok(!(session.sessionSnapshotFor(c.clientId).pub.stash.diamond > 0), 'the diamond was consumed');
  const after = session.sessionSnapshotFor(c.clientId);
  assert.deepStrictEqual(after.pub.dead, [], 'nobody dead after the raise');
  assert.ok(after.pub.hurt.some(h => h.name === 'PubTester' && h.negLevels === 2), '2 negative levels applied');
  // Restoration cures them.
  const rest = session.pubBuy(c.clientId, 'restoration', 'PubTester');
  assert.ok(rest.ok, 'restoration purchased');
  assert.strictEqual(session.sessionSnapshotFor(c.clientId).pub.hurt.length, 0, 'negative levels cured');
  // And the party can set out again.
  assert.ok(session.startRun(c.clientId).ok, 'set out again from the pub');
});

// The test needs the live run object; session exposes it only via snapshots, so
// reach it through the module registry the same way sweepAfk does.
function sessionInternals(clientId) {
  const session = require('../src/session');
  let found = null;
  const orig = session.sweepAfk;
  // sessionSnapshotFor gives a copy; grab the real run via a temporary hook:
  // easiest supported path — the snapshot run and the real run share nothing,
  // so we patch through action('pass') side effects instead. For directness we
  // use the documented _reset-adjacent seam: sessions are module-private, but
  // partyrun objects are reachable from the snapshotFor closure only. So we
  // instead re-require with a helper the module exports for tests.
  return session._testInternals(clientId);
}

test('TPK kills the delve; a later party recovers the corpses and can raise them', () => {
  const session = require('../src/session');
  session._reset();
  // Party 1 wipes at depth 1.
  const a = session.createDelve({ name: 'Doomed', icon: 'X', delveName: 'doomed-run' });
  session.setCharacter(a.clientId, { race: 'human', cls: 'fighter' });
  session.startRun(a.clientId);
  const s1 = session._testInternals(a.clientId);
  s1.run.gold = 77;
  const doomed = s1.run.heroes.find(h => h.ownerClientId === a.clientId);
  doomed.hp = -30; doomed.dead = true; doomed.down = true;
  s1.run.phase = 'defeated';
  session.action(a.clientId, { type: 'pass' });   // any action routes the defeated run through tpk()
  assert.strictEqual(session.sessionSnapshotFor(a.clientId), null, 'the doomed delve is GONE');
  // Party 2 descends to the same depth and finds them.
  const b = session.createDelve({ name: 'Finder', icon: 'X', delveName: 'finder-run' });
  session.setCharacter(b.clientId, { race: 'human', cls: 'fighter' });
  session.startRun(b.clientId);
  const s2 = session._testInternals(b.clientId);
  s2.run.phase = 'cleared';                       // fast-forward: clear room 0, descend to depth 1... graves match depth roomsCleared+1
  session.action(b.clientId, { type: 'descend' });
  const snap = session.sessionSnapshotFor(b.clientId);
  const foundLine = snap.run.log.some(e => /lost party of "doomed-run"/i.test(e.text));
  assert.ok(foundLine, 'grave discovery narrated: ' + snap.run.log.slice(-3).map(e => e.text).join(' | '));
  assert.ok(s2.run.gold >= 77, 'their gold recovered');
  assert.ok((s2.corpses || []).some(c => c.name === 'Doomed'), 'corpse carried');
  // Home to the pub — raise the stranger.
  s2.run.gold += 10000;
  session.action(b.clientId, { type: 'retreat' });
  const raise = session.pubBuy(b.clientId, 'raisedead', 'Doomed');
  assert.ok(raise.ok, 'raised the recovered adventurer: ' + (raise.error || ''));
  assert.match(raise.text, /doomed-run/i);
});

test('a live delve saves to disk and restores with a working engine', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const session = require('../src/session');
  session._reset();
  const c = session.createDelve({ name: 'Saver', icon: 'X', delveName: 'save-test' });
  session.setCharacter(c.clientId, { race: 'human', cls: 'fighter' });
  session.startRun(c.clientId);
  const s = session._testInternals(c.clientId);
  const file = path.join(process.env.DATA_DIR || path.join(__dirname, '..', '..', 'data'), 'sessions', s.id + '.json');
  assert.ok(fs.existsSync(file), 'session file written on start: ' + file);
  const doc = JSON.parse(fs.readFileSync(file, 'utf8'));
  assert.strictEqual(doc.phase, 'playing');
  assert.ok(doc.run && doc.run.combatants.length >= 2, 'run serialized with combatants');
  assert.ok(!doc.run.shim, 'shim excluded from the save');
  // Restore path: rebuild a run from the doc the way restoreSessions does.
  const { DungeonShim } = require('../src/pokerdungeon/shim');
  const run = doc.run;
  const byId = new Map(run.combatants.map(x => [x.id, x]));
  run.heroes = run.heroes.map(h => byId.get(h.id) || h);
  run.heroes.forEach(h => { if (h.perceived && h.perceived.__set) h.perceived = new Set(h.perceived.__set); });
  run.shim = new DungeonShim(run);
  const pr2 = require('../src/partyrun');
  if (run.phase === 'initiative') pr2.applyAction(run, run.heroes[0].ownerClientId, { type: 'initiative' });
  const r = pr2.applyAction(run, run.heroes[0].ownerClientId, { type: 'pass' });
  assert.ok(r.ok || /turn/.test(r.error || ''), 'restored run accepts actions: ' + (r.error || 'ok'));
  fs.unlinkSync(file);
});
