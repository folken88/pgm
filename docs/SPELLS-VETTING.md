# PGM Spell Vetting Ledger

**Living document — same model as ITEMS/ENCOUNTERS vetting.** A VETTED spell is
castable in-game (appears in a class spellbook via pf1core kits, costs a slot/
room use) AND resolvable (its effect family has a pf1core resolver). Spellbooks
are filtered to vetted families by construction (`casting.SUPPORTED`), so an
unresolvable spell can never be offered.

## VETTED effect families (mechanism: pf1core `rules/resolve.js` + PGM `casting.js`, 2026-07-09)

| Family | Resolver | Example spells now castable |
|---|---|---|
| bolt (ranged touch, at-will cantrips w/ iteratives) | `resolveCantrip`/`resolveBolt` | Ray of Frost, Acid Splash, Jolt |
| touch (incl. Searing Light table, lifesteal, Acid Arrow DoT) | `resolveTouch` | Shocking Grasp, Chill Touch |
| aoe (save-half, one shared roll, SR per target, Evasion, blind rider) | `resolveAoE` | Burning Hands (Fireball/Cone of Cold at level) |
| missile (auto-hit darts, Shield blocks) | `resolveMissile` | Magic Missile |
| save_debuff (held w/ re-save DC, nauseated) | `resolveSaveDebuff` | Hold Person |
| heal (cure single, channel party-heal / offensive sear) | `cureAmount`/`resolveChannelHeal`/`resolveChannelSear` | Cure Light Wounds, Channel Energy |

Slots refresh per room (poker convention). Spell DCs/saves/SR/metamagic all run
through pf1core `spellmath` — identical math to poker's dungeon.

## UNVETTED (next families, per the extraction plan Phase B)
buff (Shield, Bless, Mage Armor, Divine Favor…), grease/control, sleep,
charm/dominate, summon, dispel/cleanse, savedie, rays (Scorching Ray),
disintegrate (resolver EXISTS — needs a class kit entry at level), spellstrike,
invisibility/mirror-image defenses.

## IGNORED
_None yet._
