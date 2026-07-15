/**
 * CLASS CHOICES — the defining pick some classes make at a given level (the
 * Cavalier's Order; later Cleric Domains, Sorcerer Bloodline, …). Chosen at
 * character creation or level-up on the Leveling screen; stored on the character
 * as `character.choices = { <choiceKey>: <optionKey> }`.
 *
 * This file is PGM-ONLY (not synced from poker) — order content that must survive
 * `sync-from-poker` lives here and in shim.js / pgmCavalierOrders.js, never in the
 * poker-synced mixin/data files.
 *
 * A choice-point: { key, level, prompt, pick=1, options }.
 * An option:      { key, name, desc, blurb } — blurb is the spoken/one-line summary.
 */

// The 6 playable Cavalier Orders (Order of the Sword deferred with mounted combat).
// The MECHANICS live in the shim (challenge modifiers) + pgmCavalierOrders (deeds);
// this is the player-facing metadata the Leveling screen presents.
const CAVALIER_ORDERS = [
  // `built: true` gates an order to selectable. The five new orders flip to built
  // as each one's full mechanics (challenge modifier + L2/L8/L15 deeds) land — no
  // half-built order is ever pickable (Tobias's rule).
  { key: 'flame', name: 'Order of the Flame', icon: '🔥', built: true,
    desc: 'Glory through a rising kill-streak. Glorious Challenge compounds bonus damage for every foe you drop; Blaze of Glory is a final surge; you are never caught flat-footed, and a critical hit daunts the whole room.',
    blurb: 'Kill-streak glory — build the Flame on the weak, then loose it on the mighty.' },
  { key: 'cockatrice', name: 'Order of the Cockatrice', icon: '🐔',
    desc: 'Selfish glory. Bonus damage against your challenged foe while you fight it ALONE; a Dazzling Display that shakens foes; steal a free strike when an ally crits; and once a room, refuse to fall.',
    blurb: 'The lone glory-hog — deadliest with no ally in your way.' },
  { key: 'dragon', name: 'Order of the Dragon', icon: '🐲', built: true,
    desc: 'The tactician. Your allies strike your challenged foe harder; hand a comrade a hefty aid bonus (L2), rally the whole party into a coordinated stance (L8), and once a room move the entire party to strike as one (L15).',
    blurb: 'The tactician — you make the whole party better.' },
  { key: 'lion', name: 'Order of the Lion', icon: '🦁', built: true,
    desc: 'The guardian. A dodge bonus while you hold a challenge; rally the party from fear (L2); grant them your Charisma to hit and harm (L8); and an aura that shields every ally, plus a shield you can throw over a comrade (L15).',
    blurb: 'The loyal guardian — rally and shield your allies.' },
  { key: 'shield', name: 'Order of the Shield', icon: '🛡️',
    desc: 'The protector of the weak. Bonus damage against a foe that dared strike an ally; damage reduction in the thick of melee; a free strike when a foe attacks an ally; and the power to throw yourself in the way and counter.',
    blurb: 'The protector — punish those who harm the helpless.' },
  { key: 'star', name: 'Order of the Star', icon: '⭐',
    desc: 'The faithful. A bonus to all your saves while you challenge; a prayer that steels your next save or strike; a battle-cry that grants the party your Charisma to hit; and holy retribution when a foe strikes you or an ally.',
    blurb: 'The faithful — steadfast, and the party fights in your light.' },
];

// Optional: order key → { minLevel } per deed, if we need it outside the ability defs.
const CLASS_CHOICES = {
  cavalier: [
    { key: 'order', level: 1, pick: 1, prompt: 'Choose your Order — it shapes how your Challenge works and grants order abilities as you level.',
      options: CAVALIER_ORDERS },
  ],
  // future: cleric domains, sorcerer bloodline, wizard school …
};

/** Only options whose mechanics are fully implemented are offered (Tobias's rule).
 *  As each order's deeds land, flip its `built: true`. */
function builtOptions(cp) {
  const opts = (cp.options || []).filter(o => o.built);
  return Object.assign({}, cp, { options: opts.length ? opts : cp.options });
}

/** Choice-points a character is ELIGIBLE for but has not yet resolved (built options only). */
function pendingChoices(character) {
  if (!character) return [];
  const points = CLASS_CHOICES[character.cls] || [];
  const lvl = (character.derived && character.derived.level) || character.level || 1;
  const made = character.choices || {};
  return points.filter(cp => lvl >= cp.level && made[cp.key] === undefined).map(builtOptions);
}

/** The chosen option object for a resolved choice, or null. */
function chosenOption(character, choiceKey) {
  const points = (character && CLASS_CHOICES[character.cls]) || [];
  const cp = points.find(p => p.key === choiceKey);
  const picked = character && character.choices && character.choices[choiceKey];
  return (cp && picked) ? cp.options.find(o => o.key === picked) || null : null;
}

/** Validate that optionKey is a legal choice for choiceKey on this character. */
function isLegalChoice(character, choiceKey, optionKey) {
  const points = (character && CLASS_CHOICES[character.cls]) || [];
  const cp = points.find(p => p.key === choiceKey);
  if (!cp) return false;
  const lvl = (character.derived && character.derived.level) || character.level || 1;
  if (lvl < cp.level) return false;
  const o = cp.options.find(x => x.key === optionKey);
  return !!(o && o.built);   // only fully-built orders are legal to pick
}

module.exports = { CLASS_CHOICES, CAVALIER_ORDERS, pendingChoices, chosenOption, isLegalChoice };
