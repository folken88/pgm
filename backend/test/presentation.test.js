/**
 * Presentation fixes (Tobias 2026-07-12 play feedback): treasure prose sums
 * coin+valuables and names magic items; enemy art resolves by MON key.
 */
const { test } = require('node:test');
const assert = require('node:assert');
const treasure = require('../src/treasure');
const items = require('../src/items');
const { artFor } = require('../src/art');
const { createCharacter } = require('../src/characters');

test('treasure prose: coin + gems + art become ONE total; magic items named', () => {
  // hand-built hoard: 100 coin + a 1000gp emerald + a 250gp tapestry + a potion
  const t = { coins: 100, drops: [
    { key: 'gem_emerald', qty: 1 }, { key: 'art_silk_tapestry', qty: 1 }, { key: 'potion_clw', qty: 1 },
  ], diverted: 0, cr: 5 };
  const line = treasure.prose(t);
  // 100 + 1000 + 250 = 1350 folded into the total; the potion called out.
  assert.match(line, /1350 gold in coin and valuables/, 'valuables summed into total: ' + line);
  assert.match(line, /Potion of Cure Light Wounds/, 'magic item named: ' + line);
  assert.ok(!/Emerald|Tapestry/.test(line), 'gems/art NOT listed individually: ' + line);
});

test('enemy art resolves by MON key (matches portrait filenames)', () => {
  // "Damned Lubber" (display) has no portrait; its key shackles_lubber does.
  assert.ok(artFor('shackles_lubber'), 'key resolves to a portrait');
  assert.strictEqual(artFor('Damned Lubber'), null, 'the display name alone does not');
  // sanity: common foes still resolve by key
  for (const k of ['kobold', 'goblin', 'wight', 'dire_rat']) {
    assert.ok(artFor(k), k + ' portrait resolves');
  }
});

test('enemy HP is hidden + quantized to 25% buckets; heroes keep exact HP + XP progress', () => {
  const pr = require('../src/partyrun');
  const { seededRoller } = require('../src/dice');
  const pf1 = require('../src/pf1core');
  const roll = seededRoller(4);
  const run = pr.createPartyRun([{ clientId: 'c1', icon: 'X', character: createCharacter({ name: 'T', race: 'human', cls: 'fighter' }) }], roll);
  pr.applyAction(run, 'c1', { type: 'initiative' }, roll);
  const foe = run.combatants.find(c => c.side === 'enemy'); foe.revealed = true;
  foe.hp = Math.ceil(foe.maxHp * 0.4);   // 40% → ceil to the 50% bucket
  const snap = pr.publicRun(run);
  const efoe = snap.combatants.find(c => c.side === 'enemy');
  assert.strictEqual(efoe.hp, null, 'enemy exact HP is not sent');
  assert.strictEqual(efoe.maxHp, null, 'enemy max HP is not sent');
  assert.strictEqual(efoe.hpPct, 50, '40% of HP quantizes UP to the 50% bucket');
  const ehero = snap.combatants.find(c => c.side === 'hero');
  assert.ok(ehero.hp > 0 && ehero.maxHp > 0, 'heroes keep exact HP');
  assert.strictEqual(typeof ehero.xpInto, 'number', 'heroes expose XP-into-level for the bar');
  assert.strictEqual(typeof ehero.xpSpan, 'number', 'heroes expose XP span for the bar');
  // the blind/target readout uses a coarse word, never a number
  const listed = snap.enemies.find(e => e.id === efoe.id);
  assert.ok(/wounded|scratched|unhurt|near death/.test(listed.hpWord), 'coarse hpWord, not a number: ' + listed.hpWord);
  assert.strictEqual(listed.hp, undefined, 'no exact enemy HP in the target list');
});

test('char-gated abilities are filtered from other heroes’ action bars', () => {
  const pr = require('../src/partyrun');
  const { seededRoller } = require('../src/dice');
  const roll = seededRoller(5);
  function feats(name) {
    const run = pr.createPartyRun([{ clientId: 'c1', icon: 'X', character: createCharacter({ name, race: 'human', cls: 'cleric' }) }], roll);
    pr.applyAction(run, 'c1', { type: 'initiative' }, roll);
    const h = run.heroes[0]; run.turnIndex = run.combatants.indexOf(h); run.phase = 'combat';
    return pr.publicRun(run).turn.kit.abilities.filter(a => !a.isSpell).map(a => a.key);
  }
  // Force Push is char:'Jason' — a generic cleric must NOT see it; Jason must.
  assert.ok(!feats('Cleric').includes('forcepush'), 'generic cleric does not get Jason’s Force Push');
  assert.ok(feats('Jason').includes('forcepush'), 'Jason keeps his Force Push');
});
