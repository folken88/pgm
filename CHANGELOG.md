# PGM — Patch Notes

**Personal Game Master** ([pgm.folkengames.com](https://pgm.folkengames.com)) — a Pathfinder 1e
dungeon crawl you can play entirely by ear.

The version shown in the top-right of the app is the build you're playing. It's also in the
subject line of every patch-note email, so you can always tell which notes match your game.
Newest release first. The developer-facing one-liners live in `backend/src/version.js`.

## Credits

- **Josh** — the blind-play overhaul. A screen-reader user whose reports drove the spoken
  menus, the repeatable guide, the repeat key, and the whole key-driven navigation model.
- **Tobias** — design, art, and the house rules the engine runs on.

---

## v1.8.1 — 2026-07-15

Small fix on top of the new look: the banner and social card now serve with the correct image
type, so link previews render reliably when you share a PGM link.

---

## v1.8.0 — 2026-07-15

**A new look — and PGM's banner art.**

PGM now greets you with its **key art**: a party of adventurers stepping toward a glowing crimson
doorway. It's the **hero image on the landing page**, and it's also the **link-preview card** — share
a PGM link and that banner is what shows up.

The whole theme has shifted to match it. The old darkwood look is now **"emberwood"**: the same warm
wood and polished brass, but plunged into the banner's firelit dark, with **blood-crimson and
ember-orange** glowing through. The main buttons now glow like that doorway, and a faint ember light
sits behind the header. Nothing about how the game plays or reads aloud changed — it's purely a
warmer, more dramatic coat of paint.

---

## v1.7.0 — 2026-07-15

**Order of the Lion — the first of the new Cavalier orders.**

Pick a **Cavalier**, choose the **Order of the Lion** on the Leveling screen, and you become the
party's guardian. Its full order is live:

- **Challenge** — while you hold an active challenge, you gain a **dodge bonus** to your armor
  class (+1, and another every four levels).
- **Lion's Call** (level 2) — a rallying roar: the **whole party** shrugs off fear and fights
  with **+1 to hit and +2 to all saves** for the rest of the fight (twice per room).
- **For the King!** (level 8) — a battle-cry that lends the party your conviction: **+Charisma to
  hit and damage** for everyone, for the room (once per room).
- **Shield the Liege** (level 15) — throw your guard over a comrade for **+4 AC** (and +2
  deflection); and while you stand, a steadfast **aura gives every ally +2 AC**.

**Order of the Flame** remains fully playable. The other orders — Cockatrice, Dragon, Shield, and
Star — are coming one at a time, each with its complete set of abilities.

---

## v1.6.0 — 2026-07-15

**A Leveling screen — and Cavaliers now choose their Order.**

Some classes make a choice that defines them, and now there's a place to make it. Create a
**Cavalier** and you'll be prompted to choose your **Order** before you set out — **Order of the
Flame** is live, and a cavalier who takes it gets the full order: Glorious Challenge, Blaze of
Glory, and its passives, right on the action bar.

The Leveling screen works like the shop: **you can take your time.** While it's open your turns
pass automatically, and if the rest of the party opens the next door, they press on without you —
you catch up when you're done. The battle goes **quiet and muffled** while you're choosing (more
so than in the shop) so your screen reader can read the options clearly. It's fully key-driven for
blind players: **Escape** opens the leveling menu with each option numbered and described aloud.

Lord Gweyir, the recruitable Order-of-the-Flame companion, is unchanged.

*(Five more Orders — Cockatrice, Dragon, Lion, Shield, Star — are designed and coming; each turns
on once its full set of abilities is built, so you'll never pick an order that doesn't work yet.
Order of the Sword waits for mounted combat.)*

---

## v1.5.0 — 2026-07-14

**The Cavalier (and the Gunslinger) are playable now.** Both classes were fully built but just
weren't listed on the character-creation screen. Pick one and go.

Fixing that turned up a real bug and fixed it too: a Cavalier's **Challenge** — and any class
feature that gets added when you actually enter the fight — wasn't showing up on your action bar.
It does now; what you see is what you can actually use.

**Order of the Flame** belongs to **Lord Gweyir**, who's still recruitable as a companion — so you
can adventure *with* a flame cavalier. A cavalier you make yourself gets the base Challenge oath.
(Toby: if you want your own cavalier to *be* Order of the Flame, that's a quick change — say the
word.)

---

## v1.4.0 — 2026-07-14

**Quieter, clearer, and a few fixes.**

- **Your character wears its own name.** If you name your fighter "Lien," the board says Lien — not
  your account name. There's a proper character-name field when you build a character now.
- **Blind mode stops repeating itself.** It no longer reads out every enemy's health percentage on
  *every* one of your turns — it reads the lineup once, and again only when it actually changes (a
  foe drops, a new one shows up). Otherwise it just says "Your turn." Press **F** any time to hear
  the foes again. It also stopped narrating a couple of things it never should have (a developer
  bookkeeping line, and a stray "you have N skill points" that leaked into combat).
- **Toggles just make a sound.** Turning on Power Attack, Deadly Aim, or a stance plays a quick blip
  to tell you it's active, instead of a spoken line.
- **The main page doesn't lecture you.** It says one short line and points you at **?**. Pressing
  **?** now walks you through the help one piece at a time, instead of dumping it all at once.
- **Skeletal champions can be disarmed.** They swing a real battleaxe or longsword, so now you can
  knock it out of their bony hands.

*(Still coming: buff icons on the character cards, and a Rest system — heal and recover spells
between rooms at the cost of a tougher next room.)*

---

## v1.3.1 — 2026-07-14

**The GM has a voice again in blind mode.** When v1.3.0 brought the dungeon's controls over, it
accidentally muted the ElevenLabs voices in blind mode — everything came through the plain
screen-reader voice. Fixed. Now the three voices share one queue and take turns, so nothing talks
over anything:

- **The GM** (the Ultron voice) reads the room descriptions and the big moments.
- **Your companions** speak their quips in their own voices.
- **The blow-by-blow of combat** — hits, misses, whose turn — stays on the fast screen-reader
  voice, so it never lags behind the fight.

---

## v1.3.0 — 2026-07-14

**The dungeon controls are the real thing now — not an imitation of them.**

Josh, this one's for you. Playing a delve felt wrong because the keys and the spoken play-by-play
were *different* from the poker dungeon you know — A did the wrong thing, your options only read
out once and wouldn't repeat, and every action came with visual clutter ("a bunch of sparkles,
then the spell"). The reason was simple and it was our fault: PGM had its *own* hand-built blind
mode that only tried to copy the dungeon. It was never going to match.

So we stopped copying it and **brought the dungeon's actual controls over, whole.** The keyboard
and the narration in a PGM delve are now literally the poker dungeon's — the same code, so they
behave the same, down to the letter:

- **1** attacks, **2 and up** are your abilities, and casters get the **Spellbook** — pick a
  level, then a number to cast, exactly as you're used to.
- **E** inspects the enemies, **F** re-reads the foe list, **L** is your life, **H** the party's
  health, **M** your gold, **B** buffs, **D** debuffs, **C** cycles your cantrip, **0** opens the
  next door, **Escape** is the session menu.
- **A** still repeats the last thing said and **S** still stops the talking — the same global keys
  as everywhere else.
- The narration is the dungeon's: the three-tone chime when your turn comes up, "Your turn,"
  then the enemies deadliest-first, the clean hit-and-miss lines with the symbols stripped out,
  and "Room clear — open the next door, or bail with your gold."

If a key or a line sounds different from the dungeon now, that's a bug — tell us, because it's
meant to be identical.

*(One thing stays a PGM choice on purpose: enemy health reads as a percentage in quarters, not an
exact number.)*

**Still on the list:** the part *before* the delve — making your character, the lobby, the pub —
is still PGM's own, and we know you get lost there too. That's next.

---

## v1.2.1 — 2026-07-14

**The named weapons are priced from the books now, not from my guesswork.**

Yesterday's prices were partly invented — I'd bolted a "lethality premium" onto the Pathfinder
enchantment curve to stop a sniper rifle costing less than a dagger. That's gone. Every named
weapon is now priced the way Pathfinder actually prices weapons:

> the real cost of the weapon it's built from, plus masterwork, plus its enchantment

The base costs come straight from the Pathfinder rulebook data (the same tables Foundry uses).
That fixes the guns by itself, without any fudging: a rifle costs 5,000gp in the rules and a
scimitar costs 15gp, so the Longue Carabine was never going to be a bargain once the real numbers
were in.

It also caught a rules mistake I'd made. In Pathfinder a weapon has to be **+1 before it can hold
any special ability at all**, and the abilities stack on top of that. I'd been flooring it, which
meant **keen, holy and flaming were effectively costing nothing** — a keen blade priced the same
as a plain one. Fixed.

What that means at the stall:

- A plain named weapon (Fauchard, Force Pike, Kagero Sansetsukon) — about **2,300g**, the same as
  a generic +1 longsword.
- A keen or elemental one (Lammas Aeternum, Raison d'Acier, Stormcaller) — about **8,300g**.
- The guns carry their real price: **Longue Carabine and the DVL-10 at 7,300g**, the Chainsaw at
  11,000g.
- The monsters: **Ton Bokiri 32,314g**, **Rovadra 37,300g**, and **Redeemer at 50,350g** — the
  end-of-campaign prize it always should have been.

---

## v1.2.0 — 2026-07-14

**The merchant got interesting, and there are named weapons in the world now.**

**Signature weapons.** The 28 named weapons from the poker dungeon — Redeemer, Ton Bokiri, the
Longue Carabine, Voidshard, HAMMERTIME and the rest — exist in PGM. In poker they belong to
specific characters and you can never pick one up. Here they're **loot**.

- Their magic is **built into the weapon**, not bought. Redeemer burns and sears the wicked even
  at +0; Ton Bokiri is keen, unholy, and reaches far enough to pull things out of the air.
  Enchanting one with a +1, +2 and so on stacks *on top* of what it already is.
- **Find them in the deep.** Nothing above the third room down. Below that, the chance climbs the
  further you go — the reward for pressing on rather than for clearing one more room.
- **Or buy one**, if the party purse can stand it (see below).

**A real shop.** The merchant always has the boring, necessary things: cure potions, alchemist's
fire and acid, spell components, plain and masterwork steel, and +1/+2 gear. On top of that he
lays out **three rare pieces on the good cloth — and they change every ten minutes.** There's a
countdown on the stall. If you can't afford the thing you want, you can come back, but it won't
be there.

The shopfront itself is new: search it, filter it by kind, and every item tells you what it does
and whether you can actually afford it.

**You can hear the fight while you shop.** You only stepped aside — the dungeon didn't stop for
you, and your turns are still passing. Now you *hear* that: the combat carries on, muffled,
through the wall. (It's the same effect the poker table uses to hear the dungeon below.)

**For blind players**, the shop is fully playable without touching the screen: press **Escape**
for the shop's own menu — buy any of the three rare pieces by number, have the rest of the stock
read out, ask how long until the stall changes, check the purse, or leave. Weapon stats are read
out in words ("two d ten, crit twenty, times four") rather than as symbols.

**A note on pricing.** Poker gives these weapons away free to the characters who own them, so it
never had to price them. Putting them in a shop exposed that: priced by enchantment alone, the
Longue Carabine — a 2d10 sniper rifle with no magic on it at all — came out at 315 gold, making
it the cheapest *and* the deadliest thing on the shelf. Raw lethality now costs. The humblest
named weapon runs about 3,800 gold; Redeemer and Rovadra are end-of-campaign prizes at nearly
40,000.

---

## v1.1.1 — 2026-07-14

**Black Tentacles stopped following you around.** A grasping-tentacle field is supposed to fill
*the room you cast it in*. Because of a bug it was never cleared when you took the next door, so
once anyone cast it, the tentacles kept grabbing for the rest of the delve — in every room after.
The field now dies with its room, the same as every other room-long effect.

Also: the new seeing/invisibility spells now have a **test suite** behind them, so the fiddly part
— See Invisibility letting you hit an invisible foe while *still* being fooled by a mirror image,
and only True Seeing piercing both — can't quietly break in a future change.

---

## v1.1.0 — 2026-07-14

**Going invisible finally means something.** It turns out PGM had never really implemented the
unseen: you could turn invisible and enemies would still walk right up and hit you, and they
could vanish and you'd still target them without trouble. That whole layer was missing. It's in
now, and it cuts both ways.

- **Vanish and they lose you.** An invisible hero can't be targeted at all — unless a foe can
  genuinely see the unseen.
- **The Erinyes can.** Those fallen-angel archers have TRUE SEEING. They'll pick you out of the
  air while you're invisible, and their arrows find the real you straight through Mirror Image
  and Displacement. Hiding is not a plan against them.
- **Invisible enemies now actually hide.** You can't target a foe that's gone unseen unless
  somebody in the party can pierce it — darkvision, blindsense, See Invisibility or True Seeing.

**Two new spells to answer it:**

- **See Invisibility** (2nd level — wizard 3, sorcerer/magus/inquisitor 4, bard 7). You can find,
  target and hit invisible foes with no miss chance. It does *not* see through Mirror Image or a
  displaced blur — that still takes True Seeing.
- **Invisibility Purge** (3rd level — cleric 5, inquisitor 7). A blaze of revealing light that
  **does not discriminate.** It drags *every* invisible creature in the room into view — **your
  own allies included** — and nothing on either side can turn invisible again that room. Purge
  while your rogue is lying in wait for a Sneak Attack and you burn him too. That's the cost.

(**True Seeing** already existed at higher level and still does everything: sees the invisible
*and* pierces illusions.)

---

## v1.0.0 — 2026-07-14

**Playable by ear, properly.** Josh reported that PGM was "not at all close" to poker-dungeon
for ease of play. He was right, and the reason was structural: PGM expected you to *Tab through
the page* to find things, but the screen redraws constantly during a delve — every redraw threw
his cursor somewhere else. Poker never asks you to do that; it gives you **stable keys** and
talks to you. PGM now works the same way.

- **Escape is now your menu, anywhere in the game.** Press it and you hear a numbered list of
  exactly what you can do on this screen — press the number to do it. No hunting, no Tabbing.
  - On the **main screen**: start your own delve, or join/rejoin any delve in progress.
  - In the **lobby**: "Start the adventure" is item 1 (the button that used to be unfindable),
    plus add an AI companion, plus back to the main menu.
  - In the **pub**: set out again, or back to the main menu.
  - In the **dungeon**: open the next door, shop, retreat, or back to the main menu.
- **`A` repeats the last thing you were told** — same key as poker, for when a report goes by
  too fast.
- **Every screen has a spoken guide, and it repeats.** You get a short "here's what this screen
  is" instead of a one-time flood of key names you'd have to memorize.
- **The narrator stopped reading emoji.** Icons no longer come through as garbage in the middle
  of a sentence, and `12/20` now reads as "12 of 20".
- **Help mode is no longer a trap.** Josh: "once you go into help mode you can't get out — `?`
  only tells you about help mode, Escape only tells you about the escape menu." `?` now toggles
  help off again, and Escape is a second way out.
- **The spacebar belongs to your screen reader again.** PGM was swallowing every Space for
  push-to-talk, which broke VoiceOver's own click (VO+Space) and Space on a focused button.
  Push-to-talk now only takes a bare Space when you aren't on a control.
- **`H` in the lobby reads the party roster** — who's in, and what they are.
- **Character creation announces your choices.** Cycling an icon speaks its name; changing race
  or class confirms the new pick out loud; pressing Enter in the avatar search filters the list
  instead of skipping you ahead to skills.
- **You can join a delve again.** That was broken.

**Also new in this build:** a version number, this changelog, and a `/api/version` endpoint —
so a bug report can say *which* PGM it happened on.

---

## Before v1.0.0

PGM had no version numbers before this, so these are grouped by the week they landed,
reconstructed from the commit history.

### 2026-07-13 — the big feature batch

- **A shop, inside the dungeon.** Buy gear mid-delve. You show up as **Shopping** and your
  turns auto-skip — the dungeon doesn't politely wait for you.
- **Sell anything** — art objects, gear, even spell components — for 50% into the party purse.
- **AI companions claim loot** that's relevant to them if no human takes it by the next round.
- **Enemy and companion turns now take a beat** (1–2 seconds) instead of resolving in an
  instant blur, and stream in as they happen.
- **Rooms got interesting**: 14 room archetypes, varied phrasing, sensory detail, scaled by depth.
- **Health and XP bars** on every hero card. Enemies show a health bar only — in quarters, with
  no numbers. You don't get to read a monster's exact hit points.
- **Click an item in your pack to use it.**
- **Pick your hero's art** from a large token gallery.
- **Raise Dead** moved onto the dead character's own card, with the price on it, and plays the
  Breath of Life sound when it lands.
- **Companions talk during combat** again.
- **Delete a delve you host** (with a confirmation).
- Fixed: the pub screen showed no services and no way to leave; rejoining after a reload;
  panels overlapping the header on the main screen; cantrip cycling not changing the spell you
  actually cast.

### 2026-07-12 — progression

- Fair encounters, proper PF1 leveling, and XP for clearing rooms, using skills, and treasure.
- **Free actions are free**: Rage, Power Attack, Mage Armor and Overland Flight no longer eat
  your turn.
- The poker action bar came over: Melee/Ranged, ability buttons, spellbook.
- Queue an action while it isn't your turn.

### 2026-07-11 — the foundation

- **Player accounts** — sign in once, be remembered, and your delves follow you.
- **Delves you can save, leave, and resume.**
- **Death, PF1-style**: dying down to negative Constitution, negative levels, TPK graves, and
  recovering your party's corpses.
- **The Swashgoblin**, the pub between delves.
- **Real PF1 treasure tables** — CR-scaled hoards of coins, gems, art and vetted magic — and a
  party loot pile you divide.
- **You roll your own initiative.**

### Up to 2026-07-10 — bring-up

The poker-dungeon rules engine transplanted into PGM behind a compatibility shim, the
blind-first frontend, live updates, and the first delves.
