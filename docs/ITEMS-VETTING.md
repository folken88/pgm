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

_None yet — PGM v0 is not built. First expected promotions, once the v0 combat
loop resolves a wielded weapon:_
- _basic melee weapons (data already in pf1core `weapons.js`; effect = attack via
  `character.attackProfile`)._

_(Move items here with a dated line + enabling mechanism as they qualify.)_

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
