# PGM Item Vetting Ledger (Treasure)

**Living document — maintained continuously.** Tracks which PF1 items PGM can
actually use in-game. Companion ledger: `ENCOUNTERS-VETTING.md` (creatures) —
same status model and the same diversion rule below.

## Governing rule — vetting-gated generation with diversion

PGM rolls treasure on the **real PF1 treasure tables** (by CR), so the intended
value distribution is preserved. But **any rolled result that is not VETTED is
diverted to the nearest vetted equivalent** — the game never actually hands a
player something the engine can't represent, equip, or resolve.

**Treasure diversion order (rolled item is UNVETTED/IGNORED):**
1. Substitute a **VETTED item of comparable gp value and category** (e.g. an
   unvetted wand → a vetted wand/consumable of similar value; an unvetted magic
   sword → a vetted magic sword of similar value).
2. If no comparable vetted item exists, substitute a **VETTED item of the
   nearest gp value** in any category.
3. Ultimate fallback: **equivalent-gp coins** (coins are trivially vetted), so
   there is always a valid result. Log every diversion so gaps surface as
   vetting candidates.

## Statuses

- **VETTED** — PGM has a working, tested in-game mechanism for this item (or item
  category): it can be represented in inventory, held/equipped or consumed as
  appropriate, and its mechanical effect is implemented (via pf1core + app
  layer). Eligible to appear as treasure and be used by players/companions.
- **UNVETTED** — a valid PF1 item we recognize but **cannot yet use in-game** (no
  mechanism implemented). This is the backlog we promote from.
- **IGNORED** — considered for vetting but deliberately set aside for now, with a
  reason. Not on the near-term roadmap. (Can be revived later.)

## Promotion rule (UNVETTED → VETTED)

An item or category is promoted only when all three hold, and the enabling
mechanism/commit is recorded next to it:
1. **Representable** — it has an inventory representation (data shape) in PGM.
2. **Handleable** — it can be equipped/wielded/worn or consumed/activated as its
   type demands.
3. **Resolvable** — its mechanical effect is implemented and tested (attack/AC
   math, save-or-suck, healing, buff, etc.), sourced from pf1core where the rule
   lives.

When promoting, note *what mechanism* vetted it (e.g. "v0 combat resolver",
"consumable-use endpoint") so the provenance is auditable.

---

## VETTED

- **Coins (gp)** — VETTED 2026-07-09. Mechanism: room reward + run gold total
  (`roomgen.js` drops gp on a clear; tracked in run state / HUD). cp/sp/pp are
  representable the same way; add when a room actually grants them.
- **Basic melee weapons** — VETTED 2026-07-09. Mechanism: v0 combat resolver
  wields a pf1core weapon (`WEAPON_BY_NAME`) via `character.attackProfile` for
  real to-hit/damage/crit math. Confirmed in play: longsword, greataxe, dagger,
  quarterstaff, morningstar, short sword, rapier, scimitar (the class starting
  weapons in `content.js`). Any standard pf1core melee weapon resolves through
  the same path.

- **Consumables (drink/throw)** — VETTED 2026-07-09. Mechanism: a party inventory
  + weighted early-treasure drop table (`items.js`, ~60% of cleared rooms drop
  one) + a combat **"use" action** (drink → heal an ally; throw → damage a foe),
  usable by humans and by AI companions (who auto-drink a heal when a hero is
  badly hurt). Vetted items:
  | Item | Type | Effect |
  |---|---|---|
  | Potion of Cure Light Wounds | potion | heal 1d8+1 to an ally |
  | Potion of Cure Moderate Wounds | potion | heal 2d8+3 to an ally |
  | Alchemist's Fire | alchemical | 1d6 fire to a foe |
  | Acid Flask | alchemical | 1d6 acid to a foe |
  | Liquid Ice | alchemical | 1d6 cold to a foe |
  | Bottled Lightning | alchemical | 1d6 electricity to a foe |
  | Holy Water | alchemical | 2d4 to **undead** (fizzles on the living) |
  _Simplifications to revisit: thrown items auto-hit (no touch-attack roll yet);
  splash damage not modeled._

- **Found weapons & armor (equippable gear)** — VETTED 2026-07-09. Mechanism:
  gear drops into the party bag and a hero **equips** it between fights (in the
  cleared phase) — a weapon swaps their attack (via pf1core `WEAPON_BY_NAME` +
  `attackProfile`), armor recomputes AC + flat-footed AC. Vetted gear:
  | Item | Type | Effect |
  |---|---|---|
  | Longsword / Battle Axe / Morningstar / Greatsword | weapon | swap to that PF1 weapon |
  | Studded Leather (+3) / Scale Mail (+5) / Chain Shirt (+4) | armor | set armor bonus, recompute AC |
  _Simplifications to revisit: no enhancement bonuses (+1 etc.) yet; swapped-out
  gear is discarded (no re-storing/trading between members yet); no proficiency
  penalties applied._

_Not yet: magic/enhancement properties (need the +N + special-ability layer),
found/equippable weapons & armor as loot, ranged weapons, scrolls/wands (need a
spell-cast-from-item path), and everything else below._

---

## UNVETTED — valid PF1, not yet usable

Backlog, grouped by the PF1 treasure/item taxonomy. Categories are listed here;
specific items get promoted individually (or as a whole category when a single
mechanism covers it, e.g. "all simple melee weapons").

### Currency & valuables
- Coins — copper / silver / gold / platinum
- Gems (trade goods, by value tier)
- Art objects (trade goods, by value tier)

### Mundane gear
- Simple weapons (melee + ranged)
- Martial weapons (melee + ranged)
- Exotic weapons (melee + ranged)
- Ammunition
- Light / medium / heavy armor
- Shields (bucklers → tower)
- Adventuring gear (rope, torches, alchemical items, tools, etc.)

### Magic items — the 9 PF1 categories
- **Armor** — magic armor & shields (enhancement bonuses + special abilities:
  glamered, spell resistance, fortification, etc.)
- **Weapons** — magic weapons (enhancement bonuses + special abilities: flaming,
  frost, keen, holy, bane, etc.) — *real properties, not poker's flat "+N"*
- **Potions**
- **Rings**
- **Rods**
- **Scrolls**
- **Staves**
- **Wands**
- **Wondrous items** (belts, cloaks, boots, headbands, bags of holding, etc.)

### Consumables / activated (cross-cutting, called out because they need a "use" verb)
- Potions (drink → apply spell effect)
- Scrolls (cast → apply spell effect, with UMD where relevant)
- Wands / staves (activate → charges)
- Alchemical items (acid flask, alchemist's fire, etc.)

---

## IGNORED — considered, set aside for now

_None yet._

_Likely early candidates to discuss (complexity out of proportion to v0/v1
value) — NOT yet decided, listed only as talking points:_
- _Intelligent items (own Ego/personality/agenda)_
- _Cursed items_
- _Artifacts (minor & major)_
- _Item crafting / creation feats_
