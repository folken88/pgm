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
const { generatePartyRoom } = require('./roomgen');
const { rollDie } = require('./dice');

function createPartyRun(party, roll = Math.random) {
  const run = { heroes: party.map(heroCombatant), combatants: [], room: null,
    turnIndex: 0, round: 1, phase: 'combat', gold: 0, roomsCleared: 0, seq: 0, log: [] };
  spawnRoom(run, roll);
  return run;
}

function perceptionMod(character) {
  const sheet = character.skillSheet || [];
  const p = sheet.find(s => s.key === 'perception');
  return p ? p.modifier : (character.derived.mods.wis || 0);
}

function heroCombatant(p) {
  const c = p.character;
  const dex = c.derived.mods.dex || 0;
  return {
    id: 'h:' + p.clientId, side: 'hero', ownerClientId: p.ai ? null : p.clientId,
    ai: !!p.ai, name: c.name, icon: p.icon || '🛡️',
    hp: c.maxHp, maxHp: c.maxHp, ac: c.ac, flatAc: c.ac - Math.max(0, dex),
    perceptionMod: perceptionMod(c),
    character: c, down: false, initMod: dex,
    perceived: new Set(),          // enemy ids this hero noticed on entry
  };
}
function enemyCombatant(e, i) {
  return {
    id: 'e:' + i, side: 'enemy', name: e.name, icon: '👹',
    hp: e.hp, maxHp: e.maxHp, ac: e.ac, creature: e, down: false,
    initMod: e.initBonus || 0, stealth: e.stealth, sneaky: !!e.sneaky,
    revealed: false,
  };
}

function spawnRoom(run, roll) {
  const room = generatePartyRoom(run.heroes.length, roll);
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

  run.combatants = run.heroes.concat(enemies);
  run.combatants.forEach(cb => { cb.init = rollDie(20, roll) + cb.initMod; });
  run.combatants.sort((a, b) => (b.init - a.init) || (b.initMod - a.initMod));
  run.turnIndex = 0;
  run.round = 1;
  run.phase = 'combat';

  const seen = enemies.filter(e => e.revealed);
  const hidden = enemies.filter(e => !e.revealed);
  if (seen.length) {
    logEvent(run, `You enter ${room.flavor}. You spot: ${seen.map(e => e.name).join(', ')}. Roll for initiative!`, 'urgent');
  } else {
    logEvent(run, `You enter ${room.flavor}. It seems quiet… but stay wary.`, 'urgent');
  }
  if (hidden.length) {
    logEvent(run, 'Something you have not seen lurks here — be ready.', 'event');
  }
  runUntilHeroTurn(run, roll);
}

function living(run, side) { return run.combatants.filter(c => c.side === side && !c.down); }
function livingRevealedEnemies(run) { return run.combatants.filter(c => c.side === 'enemy' && !c.down && c.revealed); }
function current(run) { return run.combatants[run.turnIndex]; }
function nextTurn(run) {
  run.turnIndex = (run.turnIndex + 1) % run.combatants.length;
  if (run.turnIndex === 0) run.round += 1;   // wrapped to top of initiative = new round
}

/** Auto-resolve enemy + ai-companion turns; stop at a living HUMAN hero. */
function runUntilHeroTurn(run, roll) {
  let guard = 0;
  while (run.phase === 'combat' && guard++ < 2000) {
    if (living(run, 'enemy').length === 0) return clearRoom(run);
    if (living(run, 'hero').length === 0) return defeat(run);
    const cb = current(run);
    if (!cb || cb.down) { nextTurn(run); continue; }
    if (cb.side === 'hero' && !cb.ai) { logEvent(run, `It is ${cb.name}'s turn.`, 'event'); return; }
    if (cb.side === 'hero') aiHeroTurn(run, cb, roll);   // ai companion
    else enemyTurn(run, cb, roll);
    nextTurn(run);
  }
}

function aiHeroTurn(run, hero, roll) {
  const foes = livingRevealedEnemies(run);
  if (!foes.length) { logEvent(run, `${hero.name} scans the room, weapon ready.`, 'event'); return; }
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
  const targetAC = flat ? target.flatAc : target.ac;
  const res = combat.creatureAttack(enemy.creature, targetAC, roll);
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

  if (run.phase === 'cleared' && type === 'descend') {
    if (!run.heroes.some(h => h.ownerClientId === clientId)) return { ok: false, error: 'not a party member' };
    spawnRoom(run, roll);
    return { ok: true };
  }
  if (run.phase !== 'combat') return { ok: false, error: 'no action available now' };

  const cb = current(run);
  if (!cb || cb.side !== 'hero' || cb.ai) return { ok: false, error: 'wait for your turn' };
  if (cb.ownerClientId !== clientId) return { ok: false, error: 'it is ' + cb.name + "'s turn, not yours" };

  if (type === 'attack') {
    const target = pickTarget(run, action.target);
    if (!target) return { ok: false, error: 'no visible target' };
    heroAttack(run, cb, target, roll);
  } else if (type === 'pass') {
    logEvent(run, `${cb.name} holds their action.`, 'event');
  } else {
    return { ok: false, error: 'unknown action' };
  }
  nextTurn(run);
  runUntilHeroTurn(run, roll);
  return { ok: true };
}

function pickTarget(run, targetId) {
  const foes = livingRevealedEnemies(run);
  if (targetId) return foes.find(f => f.id === targetId) || null;
  return foes[0] || null;
}

function heroAttack(run, hero, target, roll) {
  const res = combat.heroAttack(hero.character.derived, hero.character.weapon, target.ac, roll);
  if (!res.hit) { logEvent(run, `${hero.name} swings at ${target.name} and misses.`, 'event'); return; }
  target.hp -= res.damage;
  const crit = res.crit ? 'Critical! ' : '';
  logEvent(run, `${crit}${hero.name} hits ${target.name} for ${res.damage}. (${Math.max(0, target.hp)} HP left.)`, 'event');
  if (target.hp <= 0) { target.down = true; logEvent(run, `${target.name} is slain!`, 'urgent'); }
}

function clearRoom(run) {
  run.phase = 'cleared';
  run.gold += run.room.reward.gp;
  run.roomsCleared += 1;
  run.heroes.forEach(h => {           // short rest: revive downed + heal to half
    const half = Math.ceil(h.maxHp / 2);
    if (h.hp < half) h.hp = half;
    h.down = false;
  });
  logEvent(run, `The room is cleared! The party finds ${run.room.reward.gp} gold and catches its breath. Descend deeper?`, 'urgent');
}

function defeat(run) { run.phase = 'defeated'; logEvent(run, 'The party has fallen. The dungeon claims you.', 'urgent'); }

function logEvent(run, text, priority) {
  run.log.push({ seq: ++run.seq, text, priority: priority || 'event' });
  if (run.log.length > 80) run.log.shift();
}

/** Client-facing view. Hidden (unrevealed) enemies are omitted entirely. */
function publicRun(run) {
  const cb = current(run);
  const turn = (run.phase === 'combat' && cb && cb.side === 'hero' && !cb.ai)
    ? { combatantId: cb.id, ownerClientId: cb.ownerClientId, name: cb.name } : null;
  const shown = run.combatants.filter(c => c.side === 'hero' || c.revealed);
  return {
    phase: run.phase, round: run.round, gold: run.gold, roomsCleared: run.roomsCleared,
    room: run.room ? { flavor: run.room.flavor } : null,
    combatants: shown.map(c => ({
      id: c.id, side: c.side, name: c.name, icon: c.icon,
      hp: Math.max(0, c.hp), maxHp: c.maxHp, ac: c.ac, down: c.down,
      ai: !!c.ai, ownerClientId: c.ownerClientId || null,
      current: cb ? c.id === cb.id : false,
    })),
    enemies: livingRevealedEnemies(run).map(e => ({ id: e.id, name: e.name, hp: Math.max(0, e.hp) })),
    turn,
    log: run.log.slice(-40),
  };
}

/** Compact status for the concurrent-delves side window. */
function summary(run) {
  const heroes = run.heroes.map(h => ({ icon: h.icon, name: h.name, hp: Math.max(0, h.hp), maxHp: h.maxHp, down: h.down, ai: h.ai }));
  const alive = run.heroes.filter(h => !h.down).length;
  return { phase: run.phase, depth: run.roomsCleared + (run.phase === 'cleared' ? 0 : 1), round: run.round, alive, heroes };
}

function cap(s) { return s ? s[0].toUpperCase() + s.slice(1) : s; }

module.exports = { createPartyRun, applyAction, publicRun, summary, spawnRoom };
