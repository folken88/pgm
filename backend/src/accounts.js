/**
 * Player accounts (Tobias 2026-07-11): create a login once, be remembered,
 * and have your delves/characters follow you — no recreating on every visit.
 *
 * Family-scale by design: name + password, scrypt-hashed at rest in
 * data/accounts.json, a bearer token in the browser's localStorage. Guests
 * (no password) keep working exactly as before.
 */
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', '..', 'data');
const FILE = path.join(DATA_DIR, 'accounts.json');
let DB = {};
try { DB = JSON.parse(fs.readFileSync(FILE, 'utf8')); } catch (e) {}
function save() { try { fs.writeFileSync(FILE, JSON.stringify(DB)); } catch (e) {} }

function keyOf(name) { return String(name || '').trim().toLowerCase(); }
function hashPw(pw, salt) { return crypto.scryptSync(String(pw), salt, 32).toString('hex'); }

/** Register OR log in with one call (family UX: "Sign in" just works).
 *  New name -> account created; known name -> password must match. */
function signIn(name, password) {
  const k = keyOf(name);
  if (!k || k.length < 2) return { ok: false, error: 'pick a name (2+ characters)' };
  if (!password || String(password).length < 3) return { ok: false, error: 'password needs 3+ characters' };
  const existing = DB[k];
  if (existing) {
    if (hashPw(password, existing.salt) !== existing.hash) return { ok: false, error: 'wrong password for that name' };
    return { ok: true, token: existing.token, name: existing.name, character: existing.character || null, created: false };
  }
  const salt = crypto.randomBytes(16).toString('hex');
  DB[k] = {
    name: String(name).trim().slice(0, 24), salt, hash: hashPw(password, salt),
    token: crypto.randomBytes(24).toString('hex'), character: null, createdAt: Date.now(),
  };
  save();
  return { ok: true, token: DB[k].token, name: DB[k].name, character: null, created: true };
}

function byToken(token) {
  if (!token) return null;
  return Object.values(DB).find(a => a.token === token) || null;
}

/** Remember the last character build so the create screen prefills next visit. */
function rememberCharacter(name, character) {
  const a = DB[keyOf(name)];
  if (!a) return;
  a.character = { race: character.race, cls: character.cls };
  save();
}

module.exports = { signIn, byToken, rememberCharacter, keyOf };
