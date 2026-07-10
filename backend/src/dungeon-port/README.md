# dungeon-port/ — poker-dungeon transplant staging (Tobias directive 2026-07-09)

VERBATIM copies from poker `backend/src/` awaiting transplant into PGM's app
layer via a Dungeon-compat shim (map `this.enemies/livingParty()/_note(text,
sound)/_spellDC...` onto PGM run state + the pf1core rules layer that already
exists). NOT loaded by the server yet — staging only, so the transplant work
survives context/session changes.

- abilities.js  — the 55-effect resolution engine (~2960 lines)
- heroAI.js     — hero-bot brain (_botAbility decision tree, _botStance, _preferredFoe)
- enemyAI.js    — villain brain (action economy, CMB maneuvers, _lichCast caster AI)
- summons.js    — summon creation (initiative-spliced)
- characterBuilds.js — THE POKER CAST (authored AI heroes) → PGM companions
- character_voices.js / pronunciations.js — per-character 11labs voices + TTS fixes

Plan of record: docs/superpowers/plans/2026-07-09-pf1-engine-extraction.md
(TOBIAS DIRECTIVE + PARITY MILESTONE sections).
