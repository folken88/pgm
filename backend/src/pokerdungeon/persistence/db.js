/**
 * Poker persistence stub for the transplanted dungeon engine. PGM has no
 * poker.db: known/prepared spells fall back to pf1core loadout defaults
 * (handled in abilities.js when these return null), domains default empty.
 */
module.exports = {
  getKnownSpells() { return null; },
  getPreparedSpells() { return null; },
  getDomains() { return []; },
  setKnownSpells() {}, setPreparedSpells() {}, setDomains() {},
  // Numpad manager (poker v3.37.93) — PGM has no per-player pad prefs yet, so
  // nothing is ever hidden; the padPick action exists but doesn't persist here.
  getHiddenPad() { return []; }, setHiddenPad() {},
  addXp() { return 0; }, setGear() {}, getGear() { return {}; },
  GEAR_SLOT_KEYS: ['weapon', 'armor', 'shield', 'ring', 'cloak'],
};
