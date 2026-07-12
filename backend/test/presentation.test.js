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
