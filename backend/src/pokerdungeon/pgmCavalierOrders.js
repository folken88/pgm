/**
 * PGM Cavalier Orders — the mechanics for the standard Paizo Orders, kept ENTIRELY
 * in this PGM-only file (plus the shim's order gating) so `sync-from-poker` never
 * clobbers them. The poker-synced abilities.js only knows Order of the Flame; every
 * other order's Challenge modifier + L2/L8/L15 deeds live here.
 *
 * How the pieces connect (all wired from shim.js, which is also PGM-only):
 *   - `orderDeeds(shim, m)`   → ability defs appended to a cavalier's kit for their
 *                               OWN order at their current level. Each carries
 *                               `order:'<key>'` so the shim's `_charAllows` gates it,
 *                               and reuses EXISTING effect handlers (buff/…) so the
 *                               synced `_useAbility` runs them natively (uses, action,
 *                               targeting, blind refusals) with no new plumbing.
 *   - `orderAcBonus(shim, m)` → extra AC a hero gets from cavalier orders (Lion's
 *                               dodge-while-challenging + the L15 guardian aura).
 *                               Folded into the shim's `_acBonus`, which feeds the
 *                               hero AC the enemy rolls against (_monsterSwing).
 *   - `swingMods(shim, attacker, target)` → to-hit / bonus-damage adjustments for a
 *                               HERO attacking a foe (Dragon ally-attack, Cockatrice/
 *                               Shield damage). Folded into the shim's `_swingVsAC`.
 *
 * Orders are built ONE AT A TIME; only a fully-built order flips `built:true` in
 * choices.js and becomes selectable (Tobias's rule — no half-built order ships).
 * Built so far: Lion, Dragon, Star. Pending: Cockatrice, Shield. (Sword deferred
 * with mounted combat.)
 */

// PF1 "+1 per 4 levels" challenge scaling: 1 at L1–4, 2 at L5–8, 3 at L9–12, … .
function challengeScale(lvl) { return 1 + Math.floor(((lvl || 1) - 1) / 4); }

// A hero's Charisma modifier (cavaliers are Cha-based), floored at +1 so a
// Cha-scaled party buff is never a no-op.
function chaMod(m) {
  const c = m && m.character && m.character.derived && m.character.derived.mods && m.character.derived.mods.cha;
  return Math.max(1, c || 0);
}

function liveParty(shim) {
  try { if (typeof shim.livingParty === 'function') return shim.livingParty() || []; } catch (_) {}
  return (shim && (shim.heroes || shim.party) || []).filter(a => a && !a.down);
}

// Is `a` a Lion cavalier of at least `lvl` (for the L15 guardian aura)?
function isLionAtLeast(shim, a, lvl) {
  return !!a && a.cls === 'cavalier' && !a.down && (a.level || 1) >= lvl && shim._orderOf(a) === 'lion';
}

// ── Per-order active deeds (added to the kit by the shim) ─────────────────────
// Each builder returns the deeds a cavalier of that order QUALIFIES for at their
// current level, so a low-level cavalier only sees the deeds they can actually use
// (cleaner than showing greyed, unusable buttons — matches "exceed poker's ease").
const DEEDS = {
  lion(m) {
    const lvl = m.level || 1;
    const out = [];
    if (lvl >= 2) out.push({
      key: 'lions_call', name: "Lion's Call", icon: '🦁', order: 'lion',
      cost: 'room', uses: 2, effect: 'buff', target: 'self', party: true, sticky: true,
      buff: { toHit: 1, save: 2 }, sound: '/audio/taunt_predator.mp3',
      desc: "ORDER OF THE LION (L2): a rallying roar — the whole party shrugs off fear and fights with +1 to hit and +2 to all saves for the room. Twice per room.",
    });
    if (lvl >= 8) out.push({
      key: 'for_the_king', name: 'For the King!', icon: '👑', order: 'lion',
      cost: 'room', uses: 1, effect: 'buff', target: 'self', party: true, sticky: true,
      buff: { toHit: chaMod(m), dmg: chaMod(m) }, sound: '/audio/spell_buff_invoke.mp3',
      desc: `ORDER OF THE LION (L8): a battle-cry that lends the party your conviction — +${chaMod(m)} to hit and damage (your Charisma) for the room. Once per room.`,
    });
    if (lvl >= 15) out.push({
      key: 'shield_liege', name: 'Shield the Liege', icon: '🛡️', order: 'lion',
      cost: 'room', uses: 1, effect: 'buff', target: 'ally', sticky: true,
      buff: { ac: 4, deflect: 2 }, sound: '/audio/spell_buff_invoke.mp3',
      desc: 'ORDER OF THE LION (L15): throw your guard over a comrade — an ally gains +4 AC (+2 deflection) for the room as you take their peril as your own. Once per room. (You also project a steadfast aura: every ally has +2 AC while you stand.)',
    });
    return out;
  },
  dragon(m) {
    const lvl = m.level || 1;
    const out = [];
    const aid = 2 + challengeScale(lvl);   // +3 at L2, +4 at L5, +5 at L9 … (PF1 improved Aid Another)
    if (lvl >= 2) out.push({
      key: 'aid_allies', name: 'Aid Allies', icon: '🐲', order: 'dragon',
      cost: 'room', uses: 3, effect: 'buff', target: 'ally', sticky: true,
      buff: { toHit: aid, ac: aid }, sound: '/audio/spell_buff_invoke.mp3',
      desc: `ORDER OF THE DRAGON (L2): call an opening to a comrade — that ally gains +${aid} to hit AND +${aid} AC for the room. Up to three allies per room.`,
    });
    if (lvl >= 8) out.push({
      key: 'strategy', name: 'Strategy', icon: '📯', order: 'dragon',
      cost: 'room', uses: 1, effect: 'buff', target: 'self', party: true, sticky: true,
      buff: { toHit: 1, ac: 2 }, sound: '/audio/spell_buff_invoke.mp3',
      desc: 'ORDER OF THE DRAGON (L8): call a battle plan — the WHOLE party fights as a unit, +1 to hit and +2 AC for the room. Once per room.',
    });
    if (lvl >= 15) out.push({
      key: 'act_as_one', name: 'Act as One', icon: '🐉', order: 'dragon',
      cost: 'room', uses: 1, effect: 'haste', target: 'self', party: true, sound: '/audio/spell_buff_invoke.mp3',
      desc: 'ORDER OF THE DRAGON (L15): the party moves and strikes AS ONE — every ally gains an extra attack each turn (a haste surge) for the rest of the room. Once per room.',
    });
    return out;
  },
  star(m) {
    const lvl = m.level || 1;
    const out = [];
    const cal = Math.min(lvl, 5);   // "+level competence" — capped, applied for the room (from PF1's "next save or attack")
    if (lvl >= 2) out.push({
      key: 'calling', name: 'Calling', icon: '⭐', order: 'star',
      cost: 'room', uses: 2, effect: 'buff', target: 'self', sticky: true,
      buff: { toHit: cal, save: cal }, sound: '/audio/spell_buff_invoke.mp3',
      desc: `ORDER OF THE STAR (L2): a whispered prayer steels you — +${cal} to your attacks and to all your saves for the room. Twice per room.`,
    });
    if (lvl >= 8) out.push({
      key: 'for_the_faith', name: 'For the Faith', icon: '🕯️', order: 'star',
      cost: 'room', uses: 1, effect: 'buff', target: 'self', party: true, sticky: true,
      buff: { toHit: chaMod(m) }, sound: '/audio/spell_buff_invoke.mp3',
      desc: `ORDER OF THE STAR (L8): a battle-cry of faith — the WHOLE party fights in your light, +${chaMod(m)} to hit (your Charisma) for the room. Once per room.`,
    });
    if (lvl >= 15) out.push({
      key: 'retribution', name: 'Retribution', icon: '☀️', order: 'star',
      cost: 'room', uses: 1, effect: 'buff', target: 'self', party: true, sticky: true,
      fireShield: true, sound: '/audio/spell_buff_invoke.mp3',
      desc: 'ORDER OF THE STAR (L15): call down holy retribution — for the rest of the room, any foe that strikes you or an ally is seared by answering fire. Once per room.',
    });
    return out;
  },
};

/** Ability defs to append to cavalier `m`'s kit for their chosen order + level. */
function orderDeeds(shim, m) {
  if (!m || m.cls !== 'cavalier') return [];
  const order = shim._orderOf(m);
  const build = order && DEEDS[order];
  return build ? build(m) : [];
}

/** Extra AC a hero gains from cavalier orders (folded into the shim's _acBonus).
 *  Heroes only — enemies compute AC via _enemyAC, never _acBonus. */
function orderAcBonus(shim, m) {
  if (!m || !m.character) return 0;
  let bonus = 0;
  // Order of the Lion L15 — the guardian aura: a standing L15+ Lion grants EVERY
  // ally (any class) +2 AC. Attacker-agnostic, so it lives here in _acBonus.
  if (liveParty(shim).some(a => isLionAtLeast(shim, a, 15))) bonus += 2;
  // Order of the Lion Challenge — a dodge bonus while you hold an active challenge.
  // (PF1: dodge vs your challenged foe's attacks; PGM has no per-attacker AC seam,
  //  so it applies while the challenge stands — the challenged foe is your prime
  //  attacker anyway.) +1 per 4 levels.
  if (m.cls === 'cavalier' && shim._orderOf(m) === 'lion' && m.challengedId != null) {
    bonus += challengeScale(m.level || 1);
  }
  return bonus;
}

/** Extra bonus to a hero's saving throws from cavalier orders (folded into the
 *  shim's _partySaveMod). Heroes only. */
function orderSaveBonus(shim, m) {
  if (!m || m.cls !== 'cavalier' || !m.character) return 0;
  // ORDER OF THE STAR — the faithful: a morale bonus to ALL saves while you hold an
  // active challenge (+1, +1 per 4 levels).
  if (shim._orderOf(m) === 'star' && m.challengedId != null) return challengeScale(m.level || 1);
  return 0;
}

/** To-hit / bonus-damage adjustments applied when `attacker` swings at `target`,
 *  folded into the shim's _swingVsAC. `dmg` is injected via the challenge-damage
 *  path (see the shim wrapper); `toHit`/`ac` add to the roll. */
function swingMods(shim, attacker, target) {
  const mod = { toHit: 0, dmg: 0, ac: 0 };
  if (!attacker || !target) return mod;
  // ORDER OF THE DRAGON — the tactician. An ALLY (any hero other than the Dragon)
  // striking the foe the Dragon has CHALLENGED gains +to-hit (+1, +1 per 4 levels).
  // The Dragon's own strikes already carry his base Challenge damage, so he's excluded.
  if (attacker.playerId) {   // a hero is attacking (enemies have no playerId)
    for (const cav of liveParty(shim)) {
      if (cav === attacker || cav.cls !== 'cavalier') continue;
      if (shim._orderOf(cav) === 'dragon' && cav.challengedId != null && cav.challengedId === target.uid) {
        mod.toHit += challengeScale(cav.level || 1);
        break;   // one Dragon's leadership is plenty; don't stack multiples
      }
    }
  }
  return mod;
}

module.exports = { challengeScale, orderDeeds, orderAcBonus, orderSaveBonus, swingMods };
