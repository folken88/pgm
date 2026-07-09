# Personal Game Master (PGM) — Design Spec

**Date:** 2026-07-09
**Status:** Approved by Tobias, ready for implementation planning.
**Domain:** `pgm.folkengames.com`

## Vision & mandate

A solo, PF1-authentic procedural dungeon crawl: build a character, then generate
and clear an endless series of procedurally-generated areas (rooms, monsters,
treasure, hazards) scaled to your level, narrated and roleplayed by an LLM
acting as game master. This is the "future Personal GM app" the poker codebase
has been explicitly preparing for since 2026-07-04 — see
`poker-architecture-plan.md` (memory) and `Documents\poker game\PF1CORE-PLAN.md`,
whose own words are: *"fix Dispel Magic once, both apps get it."* The
`pf1core/index.js` façade already built in the poker backend exists
specifically so this moment — PGM kickoff — could happen with a mechanical
file move rather than a rewrite.

## Reuse strategy — what comes from poker, what's new

**Reused wholesale:**
- **pf1core** — the pure PF1 rules engine (abilities, feats, classes, races,
  domains, monsters, weapons, xp, abilityScores, loadouts, profiles, character
  derivation, combat math). See "pf1core sharing mechanism" below for exactly
  how this is shared between the two apps.
- **`dungeon-content.db`** — the existing spell/monster/class content database
  (2036 core PF1 spells, class lists, kit-ability data). PGM reads it
  read-only; it stays poker's canonical copy for now (see [[dungeon-content-db]]).
- **Architectural patterns, not files:** the room-by-room turn loop, initiative/
  combat-resolution structure, and the blind-accessibility lessons from both
  poker (`blindMode.js`) and birdquiz (`Narrator.presentChoices` numbered-menu
  pattern) — PGM gets its OWN app-layer implementation of these patterns, not
  a copy-paste of Dungeon.js (which is poker-coupled: sockets, bankroll, bot
  banter, none of which PGM needs).

**Genuinely new for PGM:**
- LLM-driven GM narration/roleplay layer with secret-gating.
- Procedural area generator (donjon-style room/corridor layout + d20pfsrd
  terrain/CR encounter tables).
- Companion "follower rating" AI (1-10 scale, see below).
- PGM's own character/campaign database.

## pf1core sharing mechanism (Tobias's ask — resolved)

**Decision: a dedicated `folken88/pf1core` repo, consumed by both apps via a
vendor-and-sync script — not a git submodule, not a merged monorepo.**

- **Monorepo rejected:** poker is a live, actively-played app with strict
  deploy-safety rules (never rebuild while humans are at the table or in the
  dungeon — see [[poker-rebuild-safety]]). Coupling its repo/build to a brand
  new experimental app adds risk for no benefit — the two already deploy as
  fully independent Docker stacks on the same box.
- **Git submodule rejected:** technically the "purest" fit (single source of
  truth, real versioning) but historically fragile in exactly the ways this
  workflow already fights — Windows `ssh.exe` quoting issues, detached-HEAD
  footguns, forgetting `--recurse-submodules` on a fresh clone. Not worth the
  friction tax for a single-maintainer, no-CI/CD, manual-SSH-deploy operation.
- **Vendor-and-sync (chosen):** `pf1core` lives in its own repo with its own
  test suite (the "purity gate" — a test that fails if pf1core code ever
  imports persistence/sockets/poker-specific anything). Both poker and PGM
  keep a **plain, committed copy** of pf1core's files under their own tree
  (poker: `backend/src/pf1core/`; PGM: same relative path). Each app has
  `scripts/sync-pf1core.sh`: clone/pull the pf1core repo, copy its files in,
  commit. Fixing a rules bug = fix in `pf1core` repo → push → run the sync
  script in whichever app(s) need the fix now → commit+push there. Slightly
  more manual than a submodule, but every step is a plain git operation this
  workflow already does reliably, and each app's own repo stays fully
  self-contained (plain `git clone` and go, no submodule gotchas).

## Character creation & party

- **Login:** name + list of existing saves (load or "Create new") — same
  casual, no-password identity pattern as birdquiz.
- **Main character:** name, race, class, token art, ElevenLabs voice, and a
  500-word self-description. Race/class/build validation flows through
  pf1core (`races`, `classes`, `abilityScores`).
- **Support characters:** built the same way (name/race/class/token/voice/
  description) but the player does not control them directly in play. Each
  carries a **follower rating, 1-10**: 1 = acts per their own identity/
  backstory even when it conflicts with the party leader's wishes; 10 =
  falls in line completely. This rating drives two systems: tactical combat
  choices (mirroring poker's heroAI pattern — which target/ability) and the
  LLM's roleplay (does this companion hesitate, object, or pursue their own
  agenda before falling in line, versus just complying).
- **Save/load:** resuming a save restores the full party (main + support
  characters), campaign/world progress, and current location exactly.

## World generation

Two layers working together:

1. **Spatial layer — ported from the donjon.pl algorithm** (source:
   `Downloads\dungeon.pl.txt`, the classic "drow / donjon.bin.sh" random
   dungeon generator). The core algorithm — bitmask grid, room placement
   (packed or scattered), door-opening between rooms (with arch/open/locked/
   trapped/secret/portcullis door types), corridor carving (straight/bent/
   labyrinth bias via recursive tunneling), stair placement, deadend pruning
   — gets ported to JS as a pure room-graph generator (which rooms connect to
   which, via what door type). The original script's GD image-rendering half
   is NOT ported (no GIF output needed) — the pixel-drawing sections
   (`image_dungeon` onward) are reference only, useful later only if a visual
   map for sighted players becomes wanted.
2. **Content layer — d20pfsrd's PF1 encounter tables**
   (https://www.d20pfsrd.com/bestiary/indexes-and-tables/encounter-tables/)
   plus PF1's treasure-by-CR math, keyed by terrain type + party level/CR.
   Populates each room in the generated graph: empty, monster encounter
   (stats from pf1core's `monsters` namespace), treasure, or hazard/trap
   (door-level traps map onto donjon's own trapped/locked/secret door types;
   room-level hazards are a separate table).
3. **The crawl loop:** clear a room → the graph reveals its connected
   neighbor(s) → advance → repeat until the generated area is exhausted →
   generate the next one for the chosen terrain/level. Structurally this is
   the same "sequential clearing" poker's dungeon already does; the
   difference is the room *source* is procedural-generic (by terrain/CR)
   rather than hand-authored, and framed as terrain regions (desert, etc.)
   instead of a fixed dungeon theme.

## LLM GM layer

- Narrates area/room descriptions, roleplays villains/NPCs/support-character
  personalities, and withholds secrets/plot details unless the player makes
  the right check or asks the right question — the original vision.
- **Hard boundary:** mechanical resolution (attack rolls, DCs, damage,
  save-or-suck effects) is decided by pf1core/app-layer code, never the LLM.
  The LLM narrates and roleplays around already-resolved facts; it does not
  adjudicate rules.
- **Model choice — OPEN, needs a real test pass before committing:** two
  candidates already available — the local Ollama box (192.168.1.202, free,
  but unverified for nuanced secret-withholding and personality-consistent
  roleplay at the quality this needs) vs. the OpenRouter key set up this
  session (hosted, costs real money against the $25/week cap, likely
  stronger creative writing). Plan: prompt both with the same "narrate a
  room + roleplay an NPC withholding a secret" test scenario before locking
  in a default; may end up using Ollama for cheap/frequent narration and
  OpenRouter for higher-stakes scenes, TBD.
- **Voice:** ElevenLabs (already wired in poker) synthesizes both the GM's
  narration and each character's dialogue using their chosen voice from
  character creation.

## Persistence & stack

Same proven pattern as birdquiz (Express + better-sqlite3 backend, nginx
serving the static frontend, two-container Docker Compose split, deployed at
`pgm.folkengames.com` via the existing Traefik setup — no Traefik changes
needed, same as every app added this way so far). PGM's SQLite database
holds characters, saves, and campaign/world state; it is its own new DB, NOT
`poker.db` — the only cross-app dependency is read-only access to
`dungeon-content.db` for shared rules content.

## Explicit non-goals for this phase / open questions carried into planning

- Exact save-game data shape (how much world-generation state must be
  serialized to resume mid-area) — implementation-phase detail.
- Donjon port fidelity — full room-size/layout knobs (packed vs scattered,
  corridor straightness, deadend removal %) vs. a simplified fixed-parameter
  version to start. Lean toward porting the full algorithm since it's
  already fully understood and not that much code, but confirm during
  planning.
- Visual dungeon map rendering for sighted players — not in scope now
  (donjon's GD/GIF rendering isn't being ported), but the room-graph data
  structure this design produces would support adding it later without
  rework.
- LLM model final pick (see above) — needs a real test pass.
- Accessibility depth — PGM should inherit the numbered-choice /
  `Narrator.presentChoices` pattern from birdquiz at minimum; whether it
  needs poker-blindMode-level depth (earcons, sacred stop key, etc.) is a
  planning-phase call, not decided here.
- Companion follower-rating exact mechanical formula (how strongly rating
  1-10 weights "own agenda" vs "comply" in both the tactical AI and the LLM
  prompt) — needs concrete design during planning, not just the concept
  locked here.
