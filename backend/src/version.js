// PGM — the ONE app version (semver). The boot log, /api/version, /api/meta and
// the client topbar all read this. MANDATE (Tobias 2026-07-14, mirroring poker):
//   · bump MINOR for each feature batch, PATCH for fix-only batches
//   · note the change in one line below, newest first, and keep each line short
//   · rewrite HEADLINE with every bump (it is what players see)
//   · every patch-note email to Josh must carry APP + VERSION in the SUBJECT,
//     e.g. "PGM v1.0.0 — patch notes"  (never a bare "Re:")
//   · the player-facing notes go in CHANGELOG.md; this block is the dev log
//
//  1.1.0  2026-07-14 SEEING & INVISIBILITY — poker parity for the whole unseen/illusion system, which
//                    PGM had essentially NOT implemented. Before: the shim's _targetableParty/
//                    _targetableEnemies never filtered `invisible` at all, so going unseen did NOTHING
//                    for either side; swing.js still had poker's OLD single guard (no See-Invisibility
//                    tier); makeenemy.js never copied the `trueSeeing` flag, so the Erinyes' true-sight
//                    was dead. Now: an invisible foe can't be targeted unless somebody can pierce it
//                    (darkvision / blindsense / See Invisibility / True Seeing); an invisible HERO can't
//                    be targeted unless the foe is a TRUE SEER (the Erinyes), whose arrows also see
//                    through Mirror Image and Displacement; and _swingVsAC now splits the two tiers —
//                    See Invisibility beats the invisibility concealment miss, only True Seeing/blindsense
//                    also beats an ILLUSION. New spells: SEE INVISIBILITY (2nd — wizard 3, sorcerer/magus/
//                    inquisitor 4, bard 7) and INVISIBILITY PURGE (3rd — cleric 5, inquisitor 7), which
//                    does NOT discriminate: it strips invisibility from EVERY creature in the room, your
//                    own allies included, and nothing on either side can vanish again that room.
//  1.0.0  2026-07-14 VERSIONING FORMALIZED — PGM now has a version, a dev log and a player-facing
//                    CHANGELOG.md, so Josh, Tobias and I can all point at the same build. Shipped with
//                    it: BLIND PARITY WITH POKER (Josh's "not close to poker-dungeon" report). Root
//                    cause — PGM made a screen-reader user TAB the live DOM, and every SSE re-render
//                    strands the VoiceOver cursor; poker never does that, it drives off STABLE HOTKEYS
//                    + speech. So ESCAPE is now a context-aware ACTION HUB: it speaks a numbered menu of
//                    exactly what this screen can do (Landing → start a delve / join each active one;
//                    Lobby → "Start the adventure" as item 1 — the button he could not find; Pub → set
//                    out again; Dungeon → open the next door / shop / retreat / main menu). Also: the
//                    narrator strips emoji instead of reading them as garbage, A = repeat last report
//                    (his poker muscle memory), every screen has a repeatable spoken guide instead of a
//                    one-time key flood, H reports the lobby roster, and card/roster icons are
//                    aria-hidden. Earlier the same day: icon labels spoken on cycle, race/class changes
//                    announced, Enter in avatar search no longer skips to skills, delves are joinable.
//                    Also in this build: HELP MODE was a DEAD END (the learn-mode guard ran before the
//                    '?' toggle, so '?' and Escape only described themselves — '?' now toggles first,
//                    Escape is a second exit); SPACEBAR is no longer stolen from VoiceOver (push-to-talk
//                    preventDefault'd every Space, killing VO+Space and Space-on-a-button — it now grabs
//                    only a BARE space on a non-actionable target). Plus a poker sync (v3.37.51):
//                    See Invisibility / Invisibility Purge handlers + an enemy re-invis lockout.
//
// ---- pre-1.0, reconstructed from git history (the unversioned era) ----
//  0.9.x  2026-07-13 FEATURE BATCH: in-dungeon Shop (buy items; "Shopping" auto-skips your turns so the
//                    dungeon flows on) · sell anything for 50% into the party purse · AI companions
//                    auto-claim party loot no human took · AI/enemy turns take a 1–2s deliberation delay
//                    (streamed over SSE) instead of resolving instantly · 14 room archetypes × phrasings
//                    × sensory details, depth-scaled · health + XP bars on cards, enemy HP as a bar in
//                    25% buckets with no numbers · click a pack item to use it · hero token picker (a
//                    wide gallery of Tobias's own art) · Raise Dead moved onto the dead member's card
//                    with its cost + the Breath of Life sound · combat banter · delete-delve (owner
//                    confirms; localhost admin path) · navigation buttons + landing-overlap fix.
//  0.8.x  2026-07-12 PROGRESSION OVERHAUL: fair foes, PF1 leveling, clear/skill/treasure XP · free-action
//                    toggles (Rage, Power Attack, Mage Armor, Overland Flight) cost no turn · the poker
//                    action bar ported (Melee/Ranged, ability buttons, Spellbook) · off-turn action queue
//                    · dev backdoor (play every function by command) · darkwood theme.
//  0.7.x  2026-07-11 THE FOUNDATION: player accounts that remember you · savable/resumable delves · TPK
//                    graves + corpse recovery · the Swashgoblin (the pub between delves) · PF1 death
//                    model (dying to −CON, negative levels) · PF1 RAW treasure tables · party loot ·
//                    players roll their own initiative · LLM combat banter in the companions' voices.
//  0.1–0.6 ≤2026-07-10 the unversioned bring-up (see git history): the poker-dungeon rules engine
//                    transplanted behind a shim, the blind-first frontend, SSE, and the first delves.
//
// HEADLINE — a very succinct (one or two sentence) PLAYER-FACING summary of the LATEST version.
// Rewrite it with every bump; keep it short.
const VERSION = '1.1.0';
const HEADLINE = 'Going invisible finally MEANS something — for you and for them. Vanish and most foes cannot touch you, but the Erinyes see straight through it. New spells: See Invisibility, and Invisibility Purge, which spares no one — it strips your own rogue right along with the enemy.';
module.exports = { VERSION, HEADLINE };
