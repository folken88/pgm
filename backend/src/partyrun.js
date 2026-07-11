/**
 * Party run engine — turn-based PF1 combat for a shared party (human players +
 * AI companions). Initiative across all combatants; the server auto-resolves
 * enemy AND ai-companion turns, stopping only on a living HUMAN hero's turn.
 * Pure given an injected dice roller.
 *
 * Perception & surprise (Tobias): on entering a room every party member rolls
 * Perception (d20 + mod) vs each enemy's Stealth DC. An enemy noticed by ANY
 * member is revealed and narrated; unnoticed enemies stay hidden, and each member
 * who failed to notice one is FLAT-FOOTED to it in round 1 (loses Dex to AC). A
 * hidden enemy reveals itself the moment it acts.
 */
const combat = require('./combat');
const items = require('./items');
const pf1 = require('./pf1core');
const casting = require('./casting');
const characters = require('./characters');
const SFX = require('./sounds');
const { DungeonShim } = require('./pokerdungeon/shim');
const { artFor } = require('./art');
const { generatePartyRoom, generateMonRoom, STEALTH_OVERRIDES } = require('./roomgen');
const { rollDie } = require('./dice');

function createPartyRun(party, roll = Math.random) {
  const run = { heroes: party.map(heroCombatant), combatants: [], room: null,
    turnIndex: 0, round: 1, phase: 'combat', gold: 0, roomsCleared: 0,
    inventory: [], seq: 0, log: [] };
  run.shim = new DungeonShim(run);
  spawnRoom(run, roll);
  return run;
}

function addItem(run, key, qty) {
  const slot = run.inventory.find(s => s.key === key);
  if (slot) slot.qty += (qty || 1);
  else run.inventory.push({ key, qty: qty || 1 });
}
function takeItem(run, key) {
  const slot = run.inventory.find(s => s.key === key);
  if (!slot || slot.qty <= 0) return false;
  slot.qty -= 1;
  if (slot.qty <= 0) run.inventory = run.inventory.filter(s => s.qty > 0);
  return true;
}

function perceptionMod(character) {
  const sheet = character.skillSheet || [];
  const p = sheet.find(s => s.key === 'perception');
  return p ? p.modifier : (character.derived.mods.wis || 0);
}


/** Wrap a pf1core weapon in the poker-engine shape (_swingVsAC fields). */
function pokerWeapon(w) {
  if (!w) return w;
  return { ...w, toHit: w.toHit || 0, dmgBonus: w.dmgBonus || 0,
    critRange: w.critRange || w.crit || 20, critMult: w.critMult || w.mult || 2,
    key: w.key || String(w.name || '').toLowerCase(), isDagger: w.cat === 'light' && !w.ranged };
}

function heroCombatant(p) {
  const c = p.character;
  const d = c.derived;
  const dex = d.mods.dex || 0;
  const book = casting.spellbookFor(c.cls, d.level);
  return {
    id: 'h:' + p.clientId, side: 'hero', ownerClientId: p.ai ? null : p.clientId,
    ai: !!p.ai, name: c.name, icon: p.icon || '🛡️',
    hp: c.maxHp, maxHp: c.maxHp, ac: c.ac, flatAc: c.ac - Math.max(0, dex),
    perceptionMod: perceptionMod(c),
    character: c, down: false, initMod: dex,
    perceived: new Set(),          // enemy ids this hero noticed on entry
    // Caster fields (read by pf1core resolvers — the shared combatant shape):
    cls: c.cls, level: d.level, mods: d.mods, castingMod: d.castingMod || 0,
    iteratives: d.iteratives || [0], buffs: pf1.buffs.ZERO(), buffApplied: {},
    spellbook: book, slots: {}, roomUses: {},
    runUses: Object.fromEntries(book.spells.filter(s => s.cost === 'run').map(s => [s.key, 1])),
    // Poker-engine aliases (the transplanted mixins read these):
    playerId: c.name.toLowerCase(), nickname: c.name, left: false, isBot: !!p.ai,
    abilityScores: d.scores, gear: {}, weaponKey: (c.weapon && c.weapon.name || 'dagger').toLowerCase(),
    weapon: pokerWeapon(c.weapon), spellPool: 0, abilityUses: {}, runAbilityUses: {},
  };
}
function enemyCombatant(e, i) {
  return {
    id: 'e:' + i, side: 'enemy', name: e.name, icon: '👹',
    hp: e.hp, maxHp: e.maxHp, ac: e.ac, creature: e, down: false,
    initMod: e.initBonus || 0, stealth: e.stealth, sneaky: !!e.sneaky,
    revealed: false,
    // Fields the pf1core resolvers read directly off the combatant:
    type: e.type || null, fort: e.fort || 0, reflex: e.reflex || 0,
    // Poker-engine aliases:
    uid: 'e:' + i, glyph: '👹', toHit: e.attack || 0,
  };
}

function spawnRoom(run, roll) {
  const apl = Math.round(run.heroes.reduce((s, h) => s + (h.character.derived.level || 1), 0) / run.heroes.length);
  // POKER BESTIARY (155 MON stat blocks, vetted-by-provenance) behind PGM's
  // CR/XP budget; special flags (healer/shout/sr/shaman casts...) drive
  // _enemyAct. Stealth: default DC 10, sneaky lurkers overridden.
  const { MON } = pf1.monsters;
  const xpForCR = pf1.xp.xpForCR;
  const room = generateMonRoom(run.heroes.length, apl, run.roomsCleared, MON, xpForCR, roll);
  run.room = { flavor: room.flavor, reward: room.reward };
  // BOSS ROOM every 5th (poker's BOSS_EVERY): the toughest thematic foe the
  // party can handle, ADVANCED +2-4 levels with pre-cast wards, leading mooks.
  const depthNum = run.roomsCleared + 1;
  const isBossRoom = depthNum % 5 === 0;
  if (isBossRoom) {
    const capCR = Math.max(1, Math.min(20, apl + Math.floor(run.roomsCleared / 4) + 2));
    const cand = Object.keys(MON).filter(k => (MON[k].crNum || 99) <= capCR);
    const top = cand.sort((a, b) => (MON[b].crNum || 0) - (MON[a].crNum || 0)).slice(0, 3);
    if (top.length) room.monKeys = [top[Math.floor(roll() * top.length)]].concat(room.monKeys.slice(0, 2));
  }
  let bossMade = false;
  const enemies = room.monKeys.map(k => {
    const isBoss = isBossRoom && !bossMade && (bossMade = true);
    const e = run.shim._makeEnemyPGM(MON[k], isBoss);
    e.key = k; e.revealed = false;
    e.stealth = STEALTH_OVERRIDES[k] != null ? STEALTH_OVERRIDES[k] : 10;
    e.art = artFor(e.name);
    return e;
  });
  // Suffix duplicates: "Goblin A", "Goblin B".
  const totals = {};
  enemies.forEach(e => { totals[e.key] = (totals[e.key] || 0) + 1; });
  const seen0 = {};
  enemies.forEach(e => {
    e.creature.baseName = e.creature.baseName || e.name;
    if (totals[e.key] > 1) { seen0[e.key] = (seen0[e.key] || 0) + 1; e.name = e.creature.baseName + ' ' + String.fromCharCode(64 + seen0[e.key]); }
  });

  // Perception vs Stealth: each living hero rolls against each enemy. A hero
  // who failed to notice ANY present foe starts FLAT-FOOTED (denied Dex) until
  // they first act — poker semantics + PGM's perception twist.
  run.heroes.forEach(h => { h.perceived = new Set(); });
  enemies.forEach(en => {
    run.heroes.forEach(h => {
      if (h.down) return;
      const check = rollDie(20, roll) + h.perceptionMod;
      if (check >= en.stealth) { h.perceived.add(en.id); en.revealed = true; }
    });
  });
  run.heroes.forEach(h => { h.flatFooted = !h.down && enemies.some(en => !h.perceived.has(en.id)); });

  // Per-room spell refresh (poker's per-room refill convention). Room buffs
  // clear; run buffs (Bless/Inspire) persist.
  run.heroes.forEach(h => {
    try { run.shim._resetAbilities(h); } catch (e) {   // poker per-room refresh (slots/pool/uses)
      const r = casting.roomResources(h); h.slots = r.slots; h.roomUses = r.roomUses;
    }
    h.abilityUses = h.abilityUses || {}; h.roomUses = h.abilityUses;   // alias: poker room-cost counters
    h.buffs = pf1.buffs.ZERO(); h.buffApplied = {}; h._aiBuffed = false;
  });

  run.combatants = run.heroes.concat(enemies);
  run.combatants.forEach(cb => { cb.init = rollDie(20, roll) + cb.initMod; });
  run.combatants.sort((a, b) => (b.init - a.init) || (b.initMod - a.initMod));
  run.turnIndex = 0;
  run.round = 1;
  run.phase = 'combat';

  const seen = enemies.filter(e => e.revealed);
  const hidden = enemies.filter(e => !e.revealed);
  if (seen.length) {
    // Natural prose from the SAME list the UI and target menus use, grouped by
    // kind ("two goblins and a giant centipede") + a disposition beat so players
    // know these creatures are together and hostile (Tobias 2026-07-09).
    const prose = groupProse(seen);
    const stance = seen.length > 1
      ? 'They loiter together at their ease — until they see you, and turn as one, weapons and teeth bared.'
      : `It ${seen[0].creature && seen[0].creature.undead ? 'stands in unnatural stillness' : 'looks up from its business'} — and fixes on you, hostile.`;
    logEvent(run, `You enter ${room.flavor}. Ahead: ${prose}. ${stance} Roll for initiative!`, 'urgent');
  } else {
    logEvent(run, `You enter ${room.flavor}. It seems quiet… but stay wary.`, 'urgent');
  }
  if (hidden.length) {
    logEvent(run, 'Something you have not seen lurks here — be ready.', 'event');
  }
  runUntilHeroTurn(run, roll);
}

/** "two goblins and a giant centipede" — grouped, natural, from the real list. */
function groupProse(list) {
  const counts = new Map();
  for (const e of list) {
    const base = e.creature ? e.creature.baseName || e.name : e.name;
    counts.set(base, (counts.get(base) || 0) + 1);
  }
  const WORDS = ['', 'a', 'two', 'three', 'four', 'five', 'six'];
  const parts = [...counts.entries()].map(([name, n]) =>
    n === 1 ? `${/^[aeiou]/i.test(name) ? 'an' : 'a'} ${name}` : `${WORDS[n] || n} ${name}s`);
  if (parts.length === 1) return parts[0];
  return parts.slice(0, -1).join(', ') + ' and ' + parts[parts.length - 1];
}

function living(run, side) { return run.combatants.filter(c => c.side === side && !c.down && !c.summoned); }
function livingRevealedEnemies(run) { return run.combatants.filter(c => c.side === 'enemy' && !c.down && c.revealed && !c.summoned); }
function current(run) { return run.combatants[run.turnIndex]; }
function nextTurn(run) {
  run.turnIndex = (run.turnIndex + 1) % run.combatants.length;
  if (run.turnIndex === 0) run.round += 1;   // wrapped to top of initiative = new round
}

/** Turn-start condition tick (pf1core engine): narrates events, returns acts. */
function tickFor(run, cb, roll) {
  const ctx = { roll };
  if (cb.side === 'hero' && cb.character) ctx.willBonus = cb.character.derived.saves.will;
  const t = pf1.tick.tickTurnStart(cb, ctx);
  for (const e of t.events) {
    switch (e.kind) {
      case 'darkened': logEvent(run, `🌑 ${cb.name} is lost in magical darkness — does nothing${e.lifts ? ' (the shroud lifts!)' : ''}.`, 'event'); break;
      case 'acid': logEvent(run, `🟢 Acid keeps sizzling on ${cb.name} — ${e.dealt} acid.${e.slain ? ` ☠️ ${cb.name} dissolves!` : ''}`, e.slain ? 'urgent' : 'event'); break;
      case 'asleep': logEvent(run, `${cb.name} sleeps soundly — does nothing.`, 'event'); break;
      case 'fascinated': logEvent(run, `${cb.name} stands fascinated — does nothing.`, 'event'); break;
      case 'held': logEvent(run, `🖐️ ${cb.name} stays HELD — struggles in vain and loses its turn. [Will ${e.save.total} vs ${e.dc}]`, 'event'); break;
      case 'held_end': logEvent(run, `🖐️ ${cb.name} ${e.bySave ? 'wrenches free of the hold — but the struggle cost its turn' : 'shakes off the fading hold'}!`, 'event'); break;
      case 'paralyzed': logEvent(run, `🖐️ ${cb.name} is paralyzed — loses its turn.`, 'event'); break;
      case 'grapple_released': logEvent(run, `${cb.name} wrenches loose — the grip releases.`, 'event'); break;
      case 'grapple_escaped': logEvent(run, `${cb.name} tears free of the grapple — but the struggle cost its turn.`, 'event'); break;
      case 'grapple_held': logEvent(run, `${cb.name} is held fast — helpless, loses its turn.`, 'event'); break;
      case 'lose_turn': logEvent(run, `${cb.name} is off-balance — loses a turn.`, 'event'); break;
      case 'nauseated': logEvent(run, `${cb.name} retches — nauseated, loses a turn.`, 'event'); break;
      case 'bleed': logEvent(run, `🩸 ${cb.name} bleeds for ${e.dealt}.${e.slain ? ' ☠️' : ''}`, e.slain ? 'urgent' : 'event'); break;
    }
  }
  if (cb.hp <= 0 && !cb.down) { cb.down = true; }
  return t.acts;
}

/** Auto-resolve enemy + ai-companion turns; stop at a living HUMAN hero. */
function runUntilHeroTurn(run, roll) {
  let guard = 0;
  while (run.phase === 'combat' && guard++ < 2000) {
    run.combatants.forEach(c => { if (c.hp <= 0 && !c.down) { c.down = true; if (c.side === 'enemy') c.revealed = true; } });
    if (living(run, 'enemy').length === 0) return clearRoom(run, roll);
    if (living(run, 'hero').length === 0) return defeat(run);
    const cb = current(run);
    if (!cb || cb.down) { nextTurn(run); continue; }
    if (!tickFor(run, cb, roll)) { nextTurn(run); continue; }   // conditions cost the turn
    if (cb.side === 'enemy' && cb.summoned) { summonTurn(run, cb, roll); nextTurn(run); continue; }
    if (cb.side === 'enemy' && cb.dominated > 0) { dominatedTurn(run, cb, roll); nextTurn(run); continue; }
    if (cb.side === 'hero' && !cb.ai) { logEvent(run, `It is ${cb.name}'s turn.`, 'event'); return; }
    if (cb.side === 'hero') aiHeroTurn(run, cb, roll);   // ai companion
    else enemyTurn(run, cb, roll);
    nextTurn(run);
  }
}

/** Cast a spell by key through the casting layer; converts events into the log. */
function castSpell(run, hero, spellKey, targetId, roll) {
  // THE TRANSPLANTED POKER ENGINE: the full class kit via _useAbility.
  const shim = run.shim;
  let kit;
  try { kit = shim._abilitiesFor(hero) || []; } catch (e) { return { ok: false, error: 'no abilities' }; }
  const slot = kit.findIndex(a => a.key === spellKey);
  if (slot < 0) {
    // At-will cantrip rides kit.atwill (its own poker path — _abCantrip).
    const kd = pf1.abilities.kitFor(hero.cls);
    if (kd && kd.atwill && kd.atwill.key === spellKey) {
      const target = targetId ? livingRevealedEnemies(run).find(f => f.id === targetId) : livingRevealedEnemies(run)[0];
      if (!target) return { ok: false, error: 'no visible target' };
      try { run.shim._abCantrip(hero, kd.atwill, target); } catch (e) { return { ok: false, error: 'the casting fizzles' }; }
      return { ok: true };
    }
    return { ok: false, error: 'you do not know that spell' };
  }
  const ab = kit[slot];
  if (!kitUses(hero, ab)) return { ok: false, error: 'no uses of ' + ab.name + ' left this room' };
  const before = run.seq;
  try { shim._useAbility(hero, slot, { targetUid: targetId || undefined }); }
  catch (e) { return { ok: false, error: 'the casting fizzles' }; }
  if (run.seq === before) return { ok: false, error: 'that cannot be cast right now' };
  return { ok: true };
}
/** Poker kit-cost availability (free/pool/slot/room/run). */
function kitUses(m, ab) {
  if (!ab.cost || ab.cost === 'free') return true;
  if (ab.cost === 'pool') return (m.spellPool || 0) >= (ab.slvl || 1);
  if (ab.cost === 'slot') { const L = ab.slvl || 1; return ((m.slots || {})[L] || 0) > 0; }
  if (ab.cost === 'room') return (m.abilityUses && (m.abilityUses[ab.key] === undefined ? 1 : m.abilityUses[ab.key])) > 0;
  if (ab.cost === 'run') return (m.runAbilityUses && (m.runAbilityUses[ab.key] === undefined ? 1 : m.runAbilityUses[ab.key])) > 0;
  return true;
}

/** A summoned minion's turn: swing at the weakest REAL foe, tick expiry,
 *  crumble at 0 (port of Dungeon.js L865-883). */
/** A DOMINATED foe fights FOR the party this turn: fresh Will save to shake it,
 *  else it savages its own allies (port of Dungeon.js dominated branch). */
function dominatedTurn(run, e, roll) {
  const sv = pf1.spellmath.saveVs(pf1.spellmath.enemySave(e, 'will'), e.dominateDC || 15, roll);
  if (sv.saved) {
    e.dominated = 0; e.dominatedBy = null;
    logEvent(run, `💫 ${e.name} tears its will free of the domination! [Will ${sv.total} vs ${e.dominateDC || 15}]`, 'event');
    return;
  }
  e.dominated -= 1;
  const kin = run.combatants.filter(x => x.side === 'enemy' && !x.summoned && !x.down && x !== e);
  if (kin.length) {
    const prey = kin.slice().sort((a, b) => b.maxHp - a.maxHp)[0];
    const r = run.shim._monsterSwing(e, pf1.spellmath.enemyAC(prey));
    if (r.hit) {
      const d = pf1.resolve.dmgTo(prey, r.damage, null);
      logEvent(run, `💫 ${e.name}, DOMINATED, savages its ally ${prey.name} for ${d.dealt}!${prey.hp <= 0 ? ' ☠️ Slain!' : ''}`, 'event', SFX.pick(SFX.SND.flesh, roll));
      if (prey.hp <= 0) prey.down = true;
    } else logEvent(run, `💫 ${e.name}, DOMINATED, claws at its ally ${prey.name} — and misses.`, 'event');
  } else logEvent(run, `💫 ${e.name} stands slack under the domination — no allies left to turn on.`, 'event');
  if (e.dominated <= 0) { e.dominatedBy = null; logEvent(run, `💫 the domination on ${e.name} fades.`, 'event'); }
}

function summonTurn(run, minion, roll) {
  const glyph = minion.summonFlavor === 'devil' ? '😈' : '☠️';
  const foes = livingRevealedEnemies(run);
  if (foes.length) {
    const prey = foes.slice().sort((a, b) => a.hp - b.hp)[0];
    const r = run.shim._monsterSwing(minion, pf1.spellmath.enemyAC(prey));
    if (r.hit) {
      const d = pf1.resolve.dmgTo(prey, r.damage, null);
      logEvent(run, `${glyph} ${minion.name} (your ${minion.summonFlavor}) rends ${prey.name} for ${d.dealt}!${prey.hp <= 0 ? ' ☠️ Slain!' : ''}`, 'event', SFX.pick(SFX.SND.flesh, roll));
      if (prey.hp <= 0) prey.down = true;
    } else logEvent(run, `${glyph} ${minion.name} (your ${minion.summonFlavor}) claws at ${prey.name} — and misses.`, 'event');
  } else logEvent(run, `${glyph} ${minion.name} stands ready — no foe in reach.`, 'event');
  minion.summonExpiry = (minion.summonExpiry || 1) - 1;
  if (minion.summonExpiry <= 0) { minion.hp = 0; minion.down = true; logEvent(run, `${glyph} ${minion.name} crumbles back to dust — the summoning ends.`, 'event'); }
}

function aiHeroTurn(run, hero, roll) {
  // Potion fallback first (poker AI heals via spells; the party bag is PGM's).
  const allies = run.combatants.filter(c => c.side === 'hero');
  const badlyHurt = allies.some(c => !c.down && c.hp <= c.maxHp / 3) || allies.some(c => c.down);
  if (badlyHurt) {
    const healSlot = run.inventory.find(s => { const it = items.ITEM_BY_KEY[s.key]; return it && it.effect && it.effect.kind === 'heal' && s.qty > 0; });
    const hasHealSpell = (() => { try { return (run.shim._abilitiesFor(hero) || []).some(a => a.effect === 'heal' && kitUses(hero, a)); } catch (e) { return false; } })();
    if (healSlot && !hasHealSpell && useItem(run, hero, healSlot.key, null, roll).ok) return;
  }
  // THE POKER HERO BRAIN: stance, target selection, spell/heal/buff priorities.
  try { run.shim._allyAct(hero); return; }
  catch (e) { logEvent(run, `${hero.name} hesitates, weapon ready.`, 'event'); }
  const foes = livingRevealedEnemies(run);
  if (foes.length) heroAttack(run, hero, foes.slice().sort((a, b) => a.hp - b.hp)[0], roll);
}

function enemyTurn(run, enemy, roll) {
  if (!enemy.revealed) {
    enemy.revealed = true;
    logEvent(run, `${cap(enemy.name)} bursts from hiding!`, 'urgent');
  }
  // THE POKER VILLAIN BRAIN: action economy, maneuvers, specials (heal/shout/
  // shaman casts/hellfire...), fight-defensively. Falls back to a basic swing.
  try { run.shim._enemyAct(enemy); return; } catch (e) {}
  const targets = living(run, 'hero');
  if (!targets.length) return;
  const target = targets.slice().sort((a, b) => a.hp - b.hp)[0];
  const flat = target.flatFooted;
  const targetAC = (flat ? target.flatAc : target.ac) + pf1.buffs.buffAcMod(target);
  const res = combat.creatureAttack({ attack: enemy.toHit || 0, dmg: { count: enemy.dmgCount || 1, sides: enemy.dmgDie || 4, bonus: enemy.dmgBonus || 0 } }, targetAC, roll, -pf1.tick.attackPenalty(enemy));
  const ff = flat ? ' (caught flat-footed!)' : '';
  if (res.hit) {
    target.hp -= res.damage;
    logEvent(run, `${enemy.name} hits ${target.name} for ${res.damage}${ff}. (${Math.max(0, target.hp)} HP left.)`, 'event', SFX.pick(SFX.SND.flesh, roll));
    if (target.hp <= 0) { target.down = true; logEvent(run, `${target.name} falls!`, 'urgent'); }
  } else {
    logEvent(run, `${enemy.name} misses ${target.name}${ff}.`, 'event', SFX.pick(SFX.SND.whiffSword, roll));
  }
}

/** A human player acts on their hero's turn (attack/pass), or the party descends. */
function applyAction(run, clientId, action, roll = Math.random) {
  action = action || {};
  const type = typeof action === 'string' ? action : action.type;

  // RETREAT: any party member, any time (not turn-gated) — the party pulls out
  // alive with its gold. Tobias: there must always be a retreat button.
  if (type === 'retreat' && (run.phase === 'combat' || run.phase === 'cleared')) {
    if (!run.heroes.some(h => h.ownerClientId === clientId)) return { ok: false, error: 'not a party member' };
    run.phase = 'retreated';
    logEvent(run, `🏳️ The party retreats from the delve — ${run.roomsCleared} room${run.roomsCleared === 1 ? '' : 's'} cleared, ${run.gold} gold carried out. Live to delve again.`, 'urgent');
    return { ok: true };
  }

  // CANTRIP CYCLE (poker's C key): a free action, not turn-gated. With no key,
  // steps to the next element; with action.spell, picks that one directly.
  if (type === 'cantrip') {
    const hero = run.heroes.find(h => h.ownerClientId === clientId);
    if (!hero) return { ok: false, error: 'not a party member' };
    let st = null;
    try { st = run.shim._cantripState(hero); } catch (e) {}
    if (!st || !st.choices.length) return { ok: false, error: 'your class has no at-will cantrip to cycle' };
    let next;
    if (action.spell) next = st.choices.find(c => c.key === action.spell);
    else {
      const i = st.choices.findIndex(c => c.key === st.current);
      next = st.choices[(i + 1) % st.choices.length];
    }
    if (!next) return { ok: false, error: 'not a cantrip you can cast' };
    hero.cantrip = next.key;
    return { ok: true, cantrip: next.key, cantripName: next.name };
  }

  if (run.phase === 'cleared' && type === 'descend') {
    if (!run.heroes.some(h => h.ownerClientId === clientId)) return { ok: false, error: 'not a party member' };
    spawnRoom(run, roll);
    return { ok: true };
  }
  if (run.phase === 'cleared' && type === 'equip') {
    const hero = run.heroes.find(h => h.ownerClientId === clientId);
    if (!hero) return { ok: false, error: 'not a party member' };
    return equipItem(run, hero, action.item);
  }
  if (run.phase !== 'combat') return { ok: false, error: 'no action available now' };

  const cb = current(run);
  if (!cb || cb.side !== 'hero' || cb.ai) return { ok: false, error: 'wait for your turn' };
  if (cb.ownerClientId !== clientId) return { ok: false, error: 'it is ' + cb.name + "'s turn, not yours" };

  if (type === 'attack') {
    const target = pickTarget(run, action.target);
    if (!target) return { ok: false, error: 'no visible target' };
    heroAttack(run, cb, target, roll);
  } else if (type === 'cast') {
    const r = castSpell(run, cb, action.spell, action.target, roll);
    if (!r.ok) return r;                 // invalid cast doesn't burn the turn
  } else if (type === 'use') {
    const r = useItem(run, cb, action.item, action.target, roll);
    if (!r.ok) return r;                 // invalid use doesn't burn the turn
  } else if (type === 'pass') {
    logEvent(run, `${cb.name} holds their action.`, 'event');
  } else {
    return { ok: false, error: 'unknown action' };
  }
  nextTurn(run);
  runUntilHeroTurn(run, roll);
  return { ok: true };
}

function healTarget(run, targetId) {
  const heroes = run.combatants.filter(c => c.side === 'hero');
  if (targetId) return heroes.find(h => h.id === targetId) || null;
  const hurt = heroes.filter(h => h.hp < h.maxHp || h.down);
  if (!hurt.length) return heroes[0] || null;
  return hurt.slice().sort((a, b) => ((a.down ? 0 : 1) - (b.down ? 0 : 1)) || (a.hp - b.hp))[0];
}

/** Use a party item (heal an ally / throw at a foe). Returns {ok}. */
function useItem(run, user, itemKey, targetId, roll) {
  const item = items.ITEM_BY_KEY[itemKey];
  if (!item) return { ok: false, error: 'no such item' };
  if (!takeItem(run, itemKey)) return { ok: false, error: 'the party has none of that' };
  const e = item.effect;
  if (e.kind === 'heal') {
    const target = healTarget(run, targetId);
    if (!target) { addItem(run, itemKey); return { ok: false, error: 'no ally to heal' }; }
    const before = target.hp;
    target.hp = Math.min(target.maxHp, target.hp + items.rollAmount(item, roll));
    if (target.hp > 0) target.down = false;
    logEvent(run, `${user.name} uses ${item.name} on ${target.name}, healing ${target.hp - before}. (${target.hp}/${target.maxHp} HP.)`, 'event', SFX.pick(SFX.SND.flesh, roll));
    return { ok: true };
  }
  if (e.kind === 'throw') {
    const target = pickTarget(run, targetId);
    if (!target) { addItem(run, itemKey); return { ok: false, error: 'no visible target' }; }
    if (e.vsUndead && !(target.creature && target.creature.undead)) {
      logEvent(run, `${user.name} throws ${item.name} at ${target.name}, but it splashes harmlessly — no effect on the living.`, 'event');
      return { ok: true };
    }
    const amt = items.rollAmount(item, roll);
    target.hp -= amt;
    logEvent(run, `${user.name} throws ${item.name} at ${target.name} for ${amt} ${e.dtype} damage. (${Math.max(0, target.hp)} HP left.)`, 'event', SFX.pick(SFX.SND.lightning, roll));
    if (target.hp <= 0) { target.down = true; logEvent(run, `${target.name} is destroyed!`, 'urgent'); }
    return { ok: true };
  }
  return { ok: false, error: 'unusable' };
}

function pickTarget(run, targetId) {
  const foes = livingRevealedEnemies(run);
  if (targetId) return foes.find(f => f.id === targetId) || null;
  return foes[0] || null;
}

function heroAttack(run, hero, target, roll) {
  // POKER ATTACK PIPELINE: iteratives -> _swingVsAC (crit confirm, sneak/smite/
  // bane dice, weapon arcana, Mirror Image/concealment, DR) — verbatim engine.
  const shim = run.shim;
  hero.flatFooted = false;                    // acting ends flat-footed (PF1)
  const offs = (hero.character.derived.iteratives && hero.character.derived.iteratives.length)
    ? hero.character.derived.iteratives : [0];
  let t = target;
  for (const off of offs) {
    if (!t || t.hp <= 0) t = livingRevealedEnemies(run)[0];
    if (!t) break;
    const ac = pf1.spellmath.enemyAC(t);
    const r = shim._swingVsAC(hero, ac, t, off);
    if (!r.hit) {
      logEvent(run, `${hero.name} ${r.fumble ? 'FUMBLES against' : 'misses'} ${t.name}. ${shim._atkStr(r)}`, 'event', r.sound);
      continue;
    }
    const d = pf1.resolve.dmgTo(t, r.damage, null);
    const sneak = r.sneakDice ? ` (+${r.sneakDmg} sneak)` : '';
    logEvent(run, `${r.crit ? 'CRITICAL! ' : ''}${hero.name} hits ${t.name} for ${d.dealt}${sneak}. (${Math.max(0, t.hp)} HP left.)`, r.crit ? 'urgent' : 'event', r.sound);
    if (t.hp <= 0) { t.down = true; logEvent(run, `${t.name} is slain!`, 'urgent'); }
  }
}

/** Equip a found weapon/armor onto a hero (between fights). Returns {ok}. */
function equipItem(run, hero, itemKey) {
  const item = items.ITEM_BY_KEY[itemKey];
  if (!item || item.type !== 'gear') return { ok: false, error: 'not equippable' };
  if (!takeItem(run, itemKey)) return { ok: false, error: 'the party does not have that' };
  const c = hero.character;
  if (item.gearType === 'weapon') {
    const w = pf1.weapons.WEAPON_BY_NAME[item.weaponName];
    if (!w) { addItem(run, itemKey); return { ok: false, error: 'unknown weapon' }; }
    c.weapon = pokerWeapon(w); hero.weapon = c.weapon; c.weaponName = item.short || item.name;
    logEvent(run, `${hero.name} equips the ${item.name}.`, 'event');
  } else {                                    // armor
    const dex = c.derived.mods.dex || 0;
    c.armorBonus = item.acBonus;
    c.ac = 10 + dex + item.acBonus;
    hero.ac = c.ac; hero.flatAc = c.ac - Math.max(0, dex);
    logEvent(run, `${hero.name} dons the ${item.name}. (AC ${c.ac}.)`, 'event');
  }
  return { ok: true };
}

/** PF1 XP: sum xpForCR over the room's REAL foes, split evenly across the
 *  party (poker's model, Tobias-confirmed). Level-ups re-derive the hero. */
function awardRoomXp(run) {
  const foes = run.combatants.filter(c => c.side === 'enemy' && !c.summoned);
  const roomXp = foes.reduce((s, e) => s + pf1.xp.xpForCR(e.crNum || (e.creature && e.creature.crNum) || 0.25), 0);
  if (roomXp <= 0) return;
  const recips = run.heroes.filter(h => !h.left);
  const per = Math.floor(roomXp / Math.max(1, recips.length));
  if (per <= 0) return;
  logEvent(run, `✨ Foes vanquished — the party earns ${roomXp} XP (${per} each).`, 'event');
  for (const h of recips) {
    h.xp = (h.xp || 0) + per;
    const nl = pf1.xp.levelFromXp(h.xp);
    const from = h.level || 1;
    if (nl > from) applyLevelUp(run, h, from, nl);
  }
}
function applyLevelUp(run, hero, from, to) {
  const c = hero.character;
  const { hpGain } = characters.levelUp(c, to);
  const d = c.derived;
  // Refresh the combatant's engine-facing fields.
  hero.level = to; hero.mods = d.mods; hero.castingMod = d.castingMod || 0;
  hero.iteratives = d.iteratives || [0];
  hero.maxHp = c.maxHp; if (hpGain > 0) hero.hp += hpGain;
  hero.ac = c.ac; hero.flatAc = c.ac - Math.max(0, d.mods.dex || 0);
  hero.abilityScores = d.scores;
  const p = (c.skillSheet || []).find(sk => sk.key === 'perception');
  hero.perceptionMod = p ? p.modifier : (d.mods.wis || 0);
  // Gains summary (poker's _levelGains lite): BAB, HP, new spells, new slots.
  const parts = [];
  const babD = pf1.classes.babFor(c.cls, to) - pf1.classes.babFor(c.cls, from);
  if (babD > 0) parts.push(`BAB +${babD}`);
  if (hpGain > 0) parts.push(`+${hpGain} HP`);
  const kd = pf1.abilities.kitFor(c.cls);
  const newSpells = ((kd && kd.abilities) || []).filter(ab => (ab.minLevel || 1) > from && (ab.minLevel || 1) <= to).map(ab => ab.name);
  const s0 = pf1.abilities.slotsFor(c.cls, from, hero.castingMod) || {};
  const s1 = pf1.abilities.slotsFor(c.cls, to, hero.castingMod) || {};
  const newSlots = Object.keys(s1).filter(L => !s0[L]).map(L => `${L}${({ 1: 'st', 2: 'nd', 3: 'rd' })[L] || 'th'}-level slots`);
  if (newSlots.length) parts.push('new ' + newSlots.join(' & '));
  if (newSpells.length) parts.push('spells: ' + newSpells.slice(0, 4).join(', '));
  logEvent(run, `⭐ LEVEL UP! ${hero.name} reaches level ${to} (${c.cls})! ${parts.join(' · ') || 'steady growth'}`, 'urgent', '/audio/spell_channel_charge.mp3');
}

function clearRoom(run, roll = Math.random) {
  run.combatants.forEach(c => { if (c.summoned && !c.down) { c.down = true; } });
  run.phase = 'cleared';
  awardRoomXp(run);
  run.gold += run.room.reward.gp;
  run.roomsCleared += 1;
  run.heroes.forEach(h => {           // short rest: revive downed + heal to half
    const half = Math.ceil(h.maxHp / 2);
    if (h.hp < half) h.hp = half;
    h.down = false;
  });
  // Treasure: gold, plus ~60% of the time an item from the early-treasure table.
  let found = `${run.room.reward.gp} gold`;
  if (rollDie(100, roll) <= 60) {
    const key = items.rollTreasureItem(roll);
    addItem(run, key, 1);
    found += ` and ${items.ITEM_BY_KEY[key].name}`;
  }
  logEvent(run, `The room is cleared! The party finds ${found}, and catches its breath. Descend deeper?`, 'urgent');
}

function defeat(run) { run.phase = 'defeated'; logEvent(run, 'The party has fallen. The dungeon claims you.', 'urgent'); }

function logEvent(run, text, priority, sound) {
  run.log.push({ seq: ++run.seq, text, priority: priority || 'event', sound: sound || null });
  if (run.log.length > 80) run.log.shift();
}

/** Client-facing view. Hidden (unrevealed) enemies are omitted entirely. */
function publicRun(run) {
  const cb = current(run);
  let turn = null;
  if (run.phase === 'combat' && cb && cb.side === 'hero' && !cb.ai) {
    let kit = [];
    try { kit = run.shim._abilitiesFor(cb) || []; } catch (e) {}
    const kd = pf1.abilities.kitFor(cb.cls);
    if (kd && kd.atwill) kit = [{ ...kd.atwill, cost: 'free' }].concat(kit);
    const spells = kit.filter(ab => kitUses(cb, ab) && run.shim._charAllows(cb, ab)).map(ab => ({
      key: ab.key, name: ab.name, icon: ab.icon,
      uses: ab.cost === 'pool' ? cb.spellPool
          : ab.cost === 'slot' ? ((cb.slots || {})[ab.slvl || 1] || 0)
          : ab.cost === 'room' ? (cb.abilityUses && cb.abilityUses[ab.key] !== undefined ? cb.abilityUses[ab.key] : 1)
          : null,
    }));
    turn = { combatantId: cb.id, ownerClientId: cb.ownerClientId, name: cb.name, spells };
  }
  const shown = run.combatants.filter(c => c.side === 'hero' || c.revealed);
  return {
    phase: run.phase, round: run.round, gold: run.gold, roomsCleared: run.roomsCleared,
    room: run.room ? { flavor: run.room.flavor } : null,
    combatants: shown.map(c => ({
      id: c.id, side: c.side, name: c.name, icon: c.icon,
      art: artFor(c.side === 'enemy' && c.creature ? c.creature.baseName || c.name : c.name),
      hp: Math.max(0, c.hp), maxHp: c.maxHp, ac: c.ac, down: c.down,
      ai: !!c.ai, summoned: !!c.summoned, ownerClientId: c.ownerClientId || null,
      level: c.level || null, xp: c.xp || 0, cls: c.cls || null,
      xpNext: c.side === 'hero' ? pf1.xp.xpProgress(c.xp || 0).next : null,
      current: cb ? c.id === cb.id : false,
      init: c.init || 0,
      conditions: condList(c).concat(c.precast && c.precast.length ? ['warded: ' + c.precast.join('/')] : []),
      // Split views for the blind B (buffs) / D (debuffs) readouts (poker keymap).
      buffs: (c.buffs && ((c.buffs.toHit || 0) + (c.buffs.ac || 0) + (c.buffs.deflect || 0) + (c.buffs.save || 0)) > 0 ? ['blessed'] : [])
        .concat(c.precast && c.precast.length ? c.precast : []),
      debuffs: condList(c).filter(x => x !== 'blessed'),
      slots: (c.side === 'hero' && c.slots && Object.keys(c.slots).length) ? c.slots : null,
    })),
    enemies: livingRevealedEnemies(run).map(e => ({ id: e.id, name: e.name, hp: Math.max(0, e.hp) })),
    inventory: run.inventory.map(s => {
      const it = items.ITEM_BY_KEY[s.key];
      return {
        key: s.key, name: it.name, short: it.short, icon: it.icon,
        type: it.type, verb: it.verb || 'equip', gearType: it.gearType || null,
        kind: it.effect ? it.effect.kind : null, qty: s.qty,
      };
    }),
    turn,
    log: run.log.slice(-40),
  };
}

/** Human-readable active conditions on a combatant (for the status panels). */
function condList(c) {
  const out = [];
  if (c.paralyzed > 0) out.push(c.heldDC ? 'held' : 'paralyzed');
  if (c.nauseated > 0) out.push('nauseated');
  if (c.blinded > 0) out.push('blinded');
  if (c.slowed > 0) out.push('slowed');
  if (c.sickened > 0) out.push('sickened');
  if (c.prone) out.push('prone');
  if (c.grappled) out.push('grappled');
  if (c.asleep) out.push('asleep');
  if (c.fascinated) out.push('fascinated');
  if (c.charmed) out.push('charmed');
  if (c.acid && c.acid.rounds > 0) out.push('burning (acid)');
  if (c._bleeding) out.push('bleeding');
  if (c.buffs && ((c.buffs.toHit || 0) + (c.buffs.ac || 0) + (c.buffs.deflect || 0) + (c.buffs.save || 0)) > 0) out.push('blessed');
  return out;
}

/** Compact status for the concurrent-delves side window. */
function summary(run) {
  const heroes = run.heroes.map(h => ({ icon: h.icon, name: h.name, hp: Math.max(0, h.hp), maxHp: h.maxHp, down: h.down, ai: h.ai }));
  const alive = run.heroes.filter(h => !h.down).length;
  return { phase: run.phase, depth: run.roomsCleared + (run.phase === 'cleared' ? 0 : 1), round: run.round, alive, heroes };
}

function cap(s) { return s ? s[0].toUpperCase() + s.slice(1) : s; }

module.exports = { createPartyRun, applyAction, publicRun, summary, spawnRoom };
