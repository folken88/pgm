/**
 * Game state machine for the v0 slice: create a run, resolve player actions
 * (turn-based combat in one room), advance to the next room on victory. Pure
 * given an injected dice roller — the server owns persistence + randomness.
 *
 * A `run` is the server-authoritative state (see design: multiplayer later
 * broadcasts this same object to N sockets). Each action returns a list of
 * narration `events` ({text, priority}) plus the new `choices`.
 */
const { createCharacter } = require('./characters');
const { generateRoom } = require('./roomgen');
const combat = require('./combat');
const N = require('./narrator');

const CHOICES = {
  in_combat: (run) => ([
    { id: 'attack', label: `Attack the ${run.room.creature.name}` },
    { id: 'look', label: 'Look around' },
    { id: 'status', label: 'Check my character' },
    { id: 'flee', label: 'Flee the dungeon' },
  ]),
  cleared: () => ([
    { id: 'continue', label: 'Descend deeper' },
    { id: 'status', label: 'Check my character' },
    { id: 'flee', label: 'Leave the dungeon' },
  ]),
  dead: () => ([{ id: 'newrun', label: 'Start a new run' }]),
  fled: () => ([{ id: 'newrun', label: 'Start a new run' }]),
};

/** Build a new run for a freshly created character. */
function startRun(charInput, roll = Math.random) {
  const character = createCharacter(charInput);
  const room = generateRoom(roll);
  const run = {
    character,
    hero: { character, hp: character.maxHp },
    room,
    status: 'in_combat',
    gold: 0,
    roomsCleared: 0,
    log: [],
  };
  const events = [{ text: N.roomEntered(room, character), priority: 'event' }];
  return commit(run, events);
}

/** Apply a player action. Returns { run, events, choices, status }. */
function applyAction(run, action, roll = Math.random) {
  if (run.status === 'in_combat') return combatAction(run, action, roll);
  if (run.status === 'cleared' && action === 'continue') return descend(run, roll);
  if (action === 'status') return respond(run, N.heroStatus(run.hero), 'urgent');
  // Anything else when not in combat: just re-state options.
  return respond(run, 'The way is clear. Choose where to go next.', 'event');
}

function combatAction(run, action, roll) {
  const creature = run.room.creature;
  const hero = run.hero;

  if (action === 'look')   return respond(run, N.lookAround(run.room), 'urgent');
  if (action === 'status') return respond(run, N.heroStatus(hero), 'urgent');
  if (action === 'flee') {
    run.status = 'fled';
    return commit(run, [{ text: 'You turn and flee the dungeon, heart pounding. Your run ends.', priority: 'urgent' }]);
  }
  if (action !== 'attack') {
    return respond(run, 'You hesitate. Choose an action.', 'event');
  }

  const events = [];
  // Hero swings.
  const hres = combat.heroAttack(hero.character.derived, hero.character.weapon, creature.ac, roll);
  creature.hp -= hres.damage;
  events.push({ text: N.heroAttackResult(hres, hero.character, creature), priority: 'event' });

  if (creature.hp <= 0) {
    run.status = 'cleared';
    run.gold += run.room.reward.gp;
    run.roomsCleared += 1;
    events.push({ text: N.victory(creature, run.room.reward), priority: 'urgent' });
    return commit(run, events);
  }

  // Creature strikes back.
  const cres = combat.creatureAttack(creature, hero.character.ac, roll);
  hero.hp -= cres.damage;
  events.push({ text: N.creatureAttackResult(cres, hero, creature), priority: 'event' });

  if (hero.hp <= 0) {
    run.status = 'dead';
    events.push({ text: N.defeat(creature), priority: 'urgent' });
  }
  return commit(run, events);
}

function descend(run, roll) {
  run.room = generateRoom(roll);
  run.status = 'in_combat';
  const events = [{ text: N.roomEntered(run.room, run.character), priority: 'event' }];
  return commit(run, events);
}

function respond(run, text, priority) {
  return { run, events: [{ text, priority }], choices: choicesFor(run), status: run.status };
}

function commit(run, events) {
  for (const e of events) run.log.push(e.text);
  return { run, events, choices: choicesFor(run), status: run.status };
}

function choicesFor(run) {
  return (CHOICES[run.status] || (() => []))(run);
}

/** Client-safe snapshot of a run (no giant derivation blob echoed each turn). */
function snapshot(run) {
  return {
    status: run.status,
    gold: run.gold,
    roomsCleared: run.roomsCleared,
    hero: {
      name: run.character.name,
      cls: run.character.cls,
      race: run.character.race,
      hp: run.hero.hp,
      maxHp: run.character.maxHp,
      ac: run.character.ac,
      weaponName: run.character.weaponName,
    },
    creature: run.room ? {
      name: run.room.creature.name,
      hp: Math.max(0, run.room.creature.hp),
      maxHp: run.room.creature.maxHp,
    } : null,
    choices: choicesFor(run),
  };
}

module.exports = { startRun, applyAction, snapshot, choicesFor };
