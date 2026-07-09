/**
 * Multiplayer session (v0): ONE shared, nameable party that clients join as
 * players (up to 8) or spectators (up to 10). Server-authoritative; state is
 * pushed to every connected client via SSE (see server.js). This module owns the
 * roster + lobby lifecycle; the party RUN (shared dungeon + initiative combat) is
 * wired in the next increment — `run` stays null in the lobby foundation.
 */
const characters = require('./characters');
const partyrun = require('./partyrun');

const MAX_PLAYERS = 8;
const MAX_SPECTATORS = 10;

// Pickable icons (emoji) for players + spectators.
const ICONS = ['🧙','🧝','🛡️','⚔️','🏹','🗡️','🪓','🔮','🐉','🐺','🦅','💀','👑','🎭','🕯️','⚗️'];

let session = fresh();
let seq = 0;

function fresh() {
  return { name: 'The Delve', phase: 'lobby', players: new Map(), spectators: new Map(), run: null };
}

function cleanName(n) { return String(n || '').trim().slice(0, 24) || 'Someone'; }
function cleanIcon(i) { return ICONS.includes(i) ? i : ICONS[0]; }

/** Join as 'player' or 'spectator'. Returns {ok, clientId} or {ok:false, error, canSpectate}. */
function join({ name, icon, role }) {
  name = cleanName(name); icon = cleanIcon(icon);
  if (role === 'player') {
    if (session.phase !== 'lobby') return { ok: false, error: 'The adventure has already started — join as a spectator.', canSpectate: true };
    if (session.players.size >= MAX_PLAYERS) return { ok: false, error: 'The party is full (8 players).', canSpectate: true };
  } else {
    role = 'spectator';
    if (session.spectators.size >= MAX_SPECTATORS) return { ok: false, error: 'The gallery is full (10 spectators).' };
  }
  const clientId = 'c' + (++seq);
  if (role === 'player') {
    session.players.set(clientId, { clientId, name, icon, character: null, ready: false });
  } else {
    session.spectators.set(clientId, { clientId, name, icon });
  }
  return { ok: true, clientId, role };
}

function leave(clientId) {
  session.players.delete(clientId);
  session.spectators.delete(clientId);
  // If everyone left, reset the session.
  if (session.players.size === 0 && session.spectators.size === 0) session = fresh();
}

/** A player finalizes their character (race/class/skills) and readies up. */
function setCharacter(clientId, charInput) {
  const p = session.players.get(clientId);
  if (!p) return { ok: false, error: 'not a player in this session' };
  if (session.phase !== 'lobby') return { ok: false, error: 'adventure already started' };
  const character = characters.createCharacter({ name: p.name, ...charInput });
  p.character = character;
  p.ready = true;
  return { ok: true };
}

function setName(clientId, name) {
  const m = session.players.get(clientId) || session.spectators.get(clientId);
  if (m) m.name = cleanName(name);
}

function rename(name) { session.name = cleanName(name); }

/** Any player may start once at least one player is ready. */
function startRun(clientId) {
  if (!session.players.has(clientId)) return { ok: false, error: 'only a player can start' };
  const ready = [...session.players.values()].filter(p => p.ready && p.character);
  if (ready.length < 1) return { ok: false, error: 'no ready characters yet' };
  session.phase = 'playing';
  session.run = partyrun.createPartyRun(
    ready.map(p => ({ clientId: p.clientId, icon: p.icon, character: p.character })));
  return { ok: true };
}

/** A player acts in the shared run (attack/pass/descend). Turn-gated in-engine. */
function action(clientId, act) {
  if (session.phase !== 'playing' || !session.run) return { ok: false, error: 'no run in progress' };
  return partyrun.applyAction(session.run, clientId, act);
}

function snapshot() {
  return {
    name: session.name,
    phase: session.phase,
    counts: {
      players: session.players.size, maxPlayers: MAX_PLAYERS,
      spectators: session.spectators.size, maxSpectators: MAX_SPECTATORS,
    },
    players: [...session.players.values()].map(p => ({
      clientId: p.clientId, name: p.name, icon: p.icon, ready: p.ready,
      cls: p.character ? p.character.cls : null,
      race: p.character ? p.character.race : null,
    })),
    spectators: [...session.spectators.values()].map(s => ({ clientId: s.clientId, name: s.name, icon: s.icon })),
    run: session.run ? partyrun.publicRun(session.run) : null,
  };
}

module.exports = {
  ICONS, MAX_PLAYERS, MAX_SPECTATORS,
  join, leave, setCharacter, setName, rename, startRun, action, snapshot,
  _reset() { session = fresh(); seq = 0; },
};
