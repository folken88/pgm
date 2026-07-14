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

/** Register OR log in with one call. Password is OPTIONAL (family UX, Tobias
 *  2026-07-12: "one-click connect and play"). A name-only profile is created
 *  instantly and remembered in the browser for a one-click button next time.
 *  Setting a password protects the name; once set, it's required. */
function signIn(name, password) {
  const k = keyOf(name);
  if (!k || k.length < 2) return { ok: false, error: 'pick a name (2+ characters)' };
  const hasPw = !!(password && String(password).length);
  const existing = DB[k];
  if (existing) {
    if (existing.hash) {   // this profile is password-protected
      if (!hasPw) return { ok: false, error: 'this profile has a password — enter it' };
      if (hashPw(password, existing.salt) !== existing.hash) return { ok: false, error: 'wrong password for that name' };
    } else if (hasPw) {    // first password locks a previously-open profile
      existing.salt = crypto.randomBytes(16).toString('hex');
      existing.hash = hashPw(password, existing.salt);
      save();
    }
    return { ok: true, token: existing.token, name: existing.name, character: existing.character || null, created: false };
  }
  const salt = crypto.randomBytes(16).toString('hex');
  DB[k] = {
    name: String(name).trim().slice(0, 24), salt,
    hash: hasPw ? hashPw(password, salt) : null,   // null = open profile (name-only)
    token: crypto.randomBytes(24).toString('hex'), character: null, createdAt: Date.now(),
  };
  save();
  return { ok: true, token: DB[k].token, name: DB[k].name, character: null, created: true };
}

function byToken(token) {
  if (!token) return null;
  return Object.values(DB).find(a => a.token === token) || null;
}

/** Remember created characters (list, newest first) — the landing shows them
 *  for 1-click play. Also keeps `character` (last build) for prefill. */
function rememberCharacter(name, character) {
  const a = DB[keyOf(name)];
  if (!a) return;
  a.character = { race: character.race, cls: character.cls, token: character.token || null };
  a.characters = a.characters || [];
  const key = (character.charName || a.name) + '|' + character.race + '|' + character.cls;
  a.characters = a.characters.filter(c => (c.charName + '|' + c.race + '|' + c.cls) !== key);
  a.characters.unshift({ charName: character.charName || a.name, race: character.race, cls: character.cls, token: character.token || null, at: Date.now() });
  a.characters = a.characters.slice(0, 6);
  save();
}

module.exports = { signIn, byToken, rememberCharacter, keyOf };
