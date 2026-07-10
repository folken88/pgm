/**
 * PGM casting layer — makes casters actually cast, on the shared engine.
 * Spellbooks come from pf1core's class KITS (poker's real per-class ability data),
 * filtered to the effect families the pf1core resolvers support so far (the
 * vetting rule: only castable+resolvable spells are offered). Resolution runs
 * through pf1core.resolve; this file narrates the result objects and tracks
 * slots/uses (refilled per room — poker's per-room refresh convention).
 */
const pf1 = require('./pf1core');
const SFX = require('./sounds');
const A = pf1.abilities;
const R = pf1.resolve;
const P = pf1.protections;

// Effect families with a working resolver TODAY. Grows as Phase B lands more.
const SUPPORTED = new Set(['bolt', 'touch', 'aoe', 'missile', 'save_debuff', 'heal', 'buff']);

/** The castable list for a class+level: kit abilities in supported families.
 *  Stance toggles + Rage are excluded until their models land (see buffs.js). */
function spellbookFor(cls, level) {
  const kit = A.kitFor(cls);
  if (!kit) return { atwill: null, spells: [] };
  const atwill = kit.atwill && SUPPORTED.has(kit.atwill.effect) ? kit.atwill : null;
  const spells = (kit.abilities || []).filter(ab =>
    SUPPORTED.has(ab.effect) && (ab.minLevel || 1) <= level
    && ['slot', 'room', 'run'].includes(ab.cost)
    && !ab.deadlyaim && !ab.powerattack && !ab.fightdefensively && ab.key !== 'rage');
  return { atwill, spells };
}

/** Per-room resources: spell slots by level + room-use counters. */
function roomResources(hero) {
  const c = hero.character;
  const out = { slots: {}, roomUses: {} };
  if (A.isCaster(c.cls)) {
    out.slots = Object.assign({}, A.slotsFor(c.cls, c.derived.level, c.derived.castingMod) || {});
    for (const ab of (hero.spellbook ? hero.spellbook.spells : [])) {
      if (ab.cost === 'room') out.roomUses[ab.key] = A.roomUses ? (A.roomUses(ab, c.derived.level) || 1) : 1;
    }
  }
  return out;
}

function canCast(hero, ab) {
  if (ab.cost === 'slot') { const L = ab.slvl || 1; return (hero.slots[L] || 0) > 0; }
  if (ab.cost === 'room') return (hero.roomUses[ab.key] || 0) > 0;
  if (ab.cost === 'run') return (hero.runUses[ab.key] || 0) > 0;
  return true;   // at-will
}
function spend(hero, ab) {
  if (ab.cost === 'slot') { const L = ab.slvl || 1; hero.slots[L] = Math.max(0, (hero.slots[L] || 0) - 1); }
  else if (ab.cost === 'room') hero.roomUses[ab.key] = Math.max(0, (hero.roomUses[ab.key] || 0) - 1);
  else if (ab.cost === 'run') hero.runUses[ab.key] = Math.max(0, (hero.runUses[ab.key] || 0) - 1);
}

/** Cast `ab` from hero at target/context. Returns {ok, events[]} — events are
 *  {text, priority} narration built from the pf1core result objects. */
function cast(hero, ab, ctx, roll = Math.random) {
  const m = hero;                          // hero carries the caster fields (level/cls/mods/castingMod/iteratives)
  const { enemies, allies, nextTarget } = ctx;
  let target = ctx.target || enemies[0] || null;
  const ev = [];
  const icon = ab.icon || '✨';

  switch (ab.effect) {
    case 'bolt': {
      if (!target) return { ok: false, error: 'no visible target' };
      const res = R.resolveCantrip(m, target, ab, nextTarget, { roll });
      for (const a of res.attacks) {
        if (!a.hit) ev.push({ text: `${icon} ${m.name}'s ${ab.name} misses ${a.target.name}. [d20 ${a.roll}+${a.toHit} vs touch ${a.touchAC}]`, priority: 'event' });
        else ev.push({ text: `${icon} ${m.name}'s ${ab.name} hits ${a.target.name} for ${a.dmg.dealt} ${ab.dtype || ''}${tag(a.dmg)}. (${Math.max(0, a.target.hp)} HP left.)`, priority: 'event' });
        if (a.hit && a.dmg.slain) ev.push({ text: `${a.target.name} is slain!`, priority: 'urgent' });
      }
      if (!res.attacks.length) return { ok: false, error: 'no visible target' };
      break;
    }
    case 'touch': {
      if (!target) return { ok: false, error: 'no visible target' };
      const res = R.resolveTouch(m, target, ab, { roll });
      if (!res.hit) ev.push({ text: `${icon} ${m.name}'s ${ab.name} misses ${target.name}. [d20 ${res.roll}+${res.toHit} vs touch ${res.touchAC}]`, priority: 'event' });
      else {
        ev.push({ text: `${icon} ${m.name}'s ${ab.name} hits ${target.name} for ${res.dmg.dealt} ${ab.dtype || ''}${tag(res.dmg)}. (${Math.max(0, target.hp)} HP left.)`, priority: 'event' });
        if (res.dmg.slain) ev.push({ text: `${target.name} is slain!`, priority: 'urgent' });
      }
      break;
    }
    case 'aoe': {
      const targets = R.aoeTargets(ab, enemies, ctx.target ? [ctx.target] : null, roll);
      if (!targets.length) return { ok: false, error: 'no visible target' };
      const res = R.resolveAoE(m, targets, ab, { roll });
      const lbl = res.saveStat === 'fort' ? 'Fort' : res.saveStat === 'will' ? 'Will' : 'Ref';
      const tally = `${res.failN} hit${res.savedN ? `, ${res.savedN} saved` : ''}${res.srN ? `, ${res.srN} spell-resisted` : ''}${res.slainN ? `, ${res.slainN} slain` : ''}`;
      ev.push({ text: `${icon} ${m.name} casts ${ab.name} — ${lbl} DC ${res.dc} (${res.full} ${ab.dtype || ''}): ${tally}.`, priority: res.slainN ? 'urgent' : 'event' });
      break;
    }
    case 'missile': {
      const targets = ctx.target ? [ctx.target] : enemies;
      if (!targets.length) return { ok: false, error: 'no visible target' };
      const res = R.resolveMissile(m, targets, ab, { roll });
      const parts = res.hits.map(h => h.shielded ? `${h.target.name} 🛡SHIELDED` : `${h.target.name} ${h.dmg.dealt}${h.dmg.slain ? ' ☠️' : ''}`);
      ev.push({ text: `${icon} ${m.name} looses ${res.darts} Magic Missile${res.darts > 1 ? 's' : ''} (auto-hit) — ${parts.join(', ')}.`, priority: parts.some(p => p.includes('☠️')) ? 'urgent' : 'event' });
      break;
    }
    case 'save_debuff': {
      if (!target) return { ok: false, error: 'no visible target' };
      if (!P.spellWorksOn(ab, target)) return { ok: false, error: `${ab.name} cannot affect ${target.name}` };
      const res = R.resolveSaveDebuff(m, target, ab, { roll });
      ev.push({ text: `${icon} ${m.name} casts ${ab.name} on ${target.name} — save ${res.save.total} vs DC ${res.dc}: ${res.applied ? String(res.applied).toUpperCase() + '!' : 'resists'}.`, priority: res.applied ? 'urgent' : 'event' });
      break;
    }
    case 'heal': {
      if (ab.heal === 'party') {
        const wounded = allies.filter(a => !a.down && a.hp < a.maxHp || a.down);
        const undead = enemies.filter(e => e.creature && e.creature.undead);
        if (!wounded.length && undead.length) {
          const res = R.resolveChannelSear(m, undead, { roll });
          ev.push({ text: `${icon} ${m.name} channels positive energy — SEARS the undead, Will DC ${res.dc} (${res.dmg}): ${res.hitN} seared${res.savedN ? `, ${res.savedN} saved` : ''}${res.slainN ? `, ${res.slainN} destroyed` : ''}.`, priority: 'event' });
        } else {
          const res = R.resolveChannelHeal(m, allies, roll);
          const revived = res.healed.filter(h => h.revived).map(h => h.target.name);
          ev.push({ text: `${icon} ${m.name} channels positive energy — the party heals ${res.amount}${revived.length ? `; ${revived.join(', ')} back on their feet!` : ''}.`, priority: revived.length ? 'urgent' : 'event' });
        }
      } else {
        const ally = ctx.ally || allies.filter(a => a.hp < a.maxHp || a.down).sort((a, b) => (a.down === b.down ? a.hp - b.hp : a.down ? -1 : 1))[0];
        if (!ally) return { ok: false, error: 'nobody needs healing' };
        const amt = R.cureAmount(m, ab, roll);
        const h = R.applyHeal(ally, amt);
        ev.push({ text: `${icon} ${m.name} casts ${ab.name} on ${ally.name}, healing ${h.healed}. (${ally.hp}/${ally.maxHp} HP.)${h.revived ? ` ${ally.name} is back on their feet!` : ''}`, priority: h.revived ? 'urgent' : 'event' });
      }
      break;
    }
    case 'buff': {
      const targets = ab.party ? allies.filter(a => !a.down)
        : ab.target === 'ally' ? [ctx.ally || allies.filter(a => !a.down).sort((a, b) => a.hp - b.hp)[0] || m]
        : [m];
      const res = pf1.buffs.resolveBuff(m, ab, targets, enemies);
      if (!res.applied.length && !res.enemyPenalty) return { ok: false, error: ab.name + ' is already active' };
      const scaleTag = res.scale ? ` (+${res.scale})` : '';
      const who = ab.party ? 'the party' : (targets[0] === m ? (m.name === m.name ? 'themself' : m.name) : targets[0].name);
      ev.push({ text: `${icon} ${m.name} casts ${ab.name}${scaleTag} on ${who}${res.enemyPenalty ? ' — allies blessed, enemies cursed across the field' : ''}!`, priority: 'event' });
      break;
    }
    default: return { ok: false, error: 'unsupported spell' };
  }
  if (ev.length && !ev[0].sound) ev[0].sound = SFX.forEffect(ab, roll);
  spend(hero, ab);
  return { ok: true, events: ev };
}

function tag(dmg) {
  if (dmg.immune) return ' ⛔immune';
  if (dmg.vulnerable) return ' ×1.5!';
  if (dmg.resisted) return ' (resisted)';
  return '';
}

module.exports = { spellbookFor, roomResources, canCast, spend, cast, SUPPORTED };
