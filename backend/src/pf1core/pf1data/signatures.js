/**
 * SIGNATURE WEAPONS — the named blades, guns and polearms from the poker
 * dungeon (poker: pf1data/staples.js `CUSTOM_WEAPONS`). Ported VERBATIM: same
 * dice, crit, type, group and `special` riders, so a weapon hits identically in
 * both games. In poker these are BOUND to a character (a name→weapon map) and a
 * human can never pick one. In PGM they are LOOT: found in deep hoards, or the
 * merchant's rotating "items of the day" if the party has the coin.
 *
 * WHAT MAKES ONE SPECIAL — `custom: true` (always proficient, always at least
 * magic) plus the intrinsic riders, which are ALWAYS ON regardless of the +N
 * gear tier (Gabriel's Redeemer burns even at +0 — see swing.js `wsp`):
 *   keen (crit range) · flaming/frost/shock (+1d6) · flamingBurst/frostBurst
 *   (+ crit dice) · holy/unholy (2d6 vs evil/good, or a NUMBER of d6)
 * and the top-level riders: critFocus (+4 confirm) · impCritAt (weapon-borne
 * Improved Critical from level N) · finesse2h (DEX drives a two-hander) ·
 * reachFly (15' reach, can strike flyers) · dual (2 swings) · noShield ·
 * boltAction (no Rapid Shot) · atkSound.
 *
 * NOT PORTED (deliberately): the wild-shape forms (form_tiger/bear/beast/
 * promethean, bite, claws) and the class/backup weapons (shillelagh,
 * lightcrossbow, the pistol backups) — those are body parts and class features,
 * not treasure. Also skipped: `shieldAC` (poker's Sawtooth Saber & Dragon
 * Shield) — PGM's engine has NO shieldAC consumer, so it would be dead data;
 * J'Mal's sabers ship as the plain dual-wield `sawtoothsabers` instead.
 *
 * PRICE — poker never prices a weapon (it gives the riders away free and sells only
 * the +N tier). PGM has to put them in a shop, so they are priced from REAL DATA:
 * the FoundryVTT PF1 packs' price for the base weapon each one is built on, plus
 * PF1 RAW masterwork + enchantment. See BASE_PRICE and priceOf below.
 */

// PF1 RAW effective-bonus adders — what each rider is "worth" on the enchantment
// curve (the Ultimate Equipment melee-weapon special-abilities table). holy/unholy
// may be a NUMBER of d6 rather than `true` (Rovadra is only "a little bit holy",
// holy: 1) — in that case the number IS the adder.
const EFF_BONUS = {
  keen: 1, flaming: 1, frost: 1, shock: 1,
  flamingBurst: 2, frostBurst: 2, holy: 2, unholy: 2,
};
const MASTERWORK = 300;   // PF1 RAW: masterwork weapon, +300gp over the base

/**
 * BASE PRICE — the real gp cost of the mundane weapon each signature is built on,
 * taken from the FoundryVTT PF1 system packs (`weapons-and-ammo`, `technology`),
 * NOT invented (Tobias 2026-07-14: "pull them from the original items that inspired
 * these versions, the foundryvtt db has their original prices").
 *
 * This is what makes the guns price themselves honestly. PF1's enchantment curve
 * alone is blind to raw lethality — a 2d10 ×4 rifle and a 1d6 scimitar both cost
 * "masterwork + magic" — which is why the Longue Carabine first came out at 315gp,
 * cheaper than a +1 longsword. Foundry already knows a Rifle is a 5,000gp item and
 * a Scimitar is 15gp. Use its numbers and the problem disappears on its own.
 *
 * A few signatures are exotic pieces with no Foundry entry (three-section staff,
 * sawtooth sabre) — those fall back to the closest real base, noted inline.
 */
const BASE_PRICE = {
  // polearms & reach
  bastardsblade: 13,        // Bardiche
  fauchard: 14,             // Fauchard
  tonbokiri: 14,            // Fauchard (Ton Bokiri IS a fauchard)
  forcepike: 5,             // Longspear
  angelbonescythe: 18,      // Scythe
  // great blades
  redeemer: 50,             // Greatsword
  chainsaw: 2700,           // Chainsaw (technology pack — a real 2,700gp machine)
  elvencurve: 80,           // Elven Curve Blade
  estoc: 50,                // Estoc
  kagerosansetsukon: 15,    // three-section staff has no Foundry entry → quarterstaff-class exotic
  // one-handed blades
  raisondacier: 20,         // Rapier
  curator: 35,              // Bastard Sword
  lammas: 15,               // Scimitar
  balrogblade: 15,          // Longsword
  voidshard: 10,            // Battle Axe
  mithralscimitar: 515,     // Scimitar 15 + mithral (PF1: +500 for a light/1h mithral weapon)
  darksilverscimitar: 15,   // Scimitar
  ghosttouch: 12,           // Warhammer
  radiance: 15,             // Scimitar
  // dual-wield (a matched PAIR — you buy both)
  sawtoothsabers: 30,       // no Foundry sawtooth sabre → 2 × longsword-class exotic
  twoaxes: 20,              // 2 × Battle Axe
  gnomehammer: 20,          // Gnome Hooked Hammer
  // guns & bows
  rovadra: 5000,            // Rifle
  stormcaller: 100,         // Composite Longbow
  repeatingcrossbow: 250,   // Repeating Light Crossbow
  longbow: 130,             // Orc Hornbow
  lapua: 5000,              // Rifle
  dvl: 5000,                // Rifle
};

/**
 * The weapon's total effective enchantment bonus: the +N tier, plus its intrinsic
 * riders, on the PF1 pricing curve.
 *
 * RAW: a weapon must carry at least a **+1 enhancement bonus** before it can hold
 * any special ability, and the abilities then stack ON TOP of it. So a keen blade
 * is effectively +2 (a +1 weapon that is also keen), never +1. `custom: true` gives
 * every signature that baseline +1 for free — but the riders still have to be paid
 * for above it, or keen/holy/flaming would come out costing nothing at all.
 */
function effectiveBonus(w, enh = 0) {
  const sp = w.special || {};
  let riders = 0;
  for (const k of Object.keys(sp)) {
    const v = sp[k];
    if (!v) continue;
    // flamingBurst/frostBurst SUBSUME their base rider — don't charge for both.
    if (k === 'flaming' && sp.flamingBurst) continue;
    if (k === 'frost' && sp.frostBurst) continue;
    // holy/unholy can be a NUMBER of d6 instead of `true` — then the number is the
    // adder (Rovadra's holy: 1 is "a little bit holy", not the full 2d6).
    riders += typeof v === 'number' ? v : (EFF_BONUS[k] || 0);
  }
  return Math.max(1, enh) + riders;   // the mandatory +1 base, then the abilities on top
}

/**
 * What a named weapon costs — straight PF1 RAW, on real numbers:
 *
 *     Foundry base item price  +  masterwork (300)  +  effective bonus² × 2000
 *
 * No invented curve. The base price comes from the FoundryVTT PF1 packs (see
 * BASE_PRICE), which is what keeps the guns honest: Foundry already prices a Rifle
 * at 5,000gp and a Scimitar at 15gp, so the Longue Carabine stops being a 315gp
 * impulse buy without anyone having to hand-tune a "lethality premium".
 */
function priceOf(w, enh = 0) {
  const eff = effectiveBonus(w, enh);
  const base = BASE_PRICE[w.key] != null ? BASE_PRICE[w.key] : 15;
  return base + MASTERWORK + eff * eff * 2000;
}

const CUSTOM_WEAPONS = {
  // ── Polearms & reach ──
  bastardsblade: { key: 'bastardsblade', name: "Bastard's Blade", cat: '2h', ranged: false, dmgCount: 1, dmgDie: 10, crit: 18, mult: 2, type: 'S', group: 'polearms', prof: 'martial', custom: true, special: { keen: true }, reachFly: true, impCritAt: 9,
    lore: 'A duelist\'s glaive with a bastard\'s reach — it takes the wings off things that thought height was safety.' },
  fauchard: { key: 'fauchard', name: 'Fauchard', cat: '2h', ranged: false, dmgCount: 1, dmgDie: 10, crit: 18, mult: 2, type: 'S', group: 'polearms', prof: 'martial', custom: true, special: {}, reachFly: true,
    lore: 'A long hooked blade on a long haft. Unfashionable, unsubtle, and it keeps things at arm\'s length.' },
  tonbokiri: { key: 'tonbokiri', name: 'Ton Bokiri', cat: '2h', ranged: false, dmgCount: 1, dmgDie: 10, crit: 18, mult: 2, type: 'S', group: 'polearms', prof: 'martial', custom: true, special: { unholy: 2, keen: true }, reachFly: true,
    lore: 'The Dragonfly Cutter. They say a dragonfly that lit on the blade fell in two halves before it knew it had landed. It hungers, and it hates the righteous.' },
  forcepike: { key: 'forcepike', name: 'Force Pike', cat: '2h', ranged: false, dmgCount: 1, dmgDie: 10, crit: 20, mult: 3, type: 'P', group: 'polearms', prof: 'martial', custom: true, special: {}, reachFly: true,
    lore: 'A haft of bound force. It does not bend, it does not chip, and it reaches further than it looks.' },
  angelbonescythe: { key: 'angelbonescythe', name: 'Angelbone Scythe', cat: '2h', ranged: false, dmgCount: 2, dmgDie: 4, crit: 20, mult: 4, type: 'P/S', group: 'polearms', prof: 'martial', custom: true, special: { unholy: true },
    lore: 'Carved from something that used to sing. It is bitterest against the good — and it remembers being holy.' },

  // ── Great blades ──
  redeemer: { key: 'redeemer', name: 'Redeemer', cat: '2h', ranged: false, dmgCount: 2, dmgDie: 6, crit: 19, mult: 2, type: 'S', group: 'heavyBlades', prof: 'martial', custom: true, special: { flamingBurst: true, holy: true }, atkSound: '/audio/sword_eviscerate2_flaming.mp3',
    lore: 'It burns, and it burns the wicked twice over. A blade that forgives nothing and calls that mercy.' },
  chainsaw: { key: 'chainsaw', name: 'Chainsaw', cat: '2h', ranged: false, dmgCount: 3, dmgDie: 6, crit: 18, mult: 2, type: 'S', group: 'heavyBlades', prof: 'exotic', custom: true, special: { keen: true },
    lore: 'Exactly what it sounds like. Nobody asks where it came from; they just get out of the way.' },
  elvencurve: { key: 'elvencurve', name: 'Elven Curved Blade', cat: '2h', ranged: false, dmgCount: 1, dmgDie: 10, crit: 18, mult: 2, type: 'S', group: 'heavyBlades', prof: 'exotic', custom: true, special: { keen: true }, finesse2h: true,
    lore: 'A two-handed blade light enough to be led by the wrist. Grace, not brawn — it cuts on the turn.' },
  estoc: { key: 'estoc', name: 'Estoc', cat: '2h', ranged: false, dmgCount: 2, dmgDie: 4, crit: 18, mult: 2, type: 'P', group: 'heavyBlades', prof: 'martial', custom: true, special: {}, finesse2h: true,
    lore: 'No edge at all — just a long, stiff, murderous point, built for the gaps in armour.' },
  kagerosansetsukon: { key: 'kagerosansetsukon', name: 'Kagero Sansetsukon', cat: '2h', ranged: false, dmgCount: 1, dmgDie: 10, crit: 19, mult: 2, type: 'B', group: 'clubs', prof: 'exotic', custom: true, special: {},
    lore: 'A three-section staff that folds and flickers like heat-shimmer. Hard to read, harder to block.' },

  // ── One-handed blades ──
  raisondacier: { key: 'raisondacier', name: "Raison d'Acier", cat: '1h', ranged: false, dmgCount: 1, dmgDie: 6, crit: 18, mult: 2, type: 'P', group: 'bladesLight', prof: 'martial', custom: true, special: { keen: true },
    lore: '"Reason of Steel." A duelist\'s rapier, honed past sense — it argues, and it wins.' },
  curator: { key: 'curator', name: 'Curator', cat: '1h', ranged: false, dmgCount: 1, dmgDie: 10, crit: 19, mult: 2, type: 'S', group: 'bladesHeavy', prof: 'martial', custom: true, special: { keen: true },
    lore: 'It decides what is kept and what is discarded. So far it has discarded a great deal.' },
  lammas: { key: 'lammas', name: 'Lammas Aeternum', cat: '1h', ranged: false, dmgCount: 1, dmgDie: 6, crit: 18, mult: 2, type: 'S', group: 'bladesLight', prof: 'martial', custom: true, special: { keen: true }, critFocus: true,
    lore: 'The Eternal Harvest. It finds the seam in a thing and opens it — and it rarely misses the killing turn.' },
  balrogblade: { key: 'balrogblade', name: "Balrog's Blessed Blade", cat: '1h', ranged: false, dmgCount: 1, dmgDie: 8, crit: 18, mult: 2, type: 'S', group: 'bladesHeavy', prof: 'martial', custom: true, special: { flamingBurst: true },
    lore: 'Blessed by something that should not be able to bless. It runs hot, and hottest at the moment of the kill.' },
  voidshard: { key: 'voidshard', name: 'Voidshard', cat: '1h', ranged: false, dmgCount: 1, dmgDie: 8, crit: 20, mult: 3, type: 'S', group: 'bladesHeavy', prof: 'martial', custom: true, special: { frostBurst: true },
    lore: 'A splinter of somewhere with no sun in it. The cold comes off it in sheets, and it BITES on a clean hit.' },
  mithralscimitar: { key: 'mithralscimitar', name: 'Mithral Scimitar', cat: '1h', ranged: false, dmgCount: 1, dmgDie: 6, crit: 18, mult: 2, type: 'S', group: 'bladesHeavy', prof: 'martial', custom: true, special: {},
    lore: 'Light as a rumour, bright as a grudge. Mithral takes an edge that steel only dreams about.' },
  darksilverscimitar: { key: 'darksilverscimitar', name: 'Dark Silver Scimitar', cat: '1h', ranged: false, dmgCount: 1, dmgDie: 6, crit: 18, mult: 2, type: 'S', group: 'bladesHeavy', prof: 'martial', custom: true, special: {},
    lore: 'Rarely drawn, and never drawn twice in the same town.' },
  ghosttouch: { key: 'ghosttouch', name: 'Ghost Touch', cat: '1h', ranged: false, dmgCount: 2, dmgDie: 6, crit: 20, mult: 2, type: 'B', group: 'hammers', prof: 'martial', custom: true, special: { frost: true },
    lore: 'It lands on things that are not quite there, and it lands cold.' },
  radiance: { key: 'radiance', name: 'Radiance', cat: '1h', ranged: false, dmgCount: 1, dmgDie: 6, crit: 18, mult: 2, type: 'S', group: 'bladesLight', prof: 'martial', custom: true, special: {},
    lore: 'A sentient blade, and a patient one. It is waiting to see what you do with it.' },

  // ── Dual-wield ──
  sawtoothsabers: { key: 'sawtoothsabers', name: 'Angelbone Sawtooth Sabers', cat: '1h', ranged: false, dmgCount: 1, dmgDie: 8, crit: 19, mult: 2, type: 'S', group: 'bladesHeavy', prof: 'exotic', custom: true, dual: true, noShield: true, special: { keen: true }, critFocus: true, atkSound: '/audio/fight_riki.mp3',
    lore: 'A matched pair, serrated like a seraph\'s jaw. Two blades, two chances, and both of them looking for the seam.' },
  twoaxes: { key: 'twoaxes', name: 'Twin Battleaxes', cat: '1h', ranged: false, dmgCount: 1, dmgDie: 8, crit: 20, mult: 3, type: 'S', group: 'axes', prof: 'martial', custom: true, dual: true, noShield: true, special: { unholy: true },
    lore: 'One in each hand, and neither of them kind. They drink deepest from the righteous.' },
  gnomehammer: { key: 'gnomehammer', name: 'HAMMERTIME', cat: '1h', ranged: false, dmgCount: 1, dmgDie: 8, crit: 20, mult: 3, type: 'B', group: 'hammers', prof: 'exotic', custom: true, dual: true, noShield: true, special: {},
    lore: 'A gnome hooked hammer, swung twice, by someone who thinks this is very funny.' },

  // ── Guns & bows ──
  rovadra: { key: 'rovadra', name: 'Rovadra', cat: 'ranged', ranged: true, dmgCount: 1, dmgDie: 12, crit: 20, mult: 4, type: 'B', group: 'firearms', prof: 'exotic', custom: true, special: { flamingBurst: true, holy: 1 }, atkSound: '/audio/rovadra_dragonrifle.mp3',
    lore: 'A dragon rifle. It spits fire, and it is a LITTLE bit holy — just enough to make the wicked regret the distance.' },
  stormcaller: { key: 'stormcaller', name: 'Stormcaller', cat: 'ranged', ranged: true, dmgCount: 1, dmgDie: 8, crit: 20, mult: 3, type: 'P', group: 'bows', prof: 'martial', custom: true, special: { shock: true },
    lore: 'Every shot leaves the string with the smell of a coming storm.' },
  repeatingcrossbow: { key: 'repeatingcrossbow', name: 'Light of the Dawn', cat: 'ranged', ranged: true, dmgCount: 1, dmgDie: 8, crit: 19, mult: 2, type: 'P', group: 'crossbows', prof: 'exotic', custom: true, special: { holy: true },
    lore: 'A repeating crossbow whose bolts sear the wicked. It does not tire, and it does not forgive.' },
  longbow: { key: 'longbow', name: 'Orcish Warbow', cat: 'ranged', ranged: true, dmgCount: 2, dmgDie: 6, crit: 20, mult: 3, type: 'P', group: 'bows', prof: 'martial', custom: true, special: {},
    lore: 'Too big, too heavy, drawn by someone too stubborn. The arrows go through things.' },
  lapua: { key: 'lapua', name: 'Longue Carabine', cat: 'ranged', ranged: true, dmgCount: 2, dmgDie: 10, crit: 20, mult: 4, type: 'P', group: 'firearms', prof: 'exotic', custom: true, special: {}, boltAction: true,
    lore: 'One shot. One long, patient, unhurried shot. Then it is over and you never heard it coming.' },
  dvl: { key: 'dvl', name: 'DVL-10 Sniper Rifle', cat: 'ranged', ranged: true, dmgCount: 2, dmgDie: 8, crit: 20, mult: 4, type: 'P', group: 'firearms', prof: 'exotic', custom: true, special: {}, boltAction: true,
    lore: 'Anachronistic, unapologetic, and extremely good at its job.' },
};

const SIGNATURE_KEYS = Object.keys(CUSTOM_WEAPONS);
const IS_SIGNATURE = k => Object.prototype.hasOwnProperty.call(CUSTOM_WEAPONS, k);

module.exports = { CUSTOM_WEAPONS, SIGNATURE_KEYS, IS_SIGNATURE, priceOf, effectiveBonus, BASE_PRICE, EFF_BONUS, MASTERWORK };
