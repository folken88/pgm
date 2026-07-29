/**
 * Poker persistence for the transplanted dungeon engine — PGM edition.
 * v1.19.0: NO LONGER a null stub. Poker's caster/pad pickers (K prepare /
 * V domains / N pad manager) run through the synced abilities mixin, which
 * reads and writes THIS module — so their choices now persist for real, in a
 * small JSON prefs file keyed `${playerId}::${cls}` under the bind-mounted
 * data dir (survives rebuilds like every PGM save).
 *
 * Semantics kept from the stub era so defaults still flow:
 *   · known/prepared return null/{}-ish when UNSET → abilities.js falls back
 *     to the class default loadout;
 *   · PGM's shim still forces castableKeys=null (no prepared-list GATING yet —
 *     the picker persists + displays, casting stays lenient);
 *   · domains default [] → the class default picks (mixin handles it).
 */
const fs = require('fs');
const path = require('path');
const FILE = path.join(__dirname, '../../../../data/pokerprefs.json');   // backend/src/pokerdungeon/persistence → /app/data

let _cache = null;
function _load() {
  if (_cache) return _cache;
  try { _cache = JSON.parse(fs.readFileSync(FILE, 'utf8')) || {}; } catch (_) { _cache = {}; }
  return _cache;
}
function _save() {
  try { fs.mkdirSync(path.dirname(FILE), { recursive: true }); fs.writeFileSync(FILE, JSON.stringify(_cache || {})); } catch (_) {}
}
const _key = (id, cls) => `${String(id || 'anon')}::${String(cls || 'any')}`;
const _rec = (id, cls) => (_load()[_key(id, cls)] || {});
function _set(id, cls, field, v) {
  const m = _load();
  m[_key(id, cls)] = { ...(m[_key(id, cls)] || {}), [field]: v };
  _save();
}

module.exports = {
  getKnownSpells(id, cls) { const v = _rec(id, cls).known; return (Array.isArray(v) && v.length) ? v : null; },
  setKnownSpells(id, cls, v) { _set(id, cls, 'known', Array.isArray(v) ? v : []); },
  getPreparedSpells(id, cls) { const v = _rec(id, cls).prepared; return (v && typeof v === 'object' && Object.keys(v).length) ? v : null; },
  setPreparedSpells(id, cls, v) { _set(id, cls, 'prepared', (v && typeof v === 'object') ? v : {}); },
  getDomains(id, cls) { const v = _rec(id, cls).domains; return Array.isArray(v) ? v : []; },
  setDomains(id, cls, v) { _set(id, cls, 'domains', Array.isArray(v) ? v : []); return { ok: true, domains: Array.isArray(v) ? v : [] }; },
  getHiddenPad(id, cls) { const v = _rec(id, cls).hiddenPad; return Array.isArray(v) ? v : []; },
  setHiddenPad(id, cls, v) { _set(id, cls, 'hiddenPad', Array.isArray(v) ? v : []); },
  getPadMap(id, cls) { const v = _rec(id, cls).padMap; return (v && typeof v === 'object') ? v : {}; },
  setPadMap(id, cls, v) { _set(id, cls, 'padMap', (v && typeof v === 'object') ? v : {}); },
  addXp() { return 0; }, setGear() {}, getGear() { return {}; },
  GEAR_SLOT_KEYS: ['weapon', 'armor', 'shield', 'ring', 'cloak'],
};
