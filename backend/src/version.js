// PGM — the ONE app version (semver). The boot log, /api/version, /api/meta and
// the client topbar all read this. MANDATE (Tobias 2026-07-14, mirroring poker):
//   · bump MINOR for each feature batch, PATCH for fix-only batches
//   · note the change in one line below, newest first, and keep each line short
//   · rewrite HEADLINE with every bump (it is what players see)
//   · every patch-note email to Josh must carry APP + VERSION in the SUBJECT,
//     e.g. "PGM v1.0.0 — patch notes"  (never a bare "Re:")
//   · the player-facing notes go in CHANGELOG.md; this block is the dev log
//
//  1.17.0 2026-07-16 THE QUIET ROOM (Tobias: "if there are all stealthed enemies that we fail to
//                    perceive, the gm should tell us the room is empty. then we can search for
//                    treasure or open the next door. if we open the next door we may pick a fight w
//                    that room AND still have a stealthed enemy with us."). All-hidden + unperceived
//                    room now enters phase 'cleared' with the foes pocketed in run._lurkers: GM says
//                    "The room seems empty. Search it, make camp, or press on." — NO "something lurks"
//                    tell. New SEARCH action (once per quiet room, +2 sweep): spot them → they spring
//                    as a real fight; miss them → you pocket the treasure their XP budget owed. Press
//                    on unfought → the stalkers join the NEXT room's spawn (uid-safe), and only THEN
//                    does the passed room count toward depth. Mixed rooms (some seen) keep the old
//                    ambush tell. Session checkGraves gate widened so a quiet-room TPK-by-stalkers
//                    still buries the party. ALSO: PGM copy of poker v3.37.64 — toDungeonState now
//                    filters c.summoned, so YOUR summons stop appearing in the enemy target list
//                    (Josh's bug). 5 new quiet-room tests; save/restore + HELD + wizard-AI tests
//                    hardened (quiet-aware asserts, unique foe name vs same-name packmates, HP floor
//                    so the subject survives to act); suite 177 green ×12 via npm test (bare
//                    `node --test` skips _isolate.js and races the shared data dir — don't).
//  1.16.2 2026-07-16 BOARD LAYOUT HOTFIX (Tobias: "it does not work at all. can't see the enemies,
//                    can't take actions. broken."). v1.16.0 split the middle column into TWO grid
//                    children (.battlefield.dungeon-stage + .battle-below) — but the game layout's
//                    grid expects ONE middle child, so the action bar / log / choices / chat were
//                    shoved into the RIGHT column and the loot panel fell off the layout. The stage
//                    now NESTS inside .battlefield (one child again); action bar/log/choices/chat are
//                    direct children as before, so the .battlefield flex rules (log grows, rest
//                    doesn't) apply again. Re-tested by PLAYING: enemy card renders and click-to-
//                    attack kills a kobold, bar under the board, color-coded log under the bar, loot
//                    panel back on the right, no console errors. (His "room is quiet" moment was the
//                    STEALTH room — an unseen lurker; Hold passes the turn and the foe reveals. The
//                    invisible numbered choices are by DESIGN for sighted players — bar drives play.)
//  1.16.1 2026-07-16 THE GUNNERS FIRE (ported from poker v3.37.65): enemyAI reads e.ranged
//                    ("shoots" narration, bow/gun SFX on a MISS too, archers don't wrestle) but
//                    makeenemy never copied the flag off the base entry — dead feature. Added
//                    `ranged: !!base.ranged`; synced enemyAI so grounded archers/gunners also
//                    REACH flying heroes (e.flying || e.ranged) instead of clawing at the air.
//  1.16.0 2026-07-16 POKER'S BATTLE BOARD, TRANSPLANTED (Tobias, with poker screenshot: "our battle
//                    ui does not look like this — you can literally steal the code & css & layout").
//                    Stolen as instructed: the board is now poker's dungeon stage —
//                    · the STAGE: dark scrim over poker's harrowstone floorplan map (copied), rounded
//                      board frame; enemy cards across the top, the turn line centered ("… X's turn …"
//                      phrasing), hero cards beneath.
//                    · ENEMY CARDS (.dmon): round portrait (or glyph), name, red HP bar, red-trim
//                      frame; the acting foe glows ember (is-turn); DEAD foes collapse to tiny
//                      grayscale corpse chips; crowded rooms auto-shrink (is-compact/is-packed).
//                      Click-to-target kept; enemy HP stays a coarse bar with NO numbers (PGM rule).
//                    · HERO CARDS (.dpc): FULL-ART portrait backdrop under poker's legibility scrim,
//                      name top-left + (you)/🤖/☠️/🩸 tags, buff strip top-left (green ring) +
//                      debuff strip top-right (red ring, poker's condition art — copied
//                      /dungeon/conditions/*.webp), green HP bar + blue XP bar, "HP · Lv" line
//                      bottom-left, 🛡 AC badge bottom-right, gold is-me/is-turn glow, is-low red
//                      trim, pulsing is-down for the dying, dead shrink to slim chips; ⏳ queued /
//                      🛒 shopping / ⭐ leveling shoulder badges.
//                    · poker's FLIP animations: cards SLIDE on reorder instead of snapping.
//                    All CSS is poker's table.css block with its palette vars mapped onto emberwood.
//                    Blind mode untouched (narration reads state, not DOM); aria labels preserved.
//                    Verified live: fought a room on the new board — stage map, chips, glow, corpse
//                    behavior, color-coded log all render.
//  1.15.2 2026-07-16 FLY ON ALLIES FOR REAL (ported from poker v3.37.63): SPELL.fly said
//                    target:'ally' but the GENERATED kits bake their own copies of every entry and
//                    all three kit-borne Fly entries still said 'self' — wizard/sorcerer/magus could
//                    only self-cast, and the AI fly-an-ally branch (filters on target:'ally') never
//                    fired. A post-override pass in pf1core/pf1data/abilities.js now normalizes every
//                    kit Fly (ally + canHitFlyers + touch-spell desc). Same trap as See Invisibility.
//  1.15.1 2026-07-15 POKER'S BUFF ART ON THE CHIPS (Tobias: "using the icons you currently are is ok,
//                    but if you don't have a perfect one, poker dungeon has icons for many buffs").
//                    Copied poker's 26 painted buff icons (/dungeon/buffs/*.webp, from the poker stack
//                    on the NAS) into PGM and wired `img` through the chip pipeline: BUFF_META /
//                    PRECAST_META / the standalone-flag chips carry an art path where one exists
//                    (rage, power attack, deadly aim, bless, inspire, prayer, divine favor, heroism,
//                    good hope, mage armor, shield, shield of faith, stoneskin(+DR/barkskin),
//                    cat's/bull's/bear's, prot-evil, prot-fire, haste, smite, invisible, fly — with
//                    poker's own art reuses: displacement/mirror-image/blur ride the fly art, GMW
//                    rides bull's strength). buffChips renders the image inside the gold-ringed chip;
//                    EMOJI stays the fallback for everything else (order deeds, challenge, fire
//                    shield…). Verified: hero + enemy chips serve art paths; render checked in Chrome.
//  1.15.0 2026-07-15 FEEDBACK BATCH (Tobias, mid-delve screenshot):
//                    · SPEECH: "BAB" now spoken as the word "bab", "HP" spelled "H P" (WORD_FIXES).
//                    · TERSE PLAY-BY-PLAY: blind combat lines compress aggressively — "Farrus Richton
//                      flies into a RAGE!" speaks as "Farrus: rage." General convention (casts/buffs/
//                      smite/taunt/channel lines all compress); the SCREEN keeps the full flavor.
//                      dungeon-blind's said() now runs _terse() after glyph-strip.
//                    · FORCE SIZE SCALES WITH PARTY (roomgen): foe cap = ~1.25/hero (max 10, was a flat
//                      6) and a per-hero FLOOR (ceil(party/2)) padded with cheap same-gang fodder — a
//                      7-hero party no longer strolls over two drones. Verified: 2 heroes → 1-3 foes,
//                      8 heroes → 4-7.
//                    · ENEMY (and hero) WARDS ARE CHIPS: "warded: shieldoffaith" text is gone —
//                      pre-cast wards render as buff icons (🛡️ Shield of Faith, 🔷 Mage Armor…) via
//                      buffList/PRECAST_META; enemies with numeric shaman-blessings get a generic
//                      ✨ Enchanted chip (poker's _enemyBuffList).
//                    · COLOR-CODED LOG (subtle): damage/failed saves red, EXACT-meet rolls yellow
//                      (= N vs N), made saves green, healing blue, deaths strong red (classifyLog).
//                    · FARRUS'S TAUNT is the standard barbarian PREDATOR YELL again — the shim now
//                      owns _abTaunt minus poker's per-character grandpa-ghost clip (sync-safe copy).
//                    · SPELLS YOU CAN'T CAST YET ARE GONE: the turn spell list filters minLevel, so a
//                      L2 sorcerer no longer sees an Overland Flight button that answers "needs level
//                      10" (the bar's Spellbook keeps poker's availability locks).
//                    · "no action 8": that's poker's kit-slot keymap talking (blind numbers are
//                      1=attack, 2..N=abilities — NOT the sighted numbered buttons); with unavailable
//                      spells filtered the two lists align much closer. Input fields already guard keys.
//  1.14.0 2026-07-15 TTS SHORT NAMES for every entity (Tobias: "'Duristan Silvio' should just be
//                    'duristan' to tts… Make a nickname for every entity"). New PGM-only
//                    backend/src/ttsShort.js: a curated 119-entry map (validated — every key matches a
//                    real roster/bestiary name). Characters → first name (Duristan, Farrus, Kate,
//                    Storgrim, Femmik, Freya, Kai, Rodney, Lou, Bujon…); honorifics drop (Lord Gweyir →
//                    Gweyir, Mr. Brow → Brow) EXCEPT Ser Toche (Tobias: "ser is her first name" — kept
//                    whole); Auren Vrood → Vrood. Monsters shorten to the word that stays DISTINCT
//                    within the gang they fight beside (Vampire Knight → Knight, WW Necromancer →
//                    Necromancer, Gearsman 6.0 Thought Harvester → Harvester, Skeletal Champion →
//                    Champion); collision-prone names keep whole (Hill/Stone Giant, Black/Void Dragon,
//                    the X-Devils, Skeletal Ogre vs Ogre…). Player-typed names spoken as typed.
//                    PLUMBING: /api/meta serves `ttsShort` pairs → BM.setNicknames compiles word-
//                    boundary regexes (longest first) → applied in earFix (ALL browser TTS) and on the
//                    text sent to /api/tts (11labs GM + companion voices). DISPLAY keeps full names.
//                    Verified live: "Duristan Silvio hits the Skeletal Champion A…" speaks as
//                    "Duristan hits the Champion A…"; suffix letters survive. Suite green.
//  1.13.3 2026-07-15 BLIND-MODE TOGGLE SAID "?" TWICE (Tobias: "it told me about '? to learn the
//                    keys' twice, once immediately and then another after recognizing me by name").
//                    The toggle acknowledgment ("Blind mode on. Press question mark any time to learn
//                    the keys") AND the screen guide that always follows it ("Welcome back, Toby.
//                    Press question mark for help") both taught the ? key. The toggle line is now just
//                    "Blind mode on." — the guide (onBlindOn hook, and the boot-time guide on reload)
//                    delivers the single ? instruction. Verified with a speechSynthesis spy: toggling
//                    now speaks exactly "Blind mode on." then "<welcome>. Press question mark for
//                    help." — one ? mention.
//  1.13.2 2026-07-15 LANDING TITLE DE-DUP. Since v1.8.0 the header said "Personal Game Master"
//                    directly above the banner that also says "PGM — your personal D&D game master" —
//                    the name twice, back to back. On the LANDING only, the header's h1 + tagline are
//                    now VISUALLY hidden (pure CSS :has(#landing:not([hidden])) — no JS) so the banner
//                    carries the title alone; they stay in the accessibility tree (the h1 is still the
//                    page heading for VoiceOver) and every other screen keeps them. Verified: hidden on
//                    landing, visible off it, back-hidden on return; a11y tree intact.
//  1.13.1 2026-07-15 HERO DEATH CRY (Tobias). PGM heroes died SILENTLY — the "💀 X is DEAD" beat
//                    carried no sound (hero_death.mp3 sat unused in /audio). Added a `death` pool to
//                    sounds.js — a random pick of hero_death.mp3 + the new ack.mp3 (Tobias dropped it
//                    in; poker got the same clip) — and played it on both hero-death paths (paced +
//                    sync drivers, where a hero drops past −CON and is slain). Verified: a real death
//                    emits the beat with a picked death sound; 172/172.
//  1.13.0 2026-07-15 THE LAST TWO CAVALIER ORDERS — Cockatrice + Shield. ALL SIX playable orders are
//                    now live (Flame, Lion, Dragon, Star, Cockatrice, Shield; Sword still deferred
//                    with mounts). These two needed real COMBAT-EVENT HOOKS for their passive deeds,
//                    so this version also builds a small sync-safe reaction layer in the shim:
//                      · _resetAbilities wrapper → cavOrders.applyRoomPassives (per-room passives)
//                      · _fireShieldRetaliate → cavOrders.onHeroHitByFoe (fires whenever a foe melee-
//                        hits a hero — it already ran there for Fire Shield)
//                      · _swingVsAC wrapper → cavOrders.onHeroCrit (fires on a hero crit)
//                    COCKATRICE (the lone glory-hog): Challenge = +damage vs your challenged foe while
//                    you're its ONLY attacker (target._meleeBy). L2 Braggart — a Dazzling Display that
//                    shakens the whole room (rides the party-buff enemyPenalty path like Prayer) and
//                    +2 damage vs shaken foes. L8 Steal Glory (PASSIVE) — when an ALLY crits, you snatch
//                    a free strike (guarded against chaining off your own crit). L15 Rally (PASSIVE) —
//                    the blow that would drop you leaves you at 1 HP instead, once per room.
//                    SHIELD (the protector): Challenge = +to-hit vs your challenged foe once it has
//                    struck an ally (e._engagedAlly). L2 Resolute (PASSIVE) — DR 1/—, +1 per 5 levels.
//                    L8 Stem the Tide (PASSIVE) — when a foe strikes an ALLY, you interrupt with a free
//                    strike (once per round). L15 Protect the Meek — throw a +4 AC/+2 deflection ward
//                    over a comrade. All PGM-only; deeds reuse buff/enemyPenalty; nothing touches a
//                    synced file. Verified end to end in a live run: Steal Glory + Stem the Tide land
//                    real free strikes, the once-per-round/room guards hold, Rally saves once. +5 tests;
//                    172/172. Cavalier Orders project COMPLETE (six of seven; Sword awaits mounts).
//  1.12.0 2026-07-15 ORDER OF THE STAR IS LIVE — the third new cavalier order (Flame + Lion + Dragon
//                    before it), built the same sync-safe way. The faithful:
//                    · CHALLENGE — a morale bonus to ALL your saves (+1, +1 per 4 levels) while you
//                      hold a challenge. Hooks the shim's _partySaveMod exactly like Lion hooks
//                      _acBonus — a new cavOrders.orderSaveBonus folded into the hero-save math.
//                    · L2 CALLING — a whispered prayer: +your level (capped +5) to your attacks AND
//                      all your saves for the room, twice per room.
//                    · L8 FOR THE FAITH — a battle-cry: the WHOLE party fights in your light, +your
//                      Charisma to hit for the room.
//                    · L15 RETRIBUTION — holy answering fire: for the room, any foe that strikes you
//                      or an ally is seared (reuses poker's fireShield retaliate-on-melee, applied
//                      party-wide). Once per room.
//                    All deeds reuse the buff/fireShield handlers; the only new surface is the
//                    save-bonus hook. Verified end to end: the +save lands through _partySaveMod
//                    (0→+2 at L5 while challenging), and Retribution/Calling/For-the-Faith all apply
//                    through the real _useAbility. +3 tests; 167/167. Remaining: Cockatrice, Shield
//                    (their passive deeds need the combat-event hook layer — next).
//  1.11.0 2026-07-15 ORDER OF THE DRAGON IS LIVE — the second new cavalier order (after Lion) to get
//                    full mechanics, so it flips `built` and is selectable on the Leveling screen.
//                    The tactician — you make the whole party better:
//                    · CHALLENGE — your ALLIES get +to-hit (+1, +1 per 4 levels) against the foe YOU
//                      have challenged (you don't stack it on yourself — your Challenge already adds
//                      your damage). This established the OFFENSE seam: shim now wraps _swingVsAC
//                      (poker's attack resolver) and folds in cavOrders.swingMods — toHit/ac add to
//                      the roll, and a generic bonus-DAMAGE path (briefly marking the target as the
//                      attacker's quarry, restored right after) is ready for Cockatrice/Shield.
//                    · L2 AID ALLIES — hand a comrade a big opening: +N to hit AND AC (N = 2 + the
//                      challenge step, so +3 at L2), up to three allies per room.
//                    · L8 STRATEGY — a battle plan: the WHOLE party +1 to hit and +2 AC for the room.
//                    · L15 ACT AS ONE — the party moves and strikes as one: a party-wide HASTE surge
//                      (an extra attack each turn) for the room. Reuses poker's _abHaste.
//                    All PGM-only (pgmCavalierOrders.js + shim wrappers); deeds reuse the buff/haste
//                    handlers so the synced _useAbility runs them natively. Verified end to end: the
//                    ally +to-hit lands through the real _swingVsAC (0→+1 at L1). +3 Dragon tests;
//                    164/164. Remaining: Cockatrice, Shield, Star.
//  1.10.0 2026-07-15 REST / MAKE CAMP between rooms (Tobias: "the party can also rest, but resting
//                    adds 1 cr to the next room… heals a certain amount, restores spell slots, and
//                    causes healing classes to expend all their remaining healing on the party at
//                    bedtime"). In a cleared room a new "🏕️ Rest & make camp" action: a night's sleep
//                    heals everyone +50% max HP, and if a HEALER (cleric/oracle/druid/paladin/bard/
//                    inquisitor/warpriest/shaman) is along they pour out the day's remaining cures to
//                    top the party to FULL — the bedtime healer dump. Spell prayers renew by dawn (PGM
//                    already refreshes slots each room). The cost: the campfire draws notice, so the
//                    NEXT room comes +1 CR (modeled as a bump to the party level the encounter budget
//                    fits to — spawnRoom's genApl). Once per cleared room; the +1 CR is consumed on
//                    descend, then cleared. Wired everywhere: sighted action-bar button (hidden once
//                    camped), the numbered blind choice list, AND the Escape action hub — so a blind
//                    player rests by ear too. publicRun exposes `rested`. 5 new tests; 161/161.
//                    NOTE: "clerics heal between rounds" is delivered as this bedtime dump (they spend
//                    their about-to-refresh cures on the party at camp); a manual out-of-combat cure
//                    cast UI can follow if wanted.
//  1.9.0  2026-07-15 BUFF ICONS ON THE CARDS (poker parity — Tobias: "cards don't show buff icons,
//                    again a feature that fully works in poker-dungeon"). Every active buff now
//                    shows as its own little chip on the hero/unit card — Rage 😤, Power Attack 💥,
//                    Bless ✨, Haste 💨, Shield 🛡️, Prayer 📿, Divine Favor 🙏, the Lion order buffs,
//                    etc. Structure mirrors poker's _buffList: a BUFF_META map (key→icon/label/desc)
//                    + a buffList(c) that reads m.buffApplied + m.runBuffApplied (TRUTHY, not
//                    key-exists — a toggled-OFF stance like Deadly Aim stays as key:false) PLUS the
//                    standalone flags (haste/smite/invisible/flying/mirror-image/displacement/DR/
//                    fire-shield/fire-ward/true-seeing/see-invis/cavalier-challenge/slayer-studied).
//                    Emoji not webp (PGM has no /dungeon/buffs art and is emoji-forward); chips are
//                    gold-ringed, each carries aria-label=name + title="name — effect". publicRun now
//                    sends buffIcons:[{key,icon,label,desc}] AND upgrades the blind B-key readout from
//                    a single generic "blessed" to the actual named buffs. Dropped the old generic
//                    'blessed' condition (buffs are named now). Verified: buffList excludes toggled-off
//                    stances, chips render gold-ringed on the card. 156/156.
//  1.8.1  2026-07-15 MIME fix (on top of 1.8.0): the static server had no content-type for images/
//                    audio/fonts, so the new banner + OG card (and every token/mp3) served as
//                    application/octet-stream. Browsers sniff and render those fine, but strict
//                    social-card scrapers want a real image/jpeg on the og:image. Added the map
//                    (webp/png/jpg/jpeg/gif/avif, mp3/wav/ogg/m4a, woff/woff2/ttf). The card now
//                    serves as image/jpeg.
//  1.8.0  2026-07-15 EMBERWOOD — a new look, and the banner art. Tobias delivered a firelit
//                    key-art banner (a party at a glowing crimson doorway, "PGM — your personal
//                    D&D game master"). It's now (a) the landing HERO image and (b) the social
//                    link-preview card (Open Graph + Twitter summary_large_image → og:image
//                    /img/pgm-card.jpg, 1200×630). Banner processed with PIL to webp (1920w hero
//                    + 960w) and a letterboxed JPG card; the source PNG stays the master in
//                    Downloads. THEME: blended the banner's palette INTO darkwood — the old
//                    "darkwood" becomes "emberwood": ebony dragged toward the art's black
//                    (--bg #0d0605), walnut steeped in oxblood, and the doorway's blood-crimson
//                    (--crimson #a81d18) + ember-orange (--ember #e8461f) added as the energy
//                    color beside the steady brass. Primary CTAs now glow like the doorway
//                    (crimson→ember gradient + ember bloom on hover); a faint ember radial sits
//                    behind the header; headings underline crimson→brass. Brass stays the calm
//                    accent; the cool-blue focus ring is kept on purpose (crisp against the warm
//                    theme). Banner is aria-hidden (the header <h1> already names the app, so no
//                    double announce — blind mode unchanged). Static/asset + version bump only.
//  1.7.0  2026-07-15 ORDER OF THE LION IS LIVE — the first of the five new cavalier orders to get its
//                    FULL mechanics (Challenge modifier + L2/L8/L15 deeds), so it flips `built` and
//                    becomes selectable on the Leveling screen. The guardian order:
//                    · CHALLENGE — a dodge bonus (+1, +1 per 4 levels) while you hold an active
//                      challenge, folded into the hero AC the enemy rolls against (shim _acBonus).
//                    · L2 LION'S CALL — a rallying roar: the whole party fights with +1 to hit and +2
//                      to all saves for the room (twice per room).
//                    · L8 FOR THE KING! — a battle-cry lending the party your Charisma: +Cha to hit AND
//                      damage for the room (once per room).
//                    · L15 SHIELD THE LIEGE — throw your guard over a comrade (+4 AC / +2 deflection),
//                      AND a passive aura: every ally has +2 AC while you stand.
//                    ALL of it is PGM-only — a new pokerdungeon/pgmCavalierOrders.js holds the order
//                    mechanics, wired from the shim (_acBonus for the AC, an _abilitiesFor wrapper that
//                    appends the cavalier's OWN order deeds, level-gated so only usable deeds appear).
//                    The deeds reuse the engine's existing `buff` handler (party/ally buffs), so the
//                    synced _useAbility runs them natively — uses, action, targeting, blind refusals —
//                    with no new plumbing and nothing touching a poker-synced file. The remaining four
//                    (Cockatrice, Dragon, Shield, Star) flip on as each one's mechanics land next.
//                    5 new Lion tests; suite green.
//  1.6.0  2026-07-15 THE LEVELING SCREEN + CAVALIER ORDERS (choice framework). A class can now make a
//                    defining choice (the Cavalier's Order; domains/bloodline later), resolved on a
//                    new blind-first Leveling screen modeled on the shop: opening it auto-skips your
//                    turns and muffles the battle HARDER than the shop (lowpass ~250Hz, ~0.25× vol) so
//                    the TTS reading the choices is clear. Available out of combat (lobby for a new
//                    character, between rooms on level-up); if others descend while you choose, your
//                    turns pass and you catch up. Escape is the leveling menu (numbered options, each
//                    spoken with what it does); sighted players get a ⭐ Level-up button.
//                    Orders unlock from the CHOICE, not a name: character.choices.order gates the deeds
//                    (shim _orderOf / _charAllows override re-reads the synced Flame deeds' Gweyir gate
//                    as order:'flame'); Lord Gweyir stays Flame by identity. All PGM-only (choices.js,
//                    shim.js) so the poker sync can't clobber it. Verified end to end: create a cavalier
//                    → lobby Level-up → pick Order of the Flame → the action bar shows Challenge,
//                    Glorious Challenge, Blaze of Glory. Six orders defined (Flame + Cockatrice, Dragon,
//                    Lion, Shield, Star; Sword deferred with mounts) but only FULLY-BUILT orders are
//                    selectable (a `built` flag) — right now that's Flame; the other five flip on as
//                    their L2/L8/L15 mechanics land (next pass). 153/153.
//  1.5.0  2026-07-14 CAVALIER + GUNSLINGER ARE PLAYABLE (Tobias: "where is the cavalier class with the
//                    order of the flame?"). Both were fully built in the engine (SELECTABLE_CLASSES)
//                    but missing from the create dropdown (characters.js was out of sync) — added.
//                    ALSO FIXED a real bug the cavalier exposed: the action bar was built from the
//                    STATIC kit (kitFor), but some classes add features at RUNTIME (_abilitiesFor) —
//                    a cavalier's Challenge, a theurge's union kit. So a created cavalier showed only
//                    fighter maneuvers, its Challenge invisible/unreachable. publicRun now sources the
//                    action bar from _abilitiesFor (the same list the engine validates casts against),
//                    so the display matches what actually works. Verified: cavalier now shows Challenge;
//                    fighter/wizard/cleric unchanged; 148/148.
//                    ORDER OF THE FLAME is Lord Gweyir's order (he is a recruitable companion) — a
//                    generic player cavalier gets base Challenge; the Flame deeds (Glorious Challenge,
//                    Blaze of Glory) stay char-gated to Gweyir, matching poker. Open question for Tobias:
//                    make player cavaliers Order of the Flame too? (it's the only order built.)
//  1.4.0  2026-07-14 FEEDBACK BATCH (Tobias): less chatter + several fixes.
//                    · BOARD SHOWS THE CHARACTER NAME, not the account name. Toby's "Lien" now
//                      appears on the board (heroCombatant reads the character name). The create
//                      screen has a real Character-name field, threaded through /api/session/character
//                      → setCharacter → character; the member's account name (toby) stays separate.
//                    · LESS OVER-TALKING (studied poker's discipline via a subagent — it narrates ONLY
//                      on 4 deltas: new room, fresh log line, YOUR turn, run-end/loot; everything else
//                      is key-gated). Applied: the turn prompt reads the enemy HP% list ONLY when the
//                      lineup CHANGED since you last heard it (a foe died / appeared) — otherwise just
//                      "Your turn." (F re-reads them). Filtered out developer bookkeeping lines
//                      ("(vetting: … diverted to gems)") from narration. Guarded the skill-points line
//                      so it can never leak off the skills screen (Tobias heard "3 skill points"
//                      mid-combat).
//                    · TOGGLES MAKE A SOUND, not a spoken line (Tobias). Power Attack / Deadly Aim /
//                      stances (cost 'free', self-target) now play a two-tone blip to confirm they are
//                      on, instead of speaking the label.
//                    · LANDING/SCREEN GUIDES trimmed to one short line ending "press question mark for
//                      help"; ? now STEPS THROUGH the screen's help one piece per press (onHelp hook +
//                      HELP_STEPS), instead of a wall of text (Tobias: "says a ton of shit on the main
//                      page").
//                    · SKELETAL CHAMPIONS are disarmable now — removed from NATURAL_KEYS; they swing a
//                      real 1H weapon (battleaxe/longsword/warhammer). (Same fix belongs upstream in
//                      poker's monsters.js, which PGM syncs from.)
//                    DEFERRED to next batch: buff icons on hero cards (poker parity); the Rest mechanic
//                    + cleric between-rounds healing.
//  1.3.1  2026-07-14 RESTORE THE 11LABS GM VOICE IN BLIND MODE (a v1.3.0 regression I caused).
//                    Tobias: "blind mode isn't doing narration with 11labs… it does everything with
//                    tts, is there no way you can queue those 2 different voice elements together?"
//                    The queue ALREADY does: blindmode.js's speakGM/speakAs fetch the ElevenLabs clip
//                    and push it as an `audioPromise` into the SAME serialized queue as the browser-TTS
//                    lines, so 11labs clips and the screen reader take turns (no overlap). v1.3.0 broke
//                    it — when I transplanted poker's narration I routed the GM `urgent` lines through
//                    browser TTS and SUPPRESSED speakGM in blind mode, so blind play went all-TTS.
//                    Fix, voices split by line priority through the one queue: banter → the companion's
//                    own 11labs voice (speakAs); urgent GM narration (room flavor, "room cleared", big
//                    beats) → the Ultron 11labs voice (speakGM), blind AND sighted; the fast combat
//                    play-by-play stays browser TTS (dungeon-blind.js narrates it for blind, app.js for
//                    sighted). toDungeonState marks banter+urgent lines `voiced` so the TTS play-by-play
//                    SKIPS them — 11labs owns them alone, no double-speak. Verified: room flavor +
//                    room-clear route to speakGM, hit/miss/turn lines to speak, nothing doubles.
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
const VERSION = '1.17.0';
const HEADLINE = 'The QUIET ROOM: when every foe hides and nobody spots a thing, the GM says the room seems empty — search it (find the hoard, or flush the ambush), rest, or press on. Unfound stalkers FOLLOW you into the next fight. Plus: summons no longer clutter your target list.';
module.exports = { VERSION, HEADLINE };
