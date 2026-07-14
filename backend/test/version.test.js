/**
 * The versioning system (Tobias 2026-07-14). A version is only useful if it
 * can't drift from its notes: bumping VERSION without writing the player-facing
 * entry (or without refreshing the headline players read) must FAIL the suite.
 */
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { VERSION, HEADLINE } = require('../src/version');

const ROOT = path.join(__dirname, '..', '..');
const changelog = fs.readFileSync(path.join(ROOT, 'CHANGELOG.md'), 'utf8');
const devlog = fs.readFileSync(path.join(ROOT, 'backend', 'src', 'version.js'), 'utf8');

test('VERSION is semver', () => {
  assert.match(VERSION, /^\d+\.\d+\.\d+$/, 'MAJOR.MINOR.PATCH');
});

test('the current version has a player-facing entry in CHANGELOG.md', () => {
  assert.ok(
    changelog.includes('## v' + VERSION),
    `CHANGELOG.md has no "## v${VERSION}" section — bump the version, write the notes.`
  );
});

test('the current version has a one-line entry in the dev log', () => {
  // The comment block at the top of version.js: "  1.0.0  2026-07-14 ..."
  assert.match(
    devlog,
    new RegExp('^//\\s+' + VERSION.replace(/\./g, '\\.') + '\\s', 'm'),
    `version.js has no dev-log line for ${VERSION}.`
  );
});

test('HEADLINE is a short, player-facing summary (it is shown/spoken on boot)', () => {
  assert.ok(HEADLINE && HEADLINE.trim().length > 20, 'headline is missing or too short');
  assert.ok(HEADLINE.length < 320, 'headline is a sentence or two, not an essay');
});

test('the server exposes the version (patch-note emails quote it in the subject)', () => {
  const server = fs.readFileSync(path.join(ROOT, 'backend', 'src', 'server.js'), 'utf8');
  assert.ok(server.includes("'/api/version'"), '/api/version route is gone');
  assert.ok(/version:\s*VERSION/.test(server), '/api/meta no longer carries the version');
});
