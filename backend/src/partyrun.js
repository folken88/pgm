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
const { generatePartyRoom } = require('./roomgen');
const { rollDie } = require('./dice');

function createPartyRun(party, roll = Math.random) {
  const run = { heroes: party.map(heroCombatant), combatants: [], room: null,
    turnIndex: 0, round: 1, phase: 'combat', gold: 0, roomsCleared: 0,
    inventory: [], seq: 0, log: [] };
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
  };
}

function spawnRoom(run, roll) {
  const apl = Math.round(run.heroes.reduce((s, h) => s + (h.character.derived.level || 1), 0) / run.heroes.length);
  const room = generatePartyRoom(run.heroes.length, apl, run.roomsCleared, roll);
  run.room = { flavor: room.flavor, reward: room.reward };
  const enemies = room.enemies.map(enemyCombatant);

  // Perception vs Stealth: each living hero rolls against each enemy.
  run.heroes.forEach(h => { h.perceived = new Set(); });
  enemies.forEach(en => {
    run.heroes.forEach(h => {
      if (h.down) return;
      const check = rollDie(20, roll) + h.perceptionMod;
      if (check >= en.stealth) { h.perceived.add(en.id); en.revealed = true; }
    });
  });

  // Per-room spell refresh (poker's per-room refill convention). Room buffs
  // clear; run buffs (Bless/Inspire) persist.
  run.heroes.forEach(h => {
    const r = casting.roomResources(h); h.slots = r.slots; h.roomUses = r.roomUses;
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

function living(run, side) { return run.combatants.filter(c => c.side === side && !c.down); }
function livingRevealedEnemies(run) { return run.combatants.filter(c => c.side === 'enemy' && !c.down && c.revealed); }
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
    if (living(run, 'enemy').length === 0) return clearRoom(run, roll);
    if (living(run, 'hero').length === 0) return defeat(run);
    const cb = current(run);
    if (!cb || cb.down) { nextTurn(run); continue; }
    if (!tickFor(run, cb, roll)) { nextTurn(run); continue; }   // conditions cost the turn
    if (cb.side === 'hero' && !cb.ai) { logEvent(run, `It is ${cb.name}'s turn.`, 'event'); return; }
    if (cb.side === 'hero') aiHeroTurn(run, cb, roll);   // ai companion
    else enemyTurn(run, cb, roll);
    nextTurn(run);
  }
}

/** Cast a spell by key through the casting layer; converts events into the log. */
function castSpell(run, hero, spellKey, targetId, roll) {
  const book = hero.spellbook || { atwill: null, spells: [] };
  const ab = (book.atwill && book.atwill.key === spellKey) ? book.atwill
           : book.spells.find(s => s.key === spellKey);
  if (!ab) return { ok: false, error: 'you do not know that spell' };
  if (!casting.canCast(hero, ab)) return { ok: false, error: 'no uses of ' + ab.name + ' left this room' };
  const foes = livingRevealedEnemies(run);
  const target = targetId ? foes.find(f => f.id === targetId) : null;
  const allies = run.combatants.filter(c => c.side === 'hero');
  const r = casting.cast(hero, ab, {
    enemies: foes, allies, target,
    nextTarget: () => livingRevealedEnemies(run)[0] || null,
  }, roll);
  if (!r.ok) return r;
  for (const e of r.events) logEvent(run, e.text, e.priority);
  return { ok: true };
}

function aiHeroTurn(run, hero, roll) {
  const allies = run.combatants.filter(c => c.side === 'hero');
  const book = hero.spellbook || { atwill: null, spells: [] };
  const badlyHurt = allies.some(c => !c.down && c.hp <= c.maxHp / 3) || allies.some(c => c.down);

  // 1) Heal first: a castable heal (cure/channel) beats a potion; potion is the fallback.
  if (badlyHurt) {
    const healAb = book.spells.find(s => s.effect === 'heal' && casting.canCast(hero, s));
    if (healAb) {
      const r = casting.cast(hero, healAb, { enemies: livingRevealedEnemies(run), allies }, roll);
      if (r.ok) { for (const e of r.events) logEvent(run, e.text, e.priority); return; }
    }
    const healSlot = run.inventory.find(s => { const it = items.ITEM_BY_KEY[s.key]; return it && it.effect && it.effect.kind === 'heal' && s.qty > 0; });
    if (healSlot && useItem(run, hero, healSlot.key, null, roll).ok) return;
  }

  const foes = livingRevealedEnemies(run);
  if (!foes.length) { logEvent(run, `${hero.name} scans the room, weapon ready.`, 'event'); return; }

  // 1.5) One opening buff per room: Bless/Prayer/Divine Favor etc. before wading in.
  if (!hero._aiBuffed) {
    const buffAb = book.spells.find(s => s.effect === 'buff' && casting.canCast(hero, s));
    if (buffAb) {
      hero._aiBuffed = true;
      const r = casting.cast(hero, buffAb, { enemies: foes, allies }, roll);
      if (r.ok) { for (const e of r.events) logEvent(run, e.text, e.priority); return; }
    } else hero._aiBuffed = true;
  }

  // 2) Casters spend a leveled spell when it's worth it: AoE on a crowd, else a
  //    single-target nuke on the beefiest foe; cantrip over a weak melee swing.
  if (pf1.abilities.isCaster(hero.cls)) {
    const worksOn = (ab, t) => pf1.protections.spellWorksOn(ab, { ...t.creature, hp: t.hp, name: t.name });
    const aoe = book.spells.find(s => s.effect === 'aoe' && casting.canCast(hero, s));
    const nuke = book.spells.find(s => ['missile', 'touch', 'bolt'].includes(s.effect) && casting.canCast(hero, s));
    const pickAb = (foes.length >= 2 && aoe) ? aoe : (nuke && foes.some(f => worksOn(nuke, f)) ? nuke : null);
    if (pickAb) {
      const r = casting.cast(hero, pickAb, { enemies: foes, allies, nextTarget: () => livingRevealedEnemies(run)[0] || null }, roll);
      if (r.ok) { for (const e of r.events) logEvent(run, e.text, e.priority); return; }
    }
    if (book.atwill) {
      const r = casting.cast(hero, book.atwill, { enemies: foes, allies, target: foes.slice().sort((a, b) => a.hp - b.hp)[0], nextTarget: () => livingRevealedEnemies(run)[0] || null }, roll);
      if (r.ok) { for (const e of r.events) logEvent(run, e.text, e.priority); return; }
    }
  }

  // 3) Martials (and casters out of tricks) swing at the most-wounded foe.
  const target = foes.slice().sort((a, b) => a.hp - b.hp)[0];
  heroAttack(run, hero, target, roll);
}

function enemyTurn(run, enemy, roll) {
  if (!enemy.revealed) {
    enemy.revealed = true;
    logEvent(run, `${cap(enemy.name)} bursts from hiding!`, 'urgent');
  }
  const targets = living(run, 'hero');
  if (!targets.length) return;
  const target = targets.slice().sort((a, b) => a.hp - b.hp)[0];
  // Flat-footed: round 1, target never perceived this attacker -> lose Dex to AC.
  const flat = run.round === 1 && !target.perceived.has(enemy.id);
  const targetAC = (flat ? target.flatAc : target.ac) + pf1.buffs.buffAcMod(target);   // Shield/Shield of Faith...
  const res = combat.creatureAttack(enemy.creature, targetAC, roll, -pf1.tick.attackPenalty(enemy));
  const ff = flat ? ' (caught flat-footed!)' : '';
  if (res.hit) {
    target.hp -= res.damage;
    logEvent(run, `${enemy.name} hits ${target.name} for ${res.damage}${ff}. (${Math.max(0, target.hp)} HP left.)`, 'event');
    if (target.hp <= 0) { target.down = true; logEvent(run, `${target.name} falls!`, 'urgent'); }
  } else {
    logEvent(run, `${enemy.name} misses ${target.name}${ff}.`, 'event');
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
    logEvent(run, `${user.name} uses ${item.name} on ${target.name}, healing ${target.hp - before}. (${target.hp}/${target.maxHp} HP.)`, 'event');
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
    logEvent(run, `${user.name} throws ${item.name} at ${target.name} for ${amt} ${e.dtype} damage. (${Math.max(0, target.hp)} HP left.)`, 'event');
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
  const targetAC = pf1.spellmath.enemyAC(target);   // situational mods: prone/stunned/blinded/slowed/flat-footed
  const bm = pf1.buffs.buffAtkMods(hero);           // Bless/Divine Favor/Prayer/GMW...
  const res = combat.heroAttack(hero.character.derived, hero.character.weapon, targetAC, roll,
    bm.toHit - pf1.tick.attackPenalty(hero), bm.dmg);
  if (!res.hit) { logEvent(run, `${hero.name} swings at ${target.name} and misses.`, 'event'); return; }
  target.hp -= res.damage;
  const crit = res.crit ? 'Critical! ' : '';
  logEvent(run, `${crit}${hero.name} hits ${target.name} for ${res.damage}. (${Math.max(0, target.hp)} HP left.)`, 'event');
  if (target.hp <= 0) { target.down = true; logEvent(run, `${target.name} is slain!`, 'urgent'); }
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
    c.weapon = w; c.weaponName = item.short || item.name;
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

function clearRoom(run, roll = Math.random) {
  run.phase = 'cleared';
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

function logEvent(run, text, priority) {
  run.log.push({ seq: ++run.seq, text, priority: priority || 'event' });
  if (run.log.length > 80) run.log.shift();
}

/** Client-facing view. Hidden (unrevealed) enemies are omitted entirely. */
function publicRun(run) {
  const cb = current(run);
  let turn = null;
  if (run.phase === 'combat' && cb && cb.side === 'hero' && !cb.ai) {
    const book = cb.spellbook || { atwill: null, spells: [] };
    const spells = [];
    if (book.atwill) spells.push({ key: book.atwill.key, name: book.atwill.name, icon: book.atwill.icon, uses: null });
    for (const s of book.spells) {
      const uses = s.cost === 'slot' ? (cb.slots[s.slvl || 1] || 0)
                 : s.cost === 'run' ? (cb.runUses[s.key] || 0)
                 : (cb.roomUses[s.key] || 0);
      if (uses > 0) spells.push({ key: s.key, name: s.name, icon: s.icon, uses });
    }
    turn = { combatantId: cb.id, ownerClientId: cb.ownerClientId, name: cb.name, spells };
  }
  const shown = run.combatants.filter(c => c.side === 'hero' || c.revealed);
  return {
    phase: run.phase, round: run.round, gold: run.gold, roomsCleared: run.roomsCleared,
    room: run.room ? { flavor: run.room.flavor } : null,
    combatants: shown.map(c => ({
      id: c.id, side: c.side, name: c.name, icon: c.icon,
      hp: Math.max(0, c.hp), maxHp: c.maxHp, ac: c.ac, down: c.down,
      ai: !!c.ai, ownerClientId: c.ownerClientId || null,
      current: cb ? c.id === cb.id : false,
      init: c.init || 0,
      conditions: condList(c),
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
