/**
 * Turn-start condition engine — extracted from poker Dungeon.js _advanceToActor
 * (L854-1103), Phase B. Runs at the top of a combatant's turn: ticks durations,
 * applies DoT, rolls held/grapple escapes, and decides whether the combatant may
 * act at all. Pure compute: returns { acts, events[] } of structured events the
 * app narrates; mutates the combatant's flags exactly like the original.
 *
 * Not yet ported: dominated (rides with the charm/dominate family), Black
 * Tentacles field renewal, poker's per-hero spell-window flags.
 */
const { resisted, resistMult } = require('./protections');
const { saveVs, enemySave } = require('./spellmath');
const { SICKENED_PENALTY } = require('./conditions');

function d20(roll = Math.random) { return 1 + Math.floor(roll() * 20); }
function dN(count, sides, roll = Math.random) { let t = 0; for (let i = 0; i < count; i++) t += 1 + Math.floor(roll() * sides); return t; }

/**
 * Tick a combatant's turn start.
 * ctx: {
 *   willBonus?  — save bonus for held re-saves (default: enemySave(c,'will')),
 *   escapeBonus?— grapple-escape bonus (default c.attack||c.toHit||0),
 *   grapplerCMD?— the holder's CMD (0/undefined = grip released),
 *   roll?       — injectable RNG
 * }
 */
function tickTurnStart(c, ctx = {}) {
  const roll = ctx.roll || Math.random;
  const ev = [];
  const out = { acts: true, events: ev };
  const will = ctx.willBonus != null ? ctx.willBonus : enemySave(c, 'will');

  // Darkness shroud: can't act while it lasts.
  if (c.darkened > 0) {
    c.darkened -= 1;
    ev.push({ kind: 'darkened', lifts: c.darkened <= 0 });
    out.acts = false; return out;
  }
  // Acid Arrow DoT: burns at the turn top; if it kills, the turn ends.
  if (c.acid && c.acid.rounds > 0) {
    c.acid.rounds -= 1;
    const raw = Math.max(1, dN(c.acid.dice || 1, c.acid.die || 6, roll));
    const dealt = resisted(c, raw, 'acid');
    c.hp -= dealt;
    if (c.acid.rounds <= 0) c.acid = null;
    ev.push({ kind: 'acid', dealt, slain: c.hp <= 0 });
    if (c.hp <= 0) { out.acts = false; return out; }
  }
  if (c.blinded > 0) c.blinded -= 1;   // wears off; costs no turn (−4 hit while it lasts)
  if (c.asleep || c.fascinated) {
    ev.push({ kind: c.asleep ? 'asleep' : 'fascinated' });
    out.acts = false; return out;
  }
  // Held (Hold Person / Hideous Laughter): a NEW Will save each turn — the
  // struggle costs the turn either way (PF1).
  if (c.paralyzed > 0) {
    c.paralyzed -= 1;
    if (c.heldDC) {
      const dc = c.heldDC;
      const sv = saveVs(will, dc, roll);
      if (sv.saved || c.paralyzed <= 0) {
        c.paralyzed = 0; c.heldDC = null;
        ev.push({ kind: 'held_end', bySave: sv.saved, save: sv, dc });
      } else ev.push({ kind: 'held', save: sv, dc });
    } else ev.push({ kind: 'paralyzed' });
    out.acts = false; return out;
  }
  // Grappled: helpless; each turn roll escape (CMB-ish vs the holder's CMD).
  if (c.grappled) {
    const cmd = ctx.grapplerCMD || 0;
    if (!cmd) {
      c.grappled = false; c.grappledBy = null; c.grappleRounds = 0;
      ev.push({ kind: 'grapple_released' });
    } else {
      c.grappleRounds = (c.grappleRounds || 1) - 1;
      const r = d20(roll), tot = r + (ctx.escapeBonus != null ? ctx.escapeBonus : (c.attack || c.toHit || 0));
      const broke = r === 20 || tot >= cmd;
      if (broke || c.grappleRounds <= 0) {
        c.grappled = false; c.grappledBy = null;
        ev.push({ kind: 'grapple_escaped', broke, roll: r, total: tot, cmd });
      } else ev.push({ kind: 'grapple_held', roll: r, total: tot, cmd });
      out.acts = false; return out;
    }
  }
  if (c.loseTurn) { c.loseTurn = false; ev.push({ kind: 'lose_turn' }); out.acts = false; return out; }
  if (c.nauseated > 0) { c.nauseated -= 1; ev.push({ kind: 'nauseated' }); out.acts = false; return out; }
  if (c.slowed > 0) c.slowed -= 1;     // staggered: still acts; single-action limit is the actor's job
  if (c.sickened > 0) c.sickened -= 1;
  // Bleed: 1d6 at the turn top until healed (healing is the app's concern).
  if (c._bleeding && c.hp > 0) {
    const b = dN(1, 6, roll);
    c.hp -= b;
    ev.push({ kind: 'bleed', dealt: b, slain: c.hp <= 0 });
    if (c.hp <= 0) { out.acts = false; return out; }
  }
  return out;
}

/** Attack-roll penalty from the ATTACKER's own conditions (poker _monsterSwing
 *  mods): sickened −2, blinded −4, prone −4, slowed −1, prayed −1. */
function attackPenalty(c) {
  return (c.sickened > 0 ? SICKENED_PENALTY : 0)
       + (c.blinded > 0 ? 4 : 0)
       + (c.prone ? 4 : 0)
       + (c.slowed > 0 ? 1 : 0)
       + (c.prayed > 0 ? 1 : 0);
}

module.exports = { tickTurnStart, attackPenalty };
