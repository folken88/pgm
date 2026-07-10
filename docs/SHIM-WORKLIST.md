# DungeonShim convergence worklist

Harness: `node scripts/shim-harness.js` — exercises EVERY kit ability through
the transplanted poker engine (backend/src/pokerdungeon/) on a PGM run.

## Status 2026-07-09 (later): **433/433 — CONVERGED.** swing.js carries the
verbatim attack pipeline (_swingVsAC/_canReach/_flankRegister/_atkStr from
Dungeon.js L365-375 + L1449-1710): iteratives-ready to-hit math, crit confirm
(Improved Crit/keen, Critical Focus), Sneak/Smite/Bane/Studied/Challenge dice,
weapon arcana (magus pool, Divine Bond holy, flaming/shock/frost bursts), flank
register, Mirror Image + concealment, DR + Penetrating Strike, monk fists,
natural-attack size steps. Previously:
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

## Status 2026-07-10: **WIRED INTO LIVE PLAY.**
- Hero attacks -> _swingVsAC iterative pipeline; player casts -> _useAbility
  (FULL kit incl. grease/sleep/stances/mage armor); AI companions -> _allyAct
  (poker hero brain — confirmed live: Jason auto-healed Josh at 2 HP).
- Enemy side stays PGM's perception-aware turn until enemy stat blocks carry
  poker abilities (boss/enemy-caster increment); then _enemyAct switches on.
- KNOWN GAPS: summons refuse (_makeEnemy + turnOrder splice need PGM
  adaptation); casting.js is now legacy (used only by its own tests);
  Sleep cast needs an eyes-on verify (likely fine — kobold saved).
