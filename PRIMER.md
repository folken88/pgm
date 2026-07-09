# Personal Game Master (PGM) — Primer for picking this project up

Read this first in a new session. **Status update 2026-07-09:** kickoff is done
and the FOUNDATION is built — pf1core Phase 1 (rules data + `character.js`
derivation) is extracted, tested, pushed, and vendored into PGM (PGM derives
characters through it). The v0 app itself (server, character-creation UI, room,
combat, narrator, blind-mode + push-to-talk) is the next build. Two design
decisions changed the shape since this primer was first written — see the v0
design spec `docs/superpowers/specs/2026-07-09-pgm-v0-design.md`:
  1. **PGM is now real-time MULTIPLAYER** (humans + AI companions in shared runs,
     named/persistent parties, PF1 treasure economy) — revises the old "solo"
     framing throughout this primer and the original design spec.
  2. **Content is vetting-gated with diversion** — PGM rolls on real PF1
     encounter/treasure tables but diverts any unvetted creature/item to the
     nearest vetted equivalent, so it never generates something it can't run.
     Ledgers: `docs/ITEMS-VETTING.md`, `docs/ENCOUNTERS-VETTING.md` (maintained
     continuously).
The rest of this doc is still the map to reference material; treat its "solo"
language as superseded by the multiplayer decision above.

## What this is

A solo, PF1-authentic procedural dungeon crawl at **pgm.folkengames.com**:
build a character (+ AI-controlled support characters), then endlessly
generate and clear procedural areas (rooms, monsters, treasure, hazards)
scaled to your level, narrated and roleplayed by an LLM game master.

**Full design:** `docs/superpowers/specs/2026-07-09-personal-game-master-design.md`
in this repo — read it before writing any code. It covers character
creation, the party/follower-rating mechanic, world generation (two layers:
a ported dungeon-layout algorithm + terrain/CR encounter tables), the LLM GM
layer, persistence, and deployment. This file is the map to everything
*around* that spec — where the reference material lives, what already
exists to build from, and what to do first.

## Why this exists — read this before touching poker's code

This is not a from-scratch idea. The poker codebase has been explicitly
preparing for this exact app since 2026-07-04. Read, in this order:
1. `poker-architecture-plan.md` and `pf1core-plan` — memory files (auto-loaded
   in Claude sessions that touch poker or PGM).
2. `Documents\poker game\PF1CORE-PLAN.md` — the actual mandate document.
   Its own words: *"fix Dispel Magic once, both apps get it."*
3. `/mnt/fast/apps/stacks/poker/backend/src/pf1core/index.js` on the TrueNAS
   server — the façade that already exists, with a comment literally saying
   "Step 2 (at PGM kickoff): the files physically move under pf1core/." This
   session (2026-07-09) IS that kickoff.

## Where everything lives

- **This repo (PGM app):** `C:\Users\Tobias Merriman\Documents\pgm\` locally,
  `https://github.com/folken88/pgm` (public, empty as of 2026-07-09).
- **The shared rules engine repo:** `https://github.com/folken88/pf1core`
  (public, empty as of 2026-07-09) — see "pf1core sharing" below. Clone it
  alongside this repo.
- **Poker's live code** (source of the rules engine to extract from):
  `/mnt/fast/apps/stacks/poker/backend/src/` on the TrueNAS
  (`192.168.1.200`) — see `poker-dungeon-map.md` memory /
  `Documents\_truenas_build\POKER-DUNGEON-MAP.md` for the full file map.
  The relevant namespaces already live under `pf1data/` and `game/character.js`
  + `game/combat.js`, all imported through `pf1core/index.js`.
- **The donjon dungeon-layout algorithm** (reference for the spatial
  generation layer): `C:\Users\Tobias Merriman\Downloads\dungeon.pl.txt` —
  a Perl script, the classic "drow / donjon.bin.sh" random dungeon
  generator. Port the room/door/corridor/stair algorithm (lines ~160-1010);
  ignore the GD/GIF image-rendering half (lines ~1010+) — not needed, no
  visual map planned for this phase.
- **Encounter table source:** https://www.d20pfsrd.com/bestiary/indexes-and-tables/encounter-tables/
  — terrain × level encounter tables to adapt for the content-population
  layer (what goes IN each generated room).
- **Shared rules content DB:** `dungeon-content.db` at
  `/mnt/fast/apps/stacks/poker/backend/data/dungeon-content.db` — read-only
  for PGM (spells/monsters/classes). See `dungeon-content-db.md` memory for
  its schema and the content-adaptation pipeline.
- **SSH access, sudo password, deploy conventions:** identical to poker/
  birdquiz — see `poker-deploy-ops.md` memory (SSH key path, `sudo -S -k`,
  git push credential workaround, TrueNAS stack directory conventions).

## pf1core sharing — the decision, and what "kickoff" actually means

**Locked (see the design spec for full reasoning): a dedicated `pf1core`
repo, consumed by both poker and PGM via a vendor-and-sync script — not a
git submodule, not a merged monorepo.**

Concretely, the pf1core "physical move" (mentioned in the poker façade's own
comment) works like this:
1. The pure rules files currently under `poker/backend/src/pf1data/*`,
   `poker/backend/src/game/character.js`, and `poker/backend/src/game/combat.js`
   get copied (not moved-and-broken — poker must keep working) into the new
   `pf1core` repo, restructured behind its own `index.js` (mirroring the
   namespace list already in poker's façade comment: abilities, feats,
   classes, races, domains, monsters, weapons, xp, abilityScores, loadouts,
   profiles, character, combat).
2. pf1core gets its own test suite — the "purity gate": a test that fails if
   any pf1core file ever imports persistence/sockets/poker-specific anything.
3. Both poker and PGM get a `scripts/sync-pf1core.sh`: clone/pull the
   `pf1core` repo, copy its files into their own `backend/src/pf1core/`
   (poker) or equivalent path (PGM), commit the vendored copy as regular
   tracked files.
4. Poker's `backend/src/pf1core/index.js` becomes real (currently it
   `require()`s the old `pf1data/*` paths directly — once the physical move
   happens, it requires the vendored-in files instead). This is a mechanical
   refactor in poker, low risk, but still gated by poker's deploy-safety rule
   (only rebuild/redeploy poker when no humans are at the table or in the
   dungeon — see `poker-rebuild-safety.md` memory).
5. Fixing a rules bug going forward: fix in the `pf1core` repo → push →
   run the sync script in whichever app(s) need the fix → commit+push there.

**This physical move (steps 1-4) is real, non-trivial work and should be its
own early implementation-plan phase** — don't build PGM's app-layer against
a stale copy-paste of poker's rules files; do the extraction first so PGM
starts consuming the real shared package from day one.

## Party model — the one non-obvious mechanic to get right

Support characters are built the same way as the main character (name/race/
class/token/voice/500-word description) but the player never controls them
directly. Each carries a **follower rating, 1-10**: 1 = acts per their own
identity/backstory even against the party leader's wishes; 10 = falls in
line completely. This rating feeds BOTH the tactical combat AI (which
target/ability a companion picks) AND the LLM's roleplay (whether a
companion hesitates/objects/pursues their own agenda before complying). The
exact mechanical formula for how strongly the rating weights each system is
explicitly left open in the design spec — needs real design work during
planning, not just the concept.

## Deployment — same proven pattern, no new plumbing needed

Mirrors birdquiz exactly: Express + better-sqlite3 backend, nginx serving
the static frontend, two-container Docker Compose, deployed at
`pgm.folkengames.com`. Traefik already needs zero changes for a *new*
subdomain the same way it didn't for birdquiz's cutover — confirm DNS/
Traefik routing for `pgm.folkengames.com` exists or needs adding (unlike
birdquiz, which replaced an existing route, this is a genuinely new
subdomain — check this explicitly, don't assume).

## Suggested first steps for a fresh implementation session

1. Read the design spec in full.
2. Do the pf1core extraction (steps 1-4 above) — this unblocks everything else
   and is the one piece that touches poker's live code, so get it done and
   verified (poker's test suite green, poker still deploys/runs fine) before
   building anything PGM-specific.
3. Scaffold PGM itself (package.json, Dockerfile, compose, nginx config —
   copy birdquiz's as the template, it's the most recently proven version of
   this exact pattern).
4. Port the donjon room-generation algorithm to JS as a standalone, testable
   module before wiring it into anything else — it's pure logic, easy to
   unit-test in isolation (seed in, room graph out).
5. Build character creation (the more mechanical, less risky piece) before
   the LLM narration layer (the more novel, needs-real-testing piece).
6. Test the LLM model choice (Ollama vs. OpenRouter) with a real narration+
   secret-withholding scenario before committing to a default — see the
   design spec's open question on this.
