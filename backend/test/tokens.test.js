/**
 * Player character tokens (Tobias 2026-07-13: "players creating their own should
 * be able to choose from a wide selection of tokens"). A chosen token becomes the
 * hero's art; a malicious filename is rejected (no path traversal).
 */
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const session = require('../src/session');
const accounts = require('../src/accounts');

function heroArt(clientId) {
  const snap = session.sessionSnapshotFor(clientId);
  return snap.run.combatants.find(x => x.side === 'hero').art;
}
function delve(tag, token) {
  session._reset();
  const uniq = tag + process.pid + Date.now();
  const a = accounts.signIn(uniq, 'pw');
  const c = session.createDelve({ name: uniq, icon: 'X', delveName: 'Tok', account: a.name });
  session.setCharacter(c.clientId, { race: 'human', cls: 'fighter', token });
  session.startRun(c.clientId);
  return c.clientId;
}

test('the token gallery manifest exists and lists real files with labels', () => {
  const dir = path.join(__dirname, '..', '..', 'public', 'tokens');
  const manifest = JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8'));
  assert.ok(manifest.length >= 50, 'a wide selection: ' + manifest.length);
  for (const t of manifest.slice(0, 20)) {
    assert.ok(/^[a-z0-9][\w.-]*\.webp$/i.test(t.file), 'safe filename: ' + t.file);
    assert.ok(t.label && t.label.length, 'has a label (for blind players): ' + JSON.stringify(t));
    assert.ok(fs.existsSync(path.join(dir, t.file)), 'file exists: ' + t.file);
  }
});

test('a chosen token becomes the hero art', () => {
  const cid = delve('tok', 'human-female-wizard.webp');
  assert.strictEqual(heroArt(cid), '/tokens/human-female-wizard.webp', 'hero art uses the chosen token');
});

test('a malicious token filename is rejected (no path traversal)', () => {
  const cid = delve('tok2', '../../../etc/passwd');
  const art = heroArt(cid) || '';
  assert.ok(!/passwd|\.\./.test(art), 'traversal rejected, fell back to name art (null here): ' + art);
});
