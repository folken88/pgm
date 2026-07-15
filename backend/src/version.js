// PGM — the ONE app version (semver). The boot log, /api/version, /api/meta and
// the client topbar all read this. MANDATE (Tobias 2026-07-14, mirroring poker):
//   · bump MINOR for each feature batch, PATCH for fix-only batches
//   · note the change in one line below, newest first, and keep each line short
//   · rewrite HEADLINE with every bump (it is what players see)
//   · every patch-note email to Josh must carry APP + VERSION in the SUBJECT,
//     e.g. "PGM v1.0.0 — patch notes"  (never a bare "Re:")
//   · the player-facing notes go in CHANGELOG.md; this block is the dev log
//
//  1.3.0  2026-07-14 THE DUNGEON'S ACTUAL BLIND CONTROLS — poker's real code, not a re-implementation.
//                    Josh: PGM's keys and narration were "different than the dungeon so that's
//                    disorienting" (A attacked instead of repeating, options read once and couldn't
//                    repeat, "a bunch of sparkles then report what spell"). ROOT CAUSE (Tobias, at
//                    length): PGM had a HAND-WRITTEN blind layer that only approximated poker's, so it
//                    never converged. FIX: transplant poker's ACTUAL dungeon blind layer verbatim —
//                    the 868-line keydown handler (client.js:2028-2895) and the onDungeonState
//                    narration (blindMode.js:1367-1578) — into public/js/dungeon-blind.js, driven by
//                    PGM's snapshot through an adapter (toDungeonState in app.js reshapes publicRun into
//                    poker's dungeon-state; a dungeonAction() shim maps poker's socket verbs onto PGM's
//                    /api/session/action). Frontend-only, no backend change. Now Josh's keys ARE the
//                    dungeon's: 1=attack, 2..N=abilities, spellbook by level, E inspect, F foes, L life,
//                    H party, M money, B buffs, D debuffs, C cantrip, 0 door, Escape session menu —
//                    A repeat / S stop stay global. Narration is poker's exact play-by-play: the turn
//                    earcon + "Your turn. Enemy: X, 80%", emoji-stripped combat lines, big-room
//                    condense, CC-idle collapse, "Room clear. Open the next door." PGM's own duplicate
//                    turn-prompt + "it is X's turn" chatter suppressed in blind mode so nothing doubles.
//                    Verified in real play: keys + narration match poker byte-for-byte. (PGM's coarse
//                    25%-bucket enemy HP is preserved — the one deliberate divergence.) The sighted UI
//                    is untouched. STILL PGM-hand-rolled (not yet poker's): the lobby/create/pub entry
//                    flow, where Josh also gets stranded — that's the next target.
//  1.2.1  2026-07-14 SIGNATURE PRICES NOW COME FROM THE FOUNDRY DB, not from me (Tobias: "pull them
//                    from the original items that inspired these versions, the foundryvtt db has their
//                    original prices"). v1.2.0 priced them on the PF1 enchantment curve plus a
//                    "craft premium for raw lethality" that I invented to stop a 2d10 ×4 rifle costing
//                    315gp. That premium is gone. New formula, all real data:
//                        Foundry base item price  +  masterwork (300)  +  effective bonus² × 2000
//                    Base prices come from the PF1 system packs in pf1-v14-fork (weapons-and-ammo,
//                    technology) — and they solve the gun problem on their own, because Foundry already
//                    knows a Rifle is 5,000gp and a Scimitar is 15gp. No hand-tuning needed.
//                    ALSO FIXED A RAW ERROR the real curve exposed: a weapon must carry a +1 enhancement
//                    BEFORE it can hold any special ability, and abilities stack ON TOP. v1.2.0 floored
//                    the effective bonus at 1, which made keen/holy/flaming cost NOTHING on a rider-only
//                    weapon (a keen blade priced the same as a plain one). Now +1 base, riders above it —
//                    so keen = +2, Redeemer (flaming burst + holy) = +5. holy/unholy given as a NUMBER of
//                    d6 count as that number (Rovadra's holy: 1 = +1, not +2).
//                    Net: +1-equivalents ≈2,300 (a +1 longsword is 2,315), +2 ≈8,300, Ton Bokiri 32,314,
//                    Redeemer 50,350. The rifles carry their 5,000gp Foundry base on top (7,300).
//  1.2.0  2026-07-14 THE MERCHANT + SIGNATURE WEAPONS. Poker's 28 named weapons (pf1data/staples.js
//                    CUSTOM_WEAPONS) come across as pf1core/pf1data/signatures.js and become LOOT —
//                    poker binds each to a character and a human can never pick one; here they drop in
//                    deep hoards (depth 3+, ~2%→10%) and rotate through the shop. weaponOf resolves a
//                    signature key FIRST, so its intrinsic `special` (flaming/holy/keen/frostBurst…)
//                    reaches swing.js and is ALWAYS ON regardless of the +N tier; equipItem routes
//                    through weaponOf instead of rebuilding from WEAPON_BY_NAME, which would have
//                    silently dropped every rider (the See-Invisibility failure mode).
//                    SHOP: staples always (potions, throwables, components, plain/masterwork steel,
//                    +1/+2 gear) PLUS exactly 3 "items of the day" that rotate every 10 min. The
//                    rotation is DERIVED (mulberry32 seeded on floor(epoch/10min)) — no stored state,
//                    so every client/delve/restart inside a window sees the same three; shop_buy
//                    re-checks the window server-side so a stale tab can't buy last window's Redeemer.
//                    PRICING — poker never prices a weapon (riders are free, only the +N tier sells).
//                    That put the Longue Carabine, a 2d10 ×4 rifle with NO magic, at 315g: the best buy
//                    in the shop and cheaper than a +1 longsword. So price = PF1 magic curve
//                    (masterwork + eff²×2000, riders as effective-bonus adders) PLUS a craft premium
//                    for raw lethality (avg damage × crit factor). Cheapest named weapon now 3,815g;
//                    Redeemer 38,615g; Rovadra 42,715g.
//                    UI: a real storefront — featured rail, search, category chips, live countdown to
//                    the next rotation, affordability on every card. Blind-first as always: emoji are
//                    aria-hidden, buy buttons carry the whole card in their accessible name, the stat
//                    line is SPOKEN in words ("2 d 10, crit 20, times 4") while the card shows the
//                    compact glyphs, and Escape is the shop's own action hub (buy each rare piece by
//                    number, read the stock, hear the countdown, leave) so nobody has to Tab the DOM.
//                    AUDIO: while you shop you HEAR the fight through the wall — poker's through-the-
//                    floor treatment (Web Audio lowpass ~378Hz, half volume), the same filter the poker
//                    table uses to hear the dungeon below.
//  1.1.1  2026-07-14 TESTS + a latent room-state leak, on top of 1.1.0. The seeing/invisibility work
//                    shipped UNTESTED, so it gets a suite now (7 cases, written independently against
//                    poker's spec and passing against 1.1.0's implementation — a real cross-check):
//                    the spells exist with the right flags & casters; See Invisibility removes the
//                    concealment miss ENTIRELY but leaves mirror image intact while True Seeing
//                    pierces both (the RAW distinction — the thing most likely to silently regress);
//                    the purge strips ALLIES, sets the room flag, refuses a hero's invisibility, and
//                    expires at the next door. LATENT BUG: spawnRoom cleared `invisPurged` but not
//                    `blackTentacles` — PGM's shim outlives the room and only ever set the tentacle
//                    field in its constructor, so a Black Tentacles cast FOLLOWED THE PARTY
//                    DOWNSTAIRS for the rest of the delve. Poker clears both at the same door.
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
const VERSION = '1.3.0';
const HEADLINE = 'The dungeon controls are the real thing now. Josh — the keys and the spoken play-by-play in a delve are no longer an imitation of the poker dungeon; they ARE its own controls, transplanted whole. Same 1-to-attack, same spellbook, same Your-turn readout, same everything. Hard refresh.';
module.exports = { VERSION, HEADLINE };
