# PF1 Engine Extraction — poker dungeon → pf1core → PGM

**Date:** 2026-07-09 · **Mandate (Tobias):** "we need everything PF1 related from
poker dungeon, then we're going to build from there" — ALL of poker-dungeon's PF1
mechanics come into the shared engine, PGM consumes them + adds its own systems
(multiplayer delves, perception/stealth, vetting-gated generation, skills, LLM GM),
and poker eventually consumes the same core ("fix Dispel Magic once, both get it").

**Source of truth surveyed:** shallow clone at `Documents\_pf1core_src\poker\backend\src`
(4 parallel survey agents, 2026-07-09). Poker's own PF1CORE-PLAN.md already locked
this direction; the `// PF1CORE:` breadcrumbs exist in abilities.js/enemyAI.js headers.

---

## The inventory (what exists in poker, classified)

### Sizes
| File | Lines/size | Role |
|---|---|---|
| `game/Dungeon.js` | 2,167 | orchestrator + turn loop + condition ticks + attack/death math (interleaved) |
| `game/dungeon/abilities.js` | ~2,960 (210 KB) | THE spell/ability resolution engine (55 `_ab*` handlers + pure math helpers) |
| `game/dungeon/enemyAI.js` | 828 | villain brain (CMB maneuvers, caster AI `_lichCast`, metamagic) |
| `game/dungeon/heroAI.js` | 859 | hero-bot brain (`_botAbility` ~580-line decision tree, `_botStance`, `_preferredFoe`) |
| `game/dungeon/summons.js` | 95 | summon creation (count/duration/kind); turn behavior in Dungeon.js 865-883 |
| `game/dungeon/loot.js` | 14 KB | CR→treasure tables + poker roll-off/hock economy |
| `game/dungeon/serialize.js` | 30 KB | view layer (poker-only) |
| `game/combat.js` | 253 | mixed: pure swing/AC/gear math + poker SND sound pools |
| `game/character.js` | ~120 | PURE (already in pf1core Phase 1) |

### PURE — lift nearly verbatim (Phase A)
- **Spell math** (abilities.js): `_spellDC` L693 (10+slvl+castMod+feats+synthesis, theurge dual-stat), `_saveVs` L824 (nat 20/1), `_enemySave` L915 (Will≈avg(fort,ref); prayed/sickened/slow penalties), `_srBlocks`/`_srBlocksHero` L710/722 (d20+CL+spellPen ≥ SR, no auto 20/1), `_spellToHit` L736 (BAB+castStat house rule), `_spellDice` L796 (level scaling + Intensify), `_rollSpell` L809 (Empower/Maximize), metamagic helpers `_spontMM/_mmForCast/_mmAdjust/_slotLevelFor` L748-793, `_enemyAC` L853 (touch/flat-footed/prone/stunned/slowed/blinded/fly mods), theurge slot split `_splitTheurgeSlots/_slotAvail/_spendSlot` L485-506, `_inspireBonus`, `_dispelCheck/_enemyCL` L1460-68.
- **Condition semantics** (spread over 4 files — consolidate into ONE new module): `ccd()` Dungeon.js L79; per-condition deltas: sickened(−2 atk/dmg/saves), nauseated(skip), blinded(−4 hit/−2 AC/deny Dex), paralyzed+heldDC(Will re-save), slowed/staggered(1 action,−1 hit/AC/Ref), grappled(−2 hit/+2 to-be-hit/concentration DC=10+CMB+slvl), prone(±4 melee/ranged, stand=move), stunned(−2 AC, skip), asleep/fascinated(skip, hit breaks), charmed, dominated(Will re-save), darkened, prayed(−1), flatFooted. Flags identical on heroes & enemies → one shared schema.
- **Protections**: `_spellWorksOn` L1715 (mind-immune/undead/construct/outsiders-only/humanoids-only/SR ceiling), `_isHumanoid` L1748, `_physDR`/`_drDesc` L1799/1816 (DR bypass by S/P/B/magic/material).
- **Save/AC formulas**: `_partySaveMod` L1409, `_hasteMod`, `_acPenalty/_acBonus/_acOf` L1412-1441.
- **Initiative formula**: d20 + 2 + floor(level/2) + Improved Init (Dungeon.js L842/L468).
- **Death/dying thresholds**: −10 death, dying/bleed-out, orc Ferocity (`_dmgToMember` L1756 area — thresholds only; XP/gear-loss penalty = poker economy).
- **Treasure-by-CR** (loot.js): `lootForCR` L23 (drop % + max tier by CR), `rollLootTier` L32, `potionForCR` L38.
- **combat.js pure parts**: `acOf` L119, `totalMagicBonus` L66, `weaponOf` stat derivation L74 (minus atkSound/isDagger), dice `dRoll/dRollN/pick`. ⚠ These read poker's "gear-tier blob" ({weapon:N,...}, tier=enhancement) — port with that input shape documented; PGM adapts its gear to it.
- **Spell/kit DATA**: already in pf1core Phase 1 (`pf1data/abilities.js` 72 SPELL entries + slot tables + `kits.generated.js` 357 entries/17 classes).

### MIXED — needs compute/narrate split (Phase B, the bulk)
- **The 55 `_ab*` effect handlers** (abilities.js): `_abAoe` L1177, `_abBolt` L1158, `_abRays` L1265, `_abMissile` L1246, `_abDisintegrate` L1224, `_abTouch` L1974, `_abHeal` L2160, `_abChannelNeg`, `_abRevive` L1737, `_abBuff` L2368, `_abHaste`, `_abForm` (Wild Shape) L510, `_abMirrorImage`, `_abSaveDebuff` L1959, `_abSleep`, `_abSlow`, `_abGlitterdust`, `_abGrease`, `_abBlackTentacles` L1636, `_abSaveDie` L1660, `_abCharm` L1947, `_abDominate` L1870, `_abMassCharm`, `_abSummon`, `_abCleanse` (dispel) L1493, `_abSpellstrike` L1298, `_abPrismatic` L1842… Math is pure per-line but `_note`/`_echoToTable` is inlined — each becomes a pure `resolve() → result object {damage, saved, srBlocked, conditions[], heal, log[]}` in core + a thin app narrator.
- **`_useAbility` dispatcher** L164-416: gate cascade (charAllows/loadout/minLevel/cost + targeting refusals + concentration-while-grappled DC=10+CMB+slvl) is rules; the socket toasts/banter/db reads are app.
- **`_swingVsAC`** Dungeon.js L1471-1710: THE hero attack resolver — BAB iteratives, crit confirm, Smite/Bane/Sneak/Studied/Challenge dice, weapon-special arcana (flaming/holy/keen/shock/frost), flanking. Interleaved with narration; extract as pure attack pipeline.
- **`_advanceToActor`** Dungeon.js L854-1103: condition tick/enforcement (re-saves, grapple escape CMB vs CMD, DoT, stand-from-prone) — extract as a pure `tickConditions(combatant) → {skip, events[]}`.
- **`resolveSwing/resolveSpell/resolveRay`** (combat.js): split math from `sound=pick(SND.*)`. resolveRay's `roll<5` miss is fudged — replace with real touch-attack math in core.
- **`staples.js`**: PF1 stat mapping → core; atkSound + dropdown curation + CUSTOM_WEAPONS (signature weapons) stay poker-only (decision already locked: PGM never sees signature weapons).

### PORTABLE POLICY (Phase C, adapt not copy)
- **heroAI `_botAbility`/`_botStance`/`_preferredFoe`**: the priority ladder (revive→heal-by-severity→dispel-worthiness→control-first→buff-decay→blast; Power-Attack hysteresis needs≤14/≥16; DR-aware targeting; sneak-prey casters>boss>lowestHP) — port the STRUCTURE, strip named-character hooks (azwraith/gweyir/celeb) into data-driven per-actor hooks.
- **enemyAI `_enemyAct`/`_pickEnemyManeuver`/`_lichCast`**: action economy (move+standard vs full attack), weighted maneuver menu (grapple/trip/bullrush via CMB vs CMD), caster brain (self-buff→hold→missile-finish→AoE-on-cluster→nuke-caster-first), metamagic use.
- **summons**: count (1d4+1/1d3/N), duration ≈ caster level (min 3), splice into initiative at caster's spot, act immediately, crumble at expiry.

### POKER-ONLY (leave behind)
Sockets/`_broadcast`/`io`, `_note`/TTS/blind-mode narration, `_tryBanter`/Discord, SND
sound pools + audio paths, bankroll/gold/Abadar-debt/hock economy, loot roll-off UI,
`serialize.js`, death→gear/XP-loss penalties, named-character hooks, `_computeCastable`'s
persistence reads (PGM substitutes its own known/prepared source).

---

## Phases

- **Phase A — lift the pure math (NOW):** new pf1core `rules/` modules: `spellmath.js`,
  `conditions.js` (the consolidated module poker never had), `protections.js`,
  `treasure.js` (+ later `gearmath.js` from combat.js). Tests for each. Push, sync to PGM.
- **Phase B — pure resolution layer in pf1core:** result-object engine: `resolveAttack`
  (iteratives/crit/specials/DR), `resolveAbility` dispatcher + per-effect-family resolvers
  (aoe, ray/touch, missile, heal, buff, save-debuff, save-die, charm/dominate, summon,
  dispel, spellstrike), `tickConditions`. Each handler's compute half moves here; narration
  becomes app-side consumption of `result.log[]`. Biggest work item — do it family-by-family
  with tests, PGM adopting each family as it lands (so casters start casting early).
- **Phase C — PGM adopts fully:** partyrun.js swaps to the pf1core engine (slots/prepared
  lists via PGM's DB, conditions in the UI/narrator, tactical AI policies for companions +
  enemies, summons in initiative). PGM's additions (perception/stealth, vetting diversion,
  multiplayer turn-gating) layer on top — they're app-layer and stay.
- **Phase D — poker switches (deploy-safety gated):** poker's mixins re-point their math to
  pf1core; behavior identical; never rebuild while players are active.

**Vetting interplay:** as each effect family lands in PGM, the spells it powers get vetted
in `docs/ITEMS-VETTING.md`-style ledger entries (a vetted spell = castable + resolvable).

---

## STANDING PRINCIPLE (Tobias 2026-07-10): WHEN IN DOUBT, USE PF1 RAW.
PF1 is open source (OGL) and proven — any mechanic question without explicit
guidance defaults to the real Pathfinder 1e rule, not an invented simplification.
Existing simplifications (thrown-alchemical auto-hit, Will≈avg(fort,ref), etc.)
are debt to be paid back toward RAW, not precedent.

## TOBIAS DIRECTIVE 2026-07-09 (course correction — supersedes family-by-family pacing)

**"This game should already do everything poker dungeon can do in the dungeon, then we
add the PGM features to that. Get the poker-dungeon and remove the poker."** Wholesale
adoption of the poker dungeon experience is the BASELINE, not the destination. Work list
(his exact asks):

1. **AI companions = the poker AI heroes** (the authored cast in `pf1data/characterBuilds.js`
   + their kits + the heroAI brain) brought over **exactly as they are** — plus PGM
   additions: skill points, they accompany human players, can be GIVEN treasure, USE
   items given to them, and SPEAK with the party leader via chat + their ElevenLabs
   voices (poker's `character_voices`). NOTE: signature weapons still poker-only —
   in PGM the cast uses found/basic gear (locked earlier).
2. **CRITICAL a11y bug: the GM voice (Ultron — Tobias calls the narrator "Gaspar") must
   NEVER talk over the blind-mode TTS.** All audio must serialize through one queue —
   GM lines and access-TTS may never overlap, or the blind player gets word salad.
3. **Spot-line accuracy + prose**: "You spot: giant centipede, goblin" reported a
   creature that wasn't there (1 creature in the room). Perception narration must be
   derived from the SAME list the UI/targets use, grouped naturally ("a giant centipede
   and a goblin — they look up as one, menacing") conveying allied+aggressive, THEN
   initiative. Consistency and accuracy are the requirement.
4. **Full text logs of every delve** (server-side, persistent) for analysis &
   troubleshooting.
5. **Left side panel = party status panel** for sighted players; blind players can
   navigate it piece by piece.
6. **Retreat button** (party retreats from the delve).
7. **Sound effects from poker-dungeon** for attacks/spells/buffs — copy the audio
   library + wire SND-style pools to combat/cast events.

Priority order agreed with the deploy state (testers live at pgm.folkengames.com):
audio-collision fix → spot accuracy → delve logs → retreat → sounds → party panel →
poker cast companions (with voices/chat) → remaining Phase B families ride along.
[Items 1-4 SHIPPED to prod 2026-07-09.]

### THE PARITY MILESTONE (Tobias 2026-07-09): report when PGM ≥ poker-dungeon's PF1 sim.
Canonical GAME-SCREEN LAYOUT (build exactly this):
- LEFT: party status panel (per-hero: HP/AC/conditions/slots; blind-navigable
  piece by piece — P key browse).
- RIGHT: party inventory & treasure (gold, bag, equip/give actions).
- MIDDLE (like poker-dungeon): ENEMIES across the top, ALLIES just under, both
  ordered by INITIATIVE left→right; action buttons; a CHAT PROMPT (ask questions
  or play via chat commands); a PUSH-TO-TALK button (talk to the LLM to control
  play — voice for everyone, not just blind mode).
Parity checklist vs poker dungeon still open: sounds (SND pools), poker cast as
AI companions (kits/heroAI/11labs voices/chat), summons, charm/dominate, sleep/
grease/control, dispel, savedie, rays, spellstrike, stances+Rage, full attack
pipeline (_swingVsAC iteratives/crit/arcana), maneuvers (grapple/trip/bullrush),
XP/leveling (started — pacing checked, not yet wired), boss/ward mechanics,
enemy casters, Mirror Image/Displacement defenses, LLM GM Q&A via chat/PTT.
