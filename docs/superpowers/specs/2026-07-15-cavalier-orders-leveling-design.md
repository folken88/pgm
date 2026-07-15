# Cavalier Orders + the Leveling Screen — Design

**Date:** 2026-07-15 · **App:** PGM · **Author:** Claude (with Tobias)

## 1. Goal

Two connected features:

1. **A class-choices framework** — some classes make a defining choice at a given
   level (the Cavalier's **Order**, later Cleric Domains, Sorcerer Bloodline, …).
   The choice is stored on the character and unlocks that option's features.
2. **A Leveling screen** — a dedicated, blind-first screen (modeled on the in-dungeon
   shop) where a player resolves pending choices and reviews their build. While it's
   open, the player's turns auto-pass and the battle audio is muffled hard so the
   screen-reader voice reading the choices is crystal clear.

**First content:** all **7 Cavalier Orders** — Flame (already built) plus the six
standard Paizo orders (Cockatrice, Dragon, Lion, Shield, Star, Sword), each at **full
PF1 depth**: the order's Challenge modifier + its L2 / L8 / L15 order abilities.

**Scope guardrail (Tobias):** HP / BAB / slots / spells keep auto-applying instantly on
level-up. Only the *choice* waits for the player. Leveling is available **out of combat**
only; if others descend while you're still choosing, your turns auto-pass and you catch
up when you close the screen (identical to the shop).

## 2. Class-choices framework

### 2.1 Data model

A new table `CLASS_CHOICES` (in `pf1core/pf1data/choices.js`, exported through pf1core):

```js
CLASS_CHOICES = {
  cavalier: [
    { key: 'order', level: 1, prompt: 'Choose your Order',
      options: [ /* the 7 orders — see §4 */ ] },
  ],
  // future: cleric → { key:'domains', level:1, pick:2, options:[...] }, etc.
}
```

Each **choice-point**: `{ key, level, prompt, pick=1, options }`.
Each **option**: `{ key, name, desc, grants }` where `grants` names the features the
option unlocks (see §3).

### 2.2 Storage

The pick lives on the character: `character.choices = { order: 'flame' }`. Persisted with
the character (survives save/resume). Set at creation and at level-up.

### 2.3 Pending-choice detection

`pendingChoices(character)` returns choice-points whose `level <= character.level` and
whose `key` is absent from `character.choices`. A freshly created L1 cavalier with no
order → `['order']` pending. Drives the "Level up" affordance (§5) and a badge in the UI.

## 3. Features unlock from the choice, not from a name

Today the Flame deeds are hardcoded to the nickname "Lord Gweyir" via `char: 'Lord Gweyir'`
+ `_charAllows` and `_isFlameCavalier`. We replace name-gating with **choice-gating**, in
PGM's **shim** (sync-safe — never edits the poker-synced mixin files):

- `shim._orderOf(m)` → `m.character?.choices?.order || null`.
- `shim._isFlameCavalier(m)` → `_orderOf(m) === 'flame'` (was: nickname === 'lord gweyir').
- **`_charAllows` override in shim.js:** an ability tagged `order: '<key>'` is allowed iff
  the cavalier chose that order (`_orderOf(m) === ab.order`). Delegates to the original
  `_charAllows` for everything else (Rissa's Beast Mode, etc.). This is how each order's
  deeds are gated to cavaliers of that order — without touching the synced abilities.js.
- **Lord Gweyir** keeps his identity: his authored build sets `choices.order = 'flame'`
  (in `dungeon-port/characterBuilds.js`), so he is unchanged.

The order's **Challenge modifier** and **passives** are applied in the shim's challenge /
swing / initiative paths, keyed on `_orderOf(m)` (the Flame passives Foolhardy Rush /
Daunting Success already live there — the six new orders' passives join them).

### 3.1 Where each order's abilities are registered

- **Active deeds** (things the player picks on their turn — Braggart, Aid Ally, Strategy,
  Act as One, For the King, For the Faith, Rally, etc.) are ability entries added for
  `cls === 'cavalier'` in the dungeon abilities mixin's `_abilitiesFor`, each tagged
  `order: '<key>'` + `minLevel`, so the shim's `_charAllows` shows them only to that order
  at the right level. (Mirrors how Flame's Glorious Challenge / Blaze of Glory are added.)
  **NOTE:** the abilities mixin is poker-synced. To stay sync-safe, the six new orders'
  deeds are added in a **PGM-only post-step** (in shim.js or a small `pgmCavalierOrders.js`
  the shim calls), NOT by editing the synced file.
- **Passive challenge modifiers** (Cockatrice damage, Dragon ally-attack, Lion AC, Shield
  attack, Star saves, Sword to-hit) are applied in the shim's challenge-bonus computation,
  keyed on `_orderOf(m)`.

## 4. The 7 Cavalier Orders (full PF1, distilled for PGM)

Scaling note: PF1 "+1 per 4 levels" etc. is preserved. All bonuses require an **active
Challenge** unless stated. **Adaptations from tabletop are marked ⚑** (PGM has no mounts,
no movement grid, no Aid-Another action, so those mechanics are re-expressed).

### Order of the Flame *(existing — unchanged)*
Kill-streak **Glorious Challenge** (deed), **Blaze of Glory** (L15 finisher), **Foolhardy
Rush** (L2, never flat-footed / initiative), **Daunting Success** (L8, a confirmed crit
daunts the room). Now gated by `choices.order === 'flame'` instead of the Gweyir nickname.

### Order of the Cockatrice — the glory-hog
- **Challenge:** +1 morale **melee damage** vs the challenged foe **while you are its only
  attacker** (no ally also engaging it), +1 per 4 levels.
- **L2 Braggart:** a deed — **Dazzling Display**: one action shakens every foe (a
  demoralize); your attacks deal **+2 vs shaken foes**.
- **L8 Steal Glory:** ⚑ passive — when **an ally lands a critical hit** on a foe, you get a
  **free strike** on that foe (no adjacency grid; "threatening" → "in the fight").
- **L15 Rally:** once per room, the first blow that would **drop you** instead leaves you at
  1 HP with a surge (act on).

### Order of the Dragon — the tactician
- **Challenge:** your **allies get +1 melee attack** vs the foe you've challenged, +1 per 4.
- **L2 Aid Allies:** ⚑ a deed — pick an ally; they get **+3** (scaling) to hit **and** AC for
  a round. (PF1's improved Aid Another → a direct targeted buff, since PGM has no
  Aid-Another action.)
- **L8 Strategy:** a deed — grant the whole party one of: an **extra attack this round**, or
  **+2 AC** for a round (player picks). Once per room.
- **L15 Act as One:** once per room — the **whole party gets a free melee attack** now.

### Order of the Lion — the guardian
- **Challenge:** +1 **dodge AC** vs the challenged foe's attacks, +1 per 4.
- **L2 Lion's Call:** ⚑ a deed — rally the party: **remove fear/shaken** and grant **+1
  morale to hit** for a round (PF1 grants vs-fear + temp morale).
- **L8 For the King:** a swift-action deed — allies get **+Cha to hit and damage** for 1
  round.
- **L15 Shield of the Liege:** passive **aura**: allies gain **+2 AC**; plus a deed — once
  per room **redirect a hit** from an ally onto yourself.

### Order of the Shield — the protector
- **Challenge:** +1 morale **attack** vs the challenged foe **if it has attacked an ally**
  (not you), +1 per 4.
- **L2 Resolute:** ⚑ passive — **DR 1/— (scaling with level)** while in melee (PF1 converts
  lethal→nonlethal in heavy armor → a flat damage soak, since PGM has no lethal/nonlethal
  split).
- **L8 Stem the Tide:** ⚑ passive — when a foe attacks an **ally**, you make a **free
  attack** on that foe (PF1 Stand Still has no grid meaning → an interrupt strike).
- **L15 Protect the Meek:** a deed — once per room, **redirect an attack on an ally to
  yourself and counterattack** the attacker.

### Order of the Star — the faithful
- **Challenge:** +1 morale to **all saves** while threatening the challenged foe, +1 per 4.
- **L2 Calling:** a deed — a short prayer; your **next save or attack this room gets
  +level competence**. Once per room.
- **L8 For the Faith:** a free-action deed — the party gains **+Cha morale to hit** for a
  round (battle-cry).
- **L15 Retribution:** ⚑ passive — when a foe **hits you or an ally**, you deal a **smite-like
  retaliation** strike (holy damage scaling with level), a few times per room.

### Order of the Sword — the duelist ⚑ (fully de-mounted)
PF1 Sword is mount-only; PGM has no mounts, so it becomes the **on-foot duelist**:
- **Challenge:** +1 morale **attack** vs the challenged foe, +1 per 4 *(the mounted bonus,
  now always on).*
- **L2 By My Honor:** passive — **+2 morale to all saves** *(pick-an-alignment flavor
  dropped; the save bonus kept).*
- **L8 Duelist's Precision:** ⚑ replaces Mounted Mastery — **+2 to confirm critical hits**
  and your challenge damage bonus also applies to the **first hit each round on any foe.**
- **L15 Supreme Strike:** ⚑ replaces Supreme Charge — once per room, a **devastating blow**:
  your next hit deals **double weapon damage** (or auto-confirms a threat).

*(Open question flagged to Tobias: keep Sword de-mounted as above, or swap it for a
non-mount Paizo order such as **Blue Rose** (peace/diplomacy)? Default = keep Sword,
de-mounted, since it's one of the six standard orders you asked for.)*

## 5. The Leveling screen (backend + client)

### 5.1 Backend — parallels the shop exactly
- Actions on `applyAction`: **`level_open`**, **`level_close`**, **`level_choose`**.
  - `level_open` — allowed only when **not in active combat for that hero** (phase
    `cleared` / `pub` / `initiative`, or the hero is between rooms). Sets
    `hero.leveling = true`. Returns the level payload (§5.3).
  - `level_choose {choiceKey, optionKey}` — validates the option is legal + pending, records
    `character.choices[choiceKey]`, re-derives the hero (so granted features apply
    immediately), logs a short line, returns the refreshed payload.
  - `level_close` — clears `hero.leveling`.
- **Auto-skip:** the turn loop already skips a `shopping` hero (partyrun.js ~410/476); add
  `|| cb.leveling` to the same guard so a leveling hero's turns pass and the dungeon flows.
- **`levelPayload(hero)`** = `{ pending: [choice-points with options], done: [{key,name}],
  build: {level, cls, hp, ac, bab, order, …} }`.
- **`publicRun` / memberView**: expose `leveling` (like `shopping`) and a `pendingLevel`
  count so the UI can badge "Level up available".

### 5.2 Client — the Leveling panel
- A panel like `#shop-panel` (`#level-panel`): a "Pending choices" section (each choice
  with its options as buttons) + a "Your build" readout. Native buttons → keyboard/SR
  friendly by construction.
- **Muffle (harder than the shop):** while `state.levelingOpen`, combat SFX + narration
  route through the low-pass at a **lower cutoff (~250 Hz) and lower volume (~0.3×)** than
  the shop's 378 Hz / 0.5× — so the choice TTS is clearly on top. Reuse `playSfx(url, vol,
  muffle, cutoff)`; extend `amShopping()` → a shared `backgroundMuffled()` that's true when
  shopping **or** leveling, with leveling using the stronger params.
- **Blind nav (poker-model):** **Escape is the leveling menu** — a context-aware action hub
  (like the shop's): numbered items = each pending choice's options, "read my build", "leave
  the leveling screen". Choosing speaks a confirmation. Option descriptions are spoken in
  full so a blind player hears what each order does before committing.
- **Entry:** a **"Level up"** action in the dungeon Escape menu + a visible button, shown
  **out of combat** whenever `pendingLevel > 0` (and always available to review your build).

### 5.3 Creation-time choices
A freshly created cavalier has `order` **pending**. After **Confirm character**, if
`pendingChoices(character).length`, the player lands in the **lobby** and the **"Level up"**
action is offered there (out of combat) to resolve the pending order before setting out.
No separate creation UI — one screen for both creation-time and level-up choices.

## 6. Testing

- **Framework:** `pendingChoices` detects a cavalier's order at L1 and clears it once chosen;
  a fighter has none.
- **Gating:** a cavalier with `choices.order='flame'` gets the Flame deeds and `_charAllows`
  passes them; a Cockatrice cavalier gets Braggart, not Glorious Challenge; Lord Gweyir
  (authored `order:'flame'`) is unchanged.
- **Each order:** the Challenge modifier applies the right bonus (Cockatrice damage when
  lone, Dragon ally-attack, Lion AC, Shield conditional attack, Star saves, Sword to-hit);
  each order's L2/L8/L15 deed appears in the kit at its level and fires.
- **Leveling screen:** `level_open` sets `leveling`, turns auto-skip while leveling (a fight
  started by another descender doesn't act for you), `level_choose` records + re-derives,
  `level_close` clears; refused during your own active combat turn.
- **Play test (dev backdoor + browser blind mode):** create a cavalier → lobby → Level up →
  hear the order options → pick Flame → see the Flame deeds on the bar; muffle verified
  (background quieter than the shop).

## 7. Build order (for the plan)

1. choices framework (data + storage + `pendingChoices`) + shim gating (`_orderOf`,
   `_charAllows` override, Gweyir default). Flame now choice-gated.
2. Leveling screen backend (`level_*` actions + auto-skip + payloads) — reuse shop patterns.
3. Leveling panel client (UI + muffle + Escape hub) — reuse shop patterns.
4. The six orders: challenge modifiers (shim) + the 18 deeds/passives (PGM-only post-step),
   one order at a time, each verified in play.
5. Creation-time flow (offer Level-up in the lobby for pending L1 choices).

**Sync-safety rule throughout:** never edit the poker-synced files
(`pf1core/pf1data/monsters.js`, `pokerdungeon/game/dungeon/*.js`) for order content —
everything order-specific lives in PGM-only files (`shim.js`, a new `choices.js`, a new
`pgmCavalierOrders.js`) so a future `sync-from-poker` can't clobber it.
