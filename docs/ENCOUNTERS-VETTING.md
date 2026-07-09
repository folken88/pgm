# PGM Encounter Vetting Ledger (Creatures)

**Living document — maintained continuously.** Tracks which PF1 creatures PGM can
actually run as encounters. Companion ledger: `ITEMS-VETTING.md` (treasure) —
same status model, same diversion approach.

## Governing rule — vetting-gated generation with diversion

PGM rolls encounters on the **real PF1 terrain × CR/APL encounter tables**, so the
intended difficulty curve is preserved. But **any rolled creature that is not
VETTED is diverted to the nearest vetted creature** — the game never actually
spawns a monster the engine can't stat, act, or resolve combat for.

**Creature diversion order (rolled creature is UNVETTED/IGNORED):**
1. Substitute a **VETTED creature of the same CR**, preferring the same
   type/terrain (e.g. unvetted CR 2 animal → a vetted CR 2 animal).
2. If none at that exact CR, substitute the **nearest-CR VETTED creature**
   (prefer rounding down to avoid spiking difficulty), same type/terrain where
   possible.
3. Unlike treasure, creatures have **no trivial universal fallback** — so PGM
   must keep a **minimal vetted roster covering every CR band it will generate.**
   Early game (low CR) therefore needs at least one vetted creature per low CR.
   Log every diversion so thin CR bands surface as vetting priorities.

## Statuses (same as the item ledger)

- **VETTED** — PGM can fully run this creature: stats resolve (from pf1core
  `monsters` + `dungeon-content.db`), it can take combat actions (attack/AC/
  save math), and any special abilities it relies on are implemented. Eligible to
  be rolled/diverted into as an encounter.
- **UNVETTED** — a valid PF1 creature we recognize but **cannot yet run** (stats
  or abilities not wired up). The backlog we promote from and divert away from.
- **IGNORED** — considered but deliberately set aside for now, with a reason.

## Promotion rule (UNVETTED → VETTED)

Promote a creature only when all hold, recording the enabling mechanism:
1. **Stattable** — its stat block resolves in PGM (HD/BAB/saves/AC/attacks/CR),
   sourced from pf1core `monsters` / `dungeon-content.db`.
2. **Actable** — it can choose and take actions in PGM's combat loop (at minimum
   a basic attack; special movement/abilities as those mechanisms land).
3. **Resolvable** — every ability it will actually use in-game is implemented and
   tested (per the enemy-parity principle — enemies should eventually do what
   heroes can).

---

## VETTED

Mechanism: **v0 app-layer combat resolver** (basic melee attack — stat block
resolves, creature attacks the hero each round, combat resolves to a terminal
state). Stats in `backend/src/content.js`.

| Creature | CR | Notes |
|---|---|---|
| kobold | 1/4 | spear |
| goblin | 1/3 | short sword |
| dire rat | 1/3 | bite |
| skeleton | 1/3 | claw (undead) |
| zombie | 1/2 | slam (undead, tough) |
| giant centipede | 1/2 | bite — *poison rider not yet implemented* |
| giant ant | 1/2 | bite |
| stirge | 1/2 | proboscis — *blood-drain rider not yet implemented* |
| wolf | 1 | bite — *trip rider not yet implemented* |
| giant frog | 1 | bite — *pull rider not yet implemented* |
| goblin dog | 1 | bite |
| **giant spider** | 1 | bite — **SNEAKY (Stealth DC 19)**, exercises the perception/flat-footed system |

All VETTED 2026-07-09. Mechanism: v0 party-combat resolver (basic attack +
initiative + the perception/stealth-DC reveal). **Special riders** (poison, trip,
blood drain, pull, etc.) are simplified to a basic attack for now — creatures are
runnable; enrich riders as those subsystems land. Stats in `backend/src/content.js`.

_These cover the CR ⅛–1 band well for early play. Next: CR 1–4, and implementing
the special riders + more sneaky/ambush foes._

---

## UNVETTED — valid PF1, not yet runnable

The backlog is effectively the **entire PF1 bestiary** (pf1core `monsters` +
`dungeon-content.db`); creatures graduate individually as their stats/abilities
are wired up. Rather than enumerate thousands here, we track **what's needed per
CR band to keep diversion healthy** and list creatures actively being considered.

### Low CR bands to fill first (for v0 / early play)
- CR ⅛ – 1: at least one vetted creature each (basic attackers — e.g. common
  animals, low humanoids, goblinoids). _Priority: enables v0 + early diversion._
- CR 2 – 4: at least one vetted creature per CR.
- (Higher bands filled as play scales.)

### Actively considered
_(none yet — add creatures here when we start vetting specific stat blocks.)_

---

## IGNORED — considered, set aside for now

_None yet._

_Likely early candidates to discuss (mechanics out of proportion to near-term
value) — NOT yet decided, listed only as talking points:_
- _Spellcaster creatures with large spell lists (until the enemy spell system is
  broad enough — ties to the spell-conformance work)_
- _Swarms (need swarm mechanics)_
- _Incorporeal / regeneration / on-death-effect creatures (need those subsystems)_
- _Templated / advanced creatures (need the template layer)_
