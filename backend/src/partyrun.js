/**
 * Party run engine — turn-based PF1 combat for a shared multiplayer party.
 * Initiative order across all combatants (heroes + enemies); the server resolves
 * enemy turns automatically and STOPS on a living hero's turn to wait for that
 * player's action. Pure given an injected dice roller (deterministic tests).
 *
 * A run:
 *   heroes[]      persistent hero combatants (hp carries between rooms)
 *   combatants[]  heroes + this room's enemies, sorted by initiative
 *   turnIndex     whose turn (index into combatants)
 *   phase         'combat' | 'cleared' | 'defeated'
 *   log[]         { seq, text, priority } — clients speak entries newer than seen
 */
const combat = require('./combat');
const { generatePartyRoom } = require('./roomgen');
const { rollDie } = require('./dice');

function createPartyRun(party, roll = Math.random) {
  const run = { heroes: party.map(heroCombatant), combatants: [], room: null,
    turnIndex: 0, phase: 'combat', gold: 0, roomsCleared: 0, seq: 0, log: [] };
  spawnRoom(run, roll);
  return run;
}

function heroCombatant(p) {
  const c = p.character;
  return {
    id: 'h:' + p.clientId, side: 'hero', ownerClientId: p.clientId,
    name: c.name, icon: p.icon || '🛡️',
    hp: c.maxHp, maxHp: c.maxHp, ac: c.ac,
    character: c, down: false, initMod: (c.derived.mods.dex || 0),
  };
}
function enemyCombatant(e, i) {
  return {
    id: 'e:' + i, side: 'enemy', name: e.name, icon: '👹',
    hp: e.hp, maxHp: e.maxHp, ac: e.ac, creature: e, down: false,
    initMod: e.initBonus || 0,
  };
}

function spawnRoom(run, roll) {
  const room = generatePartyRoom(run.heroes.length, roll);
  run.room = { flavor: room.flavor, reward: room.reward };
  const enemies = room.enemies.map(enemyCombatant);
  run.combatants = run.heroes.concat(enemies);
  run.combatants.forEach(cb => { cb.init = rollDie(20, roll) + cb.initMod; });
  run.combatants.sort((a, b) => (b.init - a.init) || (b.initMod - a.initMod));
  run.turnIndex = 0;
  run.phase = 'combat';
  const foes = enemies.map(e => e.name).join(', ');
  logEvent(run, `You enter ${room.flavor}. Foes: ${foes}. Roll for initiative!`, 'urgent');
  logEvent(run, 'Turn order: ' + run.combatants.map(c => c.name).join(', ') + '.', 'event');
  runUntilHeroTurn(run, roll);
}

function living(run, side) { return run.combatants.filter(c => c.side === side && !c.down); }
function current(run) { return run.combatants[run.turnIndex]; }
function nextTurn(run) { run.turnIndex = (run.turnIndex + 1) % run.combatants.length; }

/** Resolve enemy turns automatically; stop at a living hero's turn or an end. */
function runUntilHeroTurn(run, roll) {
  let guard = 0;
  while (run.phase === 'combat' && guard++ < 1000) {
    if (living(run, 'enemy').length === 0) return clearRoom(run);
    if (living(run, 'hero').length === 0) return defeat(run);
    const cb = current(run);
    if (!cb || cb.down) { nextTurn(run); continue; }
    if (cb.side === 'hero') { logEvent(run, `It is ${cb.name}'s turn.`, 'event'); return; }
    enemyTurn(run, cb, roll);
    nextTurn(run);
  }
}

function enemyTurn(run, enemy, roll) {
  const targets = living(run, 'hero');
  if (!targets.length) return;
  // AI: strike the most wounded hero.
  const target = targets.slice().sort((a, b) => a.hp - b.hp)[0];
  const res = combat.creatureAttack(enemy.creature, target.ac, roll);
  if (res.hit) {
    target.hp -= res.damage;
    logEvent(run, `${enemy.name} hits ${target.name} for ${res.damage}. (${Math.max(0, target.hp)} HP left.)`, 'event');
    if (target.hp <= 0) { target.down = true; logEvent(run, `${target.name} falls!`, 'urgent'); }
  } else {
    logEvent(run, `${enemy.name} misses ${target.name}.`, 'event');
  }
}

/** A player acts on their hero's turn (attack a target / pass), or descends. */
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
  if (!cb || cb.side !== 'hero') return { ok: false, error: 'wait for your turn' };
  if (cb.ownerClientId !== clientId) return { ok: false, error: 'it is ' + cb.name + "'s turn, not yours" };

  if (type === 'attack') {
    const target = pickTarget(run, action.target);
    if (!target) return { ok: false, error: 'no living target' };
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
  const foes = living(run, 'enemy');
  if (targetId) return foes.find(f => f.id === targetId) || null;
  return foes[0] || null;
}

function heroAttack(run, hero, target, roll) {
  const res = combat.heroAttack(hero.character.derived, hero.character.weapon, target.ac, roll);
  if (!res.hit) {
    logEvent(run, `${hero.name} swings at ${target.name} and misses.`, 'event');
    return;
  }
  target.hp -= res.damage;
  const crit = res.crit ? 'Critical! ' : '';
  logEvent(run, `${crit}${hero.name} hits ${target.name} for ${res.damage}. (${Math.max(0, target.hp)} HP left.)`, 'event');
  if (target.hp <= 0) { target.down = true; logEvent(run, `${target.name} is slain!`, 'urgent'); }
}

function clearRoom(run) {
  run.phase = 'cleared';
  run.gold += run.room.reward.gp;
  run.roomsCleared += 1;
  // Short rest: the party catches its breath — revive downed heroes and heal to half.
  run.heroes.forEach(h => {
    const half = Math.ceil(h.maxHp / 2);
    if (h.hp < half) h.hp = half;
    h.down = false;
  });
  logEvent(run, `The room is cleared! The party finds ${run.room.reward.gp} gold and catches its breath. Descend deeper?`, 'urgent');
}

function defeat(run) {
  run.phase = 'defeated';
  logEvent(run, 'The party has fallen. The dungeon claims you. Your run ends.', 'urgent');
}

function logEvent(run, text, priority) {
  run.log.push({ seq: ++run.seq, text, priority: priority || 'event' });
  if (run.log.length > 80) run.log.shift();
}

/** Client-facing view of the run (same for all; client decides "my turn"). */
function publicRun(run) {
  const cb = current(run);
  const turn = (run.phase === 'combat' && cb && cb.side === 'hero')
    ? { combatantId: cb.id, ownerClientId: cb.ownerClientId, name: cb.name } : null;
  return {
    phase: run.phase, gold: run.gold, roomsCleared: run.roomsCleared,
    room: run.room ? { flavor: run.room.flavor } : null,
    combatants: run.combatants.map(c => ({
      id: c.id, side: c.side, name: c.name, icon: c.icon,
      hp: Math.max(0, c.hp), maxHp: c.maxHp, ac: c.ac, down: c.down,
      ownerClientId: c.ownerClientId || null,
      current: cb ? c.id === cb.id : false,
    })),
    enemies: living(run, 'enemy').map(e => ({ id: e.id, name: e.name, hp: Math.max(0, e.hp) })),
    turn,
    log: run.log.slice(-40),
  };
}

module.exports = { createPartyRun, applyAction, publicRun, spawnRoom };
