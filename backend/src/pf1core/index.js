/**
 * pf1core/index.js — THE one door to the shared PF1 rules engine.
 * Pure: no persistence, no sockets, no app-specific coupling (enforced by
 * test/purity.test.js — the purity gate). Consumed by folken poker and PGM.
 *
 * Namespaces (mirrors poker's original façade):
 *   abilities, feats, classes, races, domains, monsters, weapons, xp,
 *   abilityScores, loadouts, profiles, character
 *
 * NOTE: `combat` is intentionally absent in Phase 1. game/combat.js is being
 * decomposed (pure math vs. poker-cosmetic resolvers + weapon registry) in
 * Phase 2; until then, apps keep their own combat module.
 */
module.exports = {
  abilities: require('./pf1data/abilities'),
  feats: require('./pf1data/feats'),
  classes: require('./pf1data/classes'),
  races: require('./pf1data/races'),
  domains: require('./pf1data/domains'),
  monsters: require('./pf1data/monsters'),
  weapons: require('./pf1data/weapons'),
  signatures: require('./pf1data/signatures'),
  choices: require('./pf1data/choices'),
  xp: require('./pf1data/xp'),
  abilityScores: require('./pf1data/abilityScores'),
  skills: require('./pf1data/skills'),
  loadouts: require('./pf1data/loadouts'),
  profiles: require('./pf1data/characterProfiles'),
  character: require('./game/character'),
  // Rules-resolution layer (PF1-engine extraction from poker dungeon, Phase A):
  conditions: require('./rules/conditions'),
  spellmath: require('./rules/spellmath'),
  protections: require('./rules/protections'),
  treasure: require('./rules/treasure'),
  resolve: require('./rules/resolve'),
  tick: require('./rules/tick'),
  buffs: require('./rules/buffs'),
};
