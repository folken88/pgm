# DungeonShim convergence worklist

Harness: `node scripts/shim-harness.js` — exercises EVERY kit ability through
the transplanted poker engine (backend/src/pokerdungeon/) on a PGM run.

## Status 2026-07-09: 422/433 abilities resolve.
Remaining failures (all 11) need exactly two Dungeon.js methods ported:
1. `_swingVsAC` (Dungeon.js L1471-1710) — THE attack pipeline (iteratives, crit
   confirm, Sneak/Smite/Studied/Challenge dice, weapon arcana, flanking).
   Unblocks: disarm, grapple, trip, feint maneuvers + replaces PGM's basic
   heroAttack at integration.
2. `_canReach` (small) — reach/fly melee check. Unblocks: cleave.

## Integration steps after convergence (wire the shim into partyrun):
- heroCombatant/enemyCombatant: poker aliases (playerId/nickname/uid/glyph/
  abilityUses=roomUses/spellPool/gear/weaponKey) — harness lines show the set.
- Player casts route through shim._useAbility (replaces casting.js SUPPORTED
  filter — the FULL kit becomes castable); AI turns through _allyAct/_enemyAct.
- Turn loop: keep PGM initiative/tick; shim handles actions.
- publicRun turn.spells: derive from shim._abilitiesFor + _kitState-style uses.
- Delve logs + sounds already flow (shim._note pushes {text,sound} to run.log).
