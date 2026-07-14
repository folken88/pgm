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
