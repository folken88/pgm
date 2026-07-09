# PGM v0 — Design Spec (thin vertical slice)

**Date:** 2026-07-09
**Status:** Approved by Tobias ("go, build it").
**Supersedes framing in:** `2026-07-09-personal-game-master-design.md` on one
major point — see "Multiplayer pivot" below.

## Multiplayer pivot (important — revises the original spec)

The original design framed PGM as **solo** (one human + AI support characters).
Tobias has since decided PGM is **real-time multiplayer**: multiple human players
can join one shared run AND fill out the party with AI-controlled companions
(the follower-rating characters). Named, persistent parties; a PF1 treasure
economy divided among members. This is the destination architecture; the primer,
the original spec, and the `pgm-app` memory entry all need this correction
recorded (done via this doc + memory update).

v0 itself stays **solo-runnable**, but is scaffolded so multiplayer is additive,
not a rewrite (see Architecture).

## v0 goal — the thin vertical slice

A locally-runnable, blind-first slice that proves the whole stack end to end:

> identity → create a character → generate one room → resolve one combat → "you cleared it."

Deterministic narration (no LLM yet). Full blind-mode accessibility **including
push-to-talk voice control**. Runs on pf1core Phase 1.

### Explicitly deferred (with why it's safe)
- **LLM GM** → v0.2. v0 uses a template narrator behind a clean interface; the
  LLM drops into that seam later.
- **Full donjon spatial generator** → later. v0 makes ONE room.
- **pf1core `combat.js` (Phase 2)** → not needed. v0's combat resolver is
  app-layer (PGM owns combat resolution by design) and uses only pf1core Phase 1:
  `character.attackProfile` + `monsters`/`weapons` data + a dice util.
- **Party & Treasure subsystem** (multiplayer parties, PF1 treasure tables,
  inventory/equip/use, treasure division) → its own dedicated spec + plan. v0
  includes only a minimal coin drop as the seam this system slots into.
- **ElevenLabs voices, token art, 500-word descriptions, AI companions** → later.
- **`pgm.folkengames.com` deploy packaging** → post-v0.

## Dependency: pf1core Phase 1

v0 is built on the shared rules engine. Phase 1 (rules DATA + `character.js`
derivation, purity gate, vendored into PGM) must be executed first — plan at
`docs/superpowers/plans/2026-07-09-pf1core-phase1-extraction.md`. Building v0
against anything else would defeat the shared-engine goal.

## Architecture

### Backend — single Express process (v0), `better-sqlite3`, consumes pf1core
- **Server-authoritative runs.** Game state lives on the server as a `run`
  record; player actions are commands against it. One player in v0; broadcasting
  the same state to multiple sockets later is additive.
- **Own SQLite DB** (`characters`, `runs`) — separate from `poker.db`; read-only
  access to `dungeon-content.db` for shared content later.
- **Endpoints (v0):** create+derive character; start run; generate room; resolve
  combat action; get run state.

### Combat — app-layer, deterministic, pure/testable
d20 + `pf1core.character.attackProfile` vs. monster AC → hit/miss/damage →
narrated. No dependency on pf1core `combat.js`.

### Narrator — app-layer, template-based
Terse room/combat text through a stable interface. The LLM replaces this module
at v0.2 without touching callers.

### Content generation — vetting-gated with diversion (principle established now)
PGM rolls on real PF1 encounter/treasure tables, then **diverts any unvetted
result to the nearest vetted equivalent** (nearest-CR creature; comparable-value
item; coins as ultimate treasure fallback). Guarantees everything generated is
runnable; diversion logs self-prioritize the vetting backlog. Ledgers:
`docs/ITEMS-VETTING.md`, `docs/ENCOUNTERS-VETTING.md`. **v0 seeds the first VETTED
entries** (one low-CR creature, coins) rather than building the full table engine.

### Accessibility — PGM's own implementation, full parity with Josh's poker blind mode
Independent code (not a shared package — Tobias's call), reusing the proven
patterns:
- 3-tier priority speech queue (urgent > event > ambient; higher cancels lower).
- **Push-to-talk voice control** (Web Speech recognition), dungeon vocabulary:
  "attack the goblin", "cast magic missile", "move", "what's here", "inventory",
  "repeat", "faster"/"slower"; rebindable PTT key; graceful fallback + toast on
  unsupported browsers.
- Numbered-choice menus (keyboard-selectable), re-read/repeat, speed control.
- Diagnostic logging ring buffer (debug a remote blind tester's session).
- ARIA live regions + always-visible text (nothing depends on TTS working).
- **Transport-decoupled:** the a11y engine consumes an abstract game-event stream
  (room entered, attack resolved, treasure found), fed by HTTP responses in v0
  and by sockets later — so the accessibility work survives the multiplayer move.

### Persistence
PGM's own SQLite. v0: `characters` (id, name, race, class, derived stats blob,
gear), `runs` (id, character_id, state blob, current_room, status).

## Build order (v0)
1. Execute pf1core Phase 1 (populate + vendor into PGM).
2. Scaffold PGM (Express + sqlite + static frontend + test runner).
3. Character creation (backend derive via pf1core + blind-accessible UI).
4. Room generation (one room) + combat resolver (app-layer, tested).
5. Template narrator + the game-event stream interface.
6. Blind-mode engine incl. PTT, wired to the event stream.
7. Runnable locally end-to-end; seed first VETTED ledger entries.

## Roadmap after v0
- **Party & Treasure** subsystem (own spec): multiplayer sockets, named/persistent
  parties, human+AI roster, real PF1 treasure via vetting+diversion, inventory/
  equip/use, treasure division.
- **v0.2 LLM GM**: narration/roleplay/secret-gating behind the narrator seam.
- **World-gen**: full donjon port + terrain×CR encounter tables with diversion.
- **Deploy**: two-container compose + Traefik route for `pgm.folkengames.com`.

## Non-goals for v0
Real-time multiplayer play, full treasure/inventory, LLM, multi-room crawl,
visual dungeon map, deploy. All are on the roadmap; none block the slice.
