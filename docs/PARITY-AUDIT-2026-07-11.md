# Poker-Dungeon ↔ PGM Full Parity Audit — 2026-07-11

Four-way audit: poker dungeon mechanics, poker dungeon UI, poker blind accessibility
(all from the current repo, v3.37.38), diffed against PGM as deployed today.
Poker refs: `_pf1core_src/poker/…` — `D` = backend/src/game/Dungeon.js,
`CL` = public/js/client.js, `BM` = public/js/blindMode.js.
PGM refs: `pr` = backend/src/partyrun.js, `app` = public/js/app.js,
`bm` = public/js/blindmode.js.

Legend: ✅ parity (verbatim or equivalent) · 🟡 partial / divergent · ❌ missing in PGM · ➕ PGM-only (poker lacks it)

---

## 1. GAME MECHANICS

### Combat core — mostly ✅ (verbatim transplant)
- ✅ Swing pipeline (BAB/iteratives/TWF/crit confirm/flank/sneak/touch/reach-AoO/riders) — swing.js verbatim.
- ✅ Enemy villain brain `_enemyAct` (maneuvers, healer, hold, shout, taunt, riposte, lich AI, breath, detonate) — enemyAI.js verbatim.
- ✅ Hero bot brain `_allyAct` (heal thresholds, buff decay, CR calculus, signature routines) — heroAI.js verbatim.
- ✅ 433/433 kit abilities, cost model free/pool/slot/room/run, char-gating, dispel, wards, summons both sides, domination, boss advancement +2-4 (makeenemy.js verbatim).
- ✅ Condition tick engine (held re-save, grapple escape, bleed, acid, nausea, slow, darkness…) — pf1core tick.js.
- 🟡 Black Tentacles re-grab tick + Spiritual Weapon turn-start strike + dominated tick live in poker's turn loop (D:986,1029), noted as not ported into PGM's tick engine (tick.js:8-9 comment).
- 🟡 Initiative formula: poker = d20 +2 +½level (+Imp Init +Foolhardy Rush) (D:842-850); PGM = d20+initMod (pr:158). Neither is PF1 RAW (dex+feats); flag under the RAW principle.
- ❌ **Action-economy shortcut**: poker melee vs NEW target = move+standard (1 attack), SAME target = full attack; ranged always full (abilities.js:2836-2858, enemy parity enemyAI.js:219). PGM always grants full iteratives (pr:468-484). Real balance divergence — enemies got their parity in poker, PGM heroes hit harder than poker's.
- ❌ **Action QUEUE**: poker lets you pre-load an action off-turn (last-pick-wins, inherits aim, ⏳ chip) (D:2005-2027). PGM refuses off-turn actions.
- ❌ **AFK auto-attack** after 60s (D:1112-1133). PGM: an idle human stalls the whole party forever — multiplayer-critical.
- ❌ Free/swift economy surfaced (one swift/turn shared) is in transplanted abilities, but PGM never exposes the swift users (Quicken metamagic etc.) in UI.
- ❌ Luck-domain reroll, domain granted powers pickers — engine has them; no UI/route (see §2 caster UX).

### Room / progression
- ✅ Boss every 5th depth, boss+minions, elite-ish top-3 CR pick (pr:109-119).
- ❌ **Gang/theme rooms** (first foe sets gang, rest match, wildcards) (D:786-807). PGM budget-spawns without theming — rooms read random.
- ❌ **Milestone bosses** by depth (skeletal champion / ogre / brass golem / barbed devil) (D:157-161) and **paired boss** (Barzillai + Rivozair) (D:812-815).
- ❌ **Elite advancement** for under-CR mooks (25%, +2-4 levels) (D:825-834).
- 🟡 CR scaling: poker keys to LOWEST party level + floor(depth/4), party size multiplies COUNT via XP budget (D:622-626,783). PGM uses mean APL + BASE_XP×partySize/4×depth ramp (roomgen.js:111-131). Similar intent, different curve; poker's lowest-level anchor protects the weakest member.
- ❌ Pre-door silent run-buffs (Mage Armor/Bless/Overland Flight before every door, D:491-526). PGM has a partial "AI opens rooms with a buff".
- ❌ Boss hype music on boss-room open (D:597-600).
- ➕ PGM perception/stealth reveal + flat-footed-until-perceived system (pr:137-145) — poker has flat-footed-until-first-action only (D:588).

### Loot / gear economy — biggest mechanics gap
- ❌ **CR-scaled magic loot tiers** (+1…+N gear, `lootForCR`, bosses always drop) (loot.js:23-61). PGM: flat 60% chance from a 14-item mundane table (items.js), **no enhancement bonuses at all**.
- ❌ **Loot roll-off** (R/P d20, auto-pass on equal-or-better, 35s timer, tie-break, hock unwanted) (loot.js:95-163). PGM: item goes to shared bag, no contest.
- ❌ **Equip/hock economy** + gear slots + WBL-capped bot upgrades + loot bank paper-doll. PGM: equip swaps, swapped gear **discarded** (pr:488-506).
- 🟡 Cure potion drops + auto-quaff by most-hurt (revives downed) (loot.js:37-91). PGM has potions + AI quaff fallback, no revive-by-potion.
- ❌ Thrown alchemicals: PGM auto-hit (known RAW debt); poker rolls vs touch.
- Note: Tobias mandate says PGM should use *real PF1 treasure tables* — neither app does yet; poker's tier system is closer.

### Death / revival — model diverges sharply
- Poker: dying at 0..−9 with bleed-out, death at −10, ferocity races fight to −10, corpse stays for revival, **revival hierarchy** (Breath of Life > Resurrection > Raise Dead > Reincarnate), end-of-round + end-of-room raises, **death penalty** (level loss) and gear loss only on died-in-failed-run (D:1826-1876, 1190-1237, 1363-1380).
- PGM: down at hp≤0, short-rest auto-revive at room clear to half HP (pr:558-562). The transplanted kits still CONTAIN `_abRevive` spells but the surrounding life/death model that gives them meaning is absent.
- Decision needed: keep PGM's forgiving roguelite model, or adopt poker's PF1-truer dying rules (RAW principle points at poker's).

### Multiplayer robustness
- ❌ Reconnect grace (3 min auto-bail, cancel on return) (sockets/dungeon.js:270-289). PGM: leave = gone.
- ❌ Mid-combat JOIN of a running delve as a player (D:468). PGM: players join only in lobby; spectators only after.
- ❌ Flee/wrap-up logic: last human bleeds out → bots finish room and cash out; no-humans → hired AI break and run (D:1076-1084,1151-1164). PGM: run just sits there.
- ❌ Crash/SIGTERM banking of live runs (server.js:236-270). PGM: legacy.json persists xp/level per action (➕ nice), but live runs vaporize silently.
- ➕ PGM: concurrent independent delves + side window + 8/10 caps + per-delve text logs — poker has one run per table.

### Banter / voices (companions)
- ❌ **Combat banter is a no-op in PGM's shim** — poker bots quip on kills/downs/loot with 11labs clips, clap back when named in chat, throttled 1/round (banter.js, D:209-263,1881-1944). PGM companions only speak when directly addressed (companion chat). The cast is silent in combat.
- ➕ PGM: LLM companion chat with live context + own voice — poker has canned lines only.

---

## 2. UI / LAYOUT

### Layout skeleton — ✅ per mandate
- ✅ Enemies row top, allies under, initiative left→right, action area, chat, PTT (app renderBattlefield).
- ➕ PGM: party status panel LEFT + loot panel RIGHT (Tobias's layout) — poker has neither as persistent panels.

### What poker's dungeon screen has that PGM's doesn't
- ❌ FLIP initiative slide animations (340ms) + two-phase "settle into initiative" + cross-row GLIDE for dominate/summon (CL:1313-1512). PGM re-renders statically.
- ❌ **Aim telegraphy**: your 🎯 broadcast to party, per-player colored rings, multi-select 2 targets, ally-target rings for buffs/dispels (CL:1353-1378,1844). PGM click = act immediately.
- ❌ Queued-action ⏳ chips + AFK countdown badges (CL:1463-1468).
- ❌ Turn-timer banner with live countdown (CL:4437-4463) — PGM has no timers at all.
- ❌ Card states: boss ☠️ crown/gold border, dead corpse-chip collapse, dominated purple glow rendering IN the hero row, summoned green glow, flying 🪽 badge, darkness shroud (CL:1355-1420). PGM: text condition chips only.
- ❌ Condition/buff ICON badges (webp icons, tooltips, count badges e.g. Mirror Image decoys) (CL:1271-1287 + /dungeon/buffs,conditions art). PGM: text chips.
- ❌ XP bar under HP bar + AC chip with acBreak tooltip + wild-shape overlay (CL:1459-1482).
- ❌ Density classes is-compact/is-packed for big rooms (CL:1398-1403) — PGM rows will overflow on 10+ foes.
- ❌ Two-column log (Party | Monsters) with color-coded event kinds + d20 bolding (CL:1785-1803). PGM: single stream.
- ❌ "Room is quiet" empty state, hover lift, downed pulsing animation.

### Caster UX — engine transplanted, UI never built
- ❌ **Spellbook popover** grouped by spell level with slot counts + icon tiles (CL:1636-1697).
- ❌ **🧠 Prepare/loadout picker** (choose prepared/known, lands next door) (CL:1013-1732).
- ❌ **⛪ Domains picker** (CL:1047-1735).
- ❌ **Metamagic toggles** + cantrip element cycling buttons (CL:1718-1728).
- PGM exposes casts as a flat numbered list (app renderGameChoices). Loadout gates are simply forced open in the shim (`_loadoutAllows` always true), so wizards "know" everything — functional but not poker's (or PF1's) prepared-caster experience.

### Loot / economy UI
- ❌ Loot roll-off UI (Roll d20 / Pass, waiting state), Equip/Hock buttons, Loot Bank paper-doll (CL:1528-1564, bankDoll).
- 🟡 PGM: bag list with Equip/Drink/Throw contextual buttons — covers its simpler economy.

### Sound
- ❌ Combat-sound toggle + volume slider, AI-voice toggle + volume, persisted localStorage (CL:512-520, index 147-159). PGM: fixed 0.55 volume, only the speech mute.
- ❌ Staggered playback (≤3 fresh sounds, 350ms apart, long-clip fade at 4s) (CL:917,1149-1170). PGM fires every event sound simultaneously — noisy rooms will stack clips.
- ❌ Muffled "through the floor" echo engine — poker-specific, N/A.

### Art
- ❌ **Crop Station** (full pan/zoom/preview/save-to-webp, .orig-non-destructive) (CL:5400-5571) — known TODO.
- ❌ Avatar/token picker (poker: 12 SVG presets + portrait pairing) — known TODO.
- 🟡 PGM uses the portrait library with slug/alias fallback; no per-portrait framing (`artPos`/PORTRAIT_FRAME) so some art crops badly.

### Recruit / party setup
- 🟡 Poker: recruit popover w/ fees, gear tips, "last party" restore, random-fill (CL:1751-1983). PGM: lobby dropdown, free, host-only. Different model (PGM has no chip economy) — but "last party" restore and random-fill are cheap wins.

---

## 3. BLIND ACCESSIBILITY — the most consequential divergences

PGM's blindmode.js is a clean-room simplification, not the poker engine. The mandate
was "mirror the keymap from that game exactly where possible." It currently doesn't.

### Keymap diff (dungeon context)

| Key | Poker (blind) | PGM | Verdict |
|-----|---------------|-----|---------|
| 1..N | numbered ACTIONS (attack, abilities) | numbered choices | ✅ |
| 0 | open next door | — (descend is a numbered choice) | ❌ |
| E | enemy inspect browse | enemy inspect browse | ✅ |
| K | prepare-spells picker | spellbook browse/cast | 🟡 different meaning |
| C | cycle cantrip element | character sheet | ❌ conflict |
| L | Life (self status) | — | ❌ |
| M | money/depth | — | ❌ |
| H | party health | health re-read | ✅ |
| **B** | **party BUFFS** | **BAIL (double-press retreat)** | ❌ **regression — see below** |
| D | party debuffs | — | ❌ |
| G | metamagic menu | — | ❌ |
| V | domains menu | — | ❌ |
| X | class progression | progression | ✅ |
| R / P | loot roll / pass | — / P = party browse | ❌ conflict |
| \ | jump to chat field | — | ❌ |
| S | **stop speaking (segmented)** | — | ❌ |
| [ ] | rate − / + | + / − keys | 🟡 different keys |
| − = | volume − / + | — | ❌ |
| Esc | session menu (Spectate/Bail/Leave/Cancel) | close browse | ❌ |
| ? | help/learn mode | help | ✅ |
| Space | PTT (rebindable, default Space) | PTT (fixed) | 🟡 no rebind |

**B = bail is a safety regression.** Poker deliberately REMOVED single-key bail/cancel
paths after Josh's fat-fingers (A-key all-in unmapped 2026-07-08; `.` cancel unmapped;
bail moved into the Esc session menu; session menu numbers deliberately unmapped
because a stray number bailed a run — CL:2746-2752, 2511-2524). PGM re-introduced
a two-keystroke retreat on B, and B is *adjacent to poker's meaning* (party buffs),
so Josh's muscle memory will retreat the party when he asks for buffs.

### TTS engine robustness (invisible until it bites)
- Poker: utterances go to the NATIVE speechSynthesis queue and explicitly do **not**
  rely on `onend` ("Chrome drops it") + shadow watchdog + zombie-engine recovery
  (busy-but-silent >8s → cancel + replay last 3) + unconditional `resume()` every 8s
  vs Chrome's 15s auto-pause (BM:336-399).
- PGM: custom queue pumped **by `u.onend/onerror`** (bm pump) — exactly the
  mechanism poker's comments call unreliable. A dropped onend = permanently stuck
  speech until reload. High-priority fix.
- Poker section-spool + **S segmented stop** (skip current tagged section, keep rest;
  2026-07-08 fix keeps untagged XP/gold lines) (BM:1106-1132). PGM: all-or-nothing mute.
- Poker rate/volume persisted localStorage w/ announced changes; PGM rate not
  persisted, no volume control.

### Speech-recognition robustness
- Poker: maxAlternatives=4 + COMMAND_HINT ranking, spoken-number parser
  ("five hundred"/"2.5k"), **confirm gate** on destructive/raise commands, and an
  **LLM fallback interpreter** whose result is always staged behind yes/no
  (BM:737-1016). Rebindable PTT key.
- PGM: raw transcript → handleCommand. A garbled command becomes… a **question to
  the GM** (unmatched text falls through to askGM). Josh says "attack the ghoul",
  STT garbles it, and instead of acting he gets Ultron musing at him. Needs a
  confidence/confirm layer or the poker alternative-ranking.

### Narration quality layers PGM lacks
- ❌ Earcons (turn pulse, room-clear C-E-G chime, ack/error/open/close) (BM:195-235).
- ❌ Text normalization: gp-strip, "X of Y" ratios, pronunciation map from
  `/api/pronunciations` (PGM copied pronunciations.js into dungeon-port but never
  applies it in blindmode), oath-pause, glyph/roll-math strip (BM:298-315,1356).
- ❌ Big-room condense (≥6 foes → ally lines + enemy tally) + CC-idle collapse
  ("N foes stand idle — entranced or held") (BM:1419-1451).
- ❌ Deadliest-first enemy ordering in speech (BM:1364-1377) — PGM reads DOM order.
- ❌ Your-turn prompt as 'event' (not urgent) so queued foe narration isn't wiped
  (BM:1454-1466) — PGM uses urgent for turn lines, which flushes pending narration.
- ❌ Remote-tester log shipping (`blind:log` for Josh) (BM:75-106).
- ❌ In-app confirm dialog (poker replaced native confirm() because it isn't narrated;
  PGM's retreat button uses native `confirm()` — app.js retreat handler).
- ➕ PGM: strict single serialized queue for GM/companion MP3 + TTS (poker ducks
  instead) — this is BETTER for the never-overlap mandate; keep it.

### PGM a11y bugs found by this audit
- `status` and `progression` info providers hardcode "level 1" (app.js:481,498) —
  wrong after any level-up.
- Retreat uses native confirm() (not narrated, focus-traps VoiceOver).

---

## 4. PGM-ONLY FEATURES (poker has no equivalent)
- Concurrent multi-delve sessions + side window + spectator caps + per-delve logs.
- Perception/stealth reveal, hidden enemies, flat-footed-until-perceived.
- PF1 skills system + point spending UI + Perception house rule.
- LLM GM (Ollama→OpenRouter→OpenAI) + Ultron narration + companion chat w/ context.
- Legacy xp/level persistence across restarts; roguelite fresh runs.
- Vetting ledgers (rule defined; diversion engine still unbuilt).
- Retreat any time, not turn-gated.

---

## 5. RECOMMENDED PRIORITY ORDER
1. ~~**A11y keymap realignment to poker**~~ **DONE 2026-07-11**: B→party buffs,
   D→debuffs, L→life, M→money, C→cantrip cycle (new server action, engine
   `_cantripState`), 0→door, \→chat (Enter sends/Esc cancels), S→stop-speaking
   (with in-flight-GM-fetch guard), Esc→session menu (bail behind Enter, numbers
   unmapped per poker), [ ]=rate and − ==volume both persisted, "level 1"
   hardcodes fixed (real level/cls/xpNext in payload), native retreat confirm()
   replaced with announced two-press arm. Also fixed: urgent blind-TTS now cuts
   a playing GM clip instead of talking over it.
2. **TTS engine hardening** — adopt poker's native-queue + watchdog approach
   (or port BM's speech core outright).
3. **AFK auto-act** ~~+ action queue + reconnect grace~~ — AFK DONE 2026-07-11
   (60s idle human turn auto-attacks, 5s server sweep, AFK_MS env-tunable).
   Action queue + reconnect grace still open.
4. **Caster UX**: spellbook-by-level popover, prepare/loadout + domains pickers,
   metamagic toggles, cantrip cycling (engine already supports all of it).
5. **Loot economy**: CR-tiered +N gear, roll-offs, hock, (steps toward real PF1
   treasure tables per mandate).
6. **Combat banter** re-enabled through the cast voices (throttled like poker).
7. Death/revival model decision (RAW-true dying/revival vs roguelite short rest).
8. Sound controls + staggered playback; condition icon badges; density classes;
   gang-themed rooms + milestone/elite/paired bosses; big-room narration condense.
9. Crop Station + avatar picker (already on the worklist).
