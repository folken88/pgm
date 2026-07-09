/**
 * Session registry — multiple concurrent delves at once. Each delve is an
 * independent party (human players + AI companions) with its own lobby/run.
 * Every SSE client receives its own delve's detail PLUS a compact summary of all
 * delves (for the side window). One human may delve solo with AI companions;
 * different groups delve separately in parallel.
 */
const characters = require('./characters');
const partyrun = require('./partyrun');
const { COMPANIONS } = require('./content');

const MAX_PARTY = 8;        // humans + AI companions per delve
const MAX_SPECTATORS = 10;
const ICONS = ['🧙','🧝','🛡️','⚔️','🏹','🗡️','🪓','🔮','🐉','🐺','🦅','💀','👑','🎭','🕯️','⚗️'];

const sessions = new Map();   // sessionId -> delve
const clients = new Map();    // clientId -> { sessionId, role }
let seq = 0, sid = 0;

function now() { return Date.now(); }
function cleanName(n) { return String(n || '').trim().slice(0, 24) || 'Someone'; }
function cleanIcon(i) { return ICONS.includes(i) ? i : ICONS[0]; }
function newClientId() { return 'c' + (++seq); }
function partySize(s) { return s.members.size; }

function createDelve({ name, icon, delveName }) {
  name = cleanName(name); icon = cleanIcon(icon);
  const id = 's' + (++sid);
  const s = { id, name: cleanName(delveName) !== 'Someone' && delveName ? cleanName(delveName) : name + "'s Delve",
    phase: 'lobby', host: null, members: new Map(), spectators: new Map(),
    run: null, createdAt: now(), startedAt: null };
  const clientId = newClientId();
  s.host = clientId;
  s.members.set(clientId, { memberId: clientId, clientId, name, icon, character: null, ready: false, ai: false });
  clients.set(clientId, { sessionId: id, role: 'player' });
  sessions.set(id, s);
  return { ok: true, clientId, sessionId: id };
}

function joinDelve(sessionId, { name, icon, role }) {
  const s = sessions.get(sessionId);
  if (!s) return { ok: false, error: 'That delve no longer exists.' };
  name = cleanName(name); icon = cleanIcon(icon);
  if (role === 'player') {
    if (s.phase !== 'lobby') return { ok: false, error: 'That delve has already set out — you can spectate.', canSpectate: true, sessionId };
    if (partySize(s) >= MAX_PARTY) return { ok: false, error: 'That party is full.', canSpectate: true, sessionId };
    const clientId = newClientId();
    s.members.set(clientId, { memberId: clientId, clientId, name, icon, character: null, ready: false, ai: false });
    clients.set(clientId, { sessionId, role: 'player' });
    return { ok: true, clientId, sessionId, role: 'player' };
  }
  if (s.spectators.size >= MAX_SPECTATORS) return { ok: false, error: 'That delve\'s gallery is full.' };
  const clientId = newClientId();
  s.spectators.set(clientId, { clientId, name, icon });
  clients.set(clientId, { sessionId, role: 'spectator' });
  return { ok: true, clientId, sessionId, role: 'spectator' };
}

function sessionOf(clientId) {
  const c = clients.get(clientId);
  return c ? sessions.get(c.sessionId) : null;
}

function setCharacter(clientId, charInput) {
  const s = sessionOf(clientId); if (!s) return { ok: false, error: 'no delve' };
  const m = s.members.get(clientId); if (!m) return { ok: false, error: 'not a player' };
  if (s.phase !== 'lobby') return { ok: false, error: 'delve already started' };
  m.character = characters.createCharacter({ name: m.name, race: charInput.race, cls: charInput.cls, skills: charInput.skills });
  m.ready = true;
  return { ok: true };
}

function addCompanion(clientId, index) {
  const s = sessionOf(clientId); if (!s) return { ok: false, error: 'no delve' };
  if (s.host !== clientId) return { ok: false, error: 'only the host adds companions' };
  if (s.phase !== 'lobby') return { ok: false, error: 'delve already started' };
  if (partySize(s) >= MAX_PARTY) return { ok: false, error: 'party is full' };
  const preset = COMPANIONS[((index | 0) % COMPANIONS.length + COMPANIONS.length) % COMPANIONS.length];
  const aiId = 'ai' + (++seq);
  const character = characters.createCharacter({ name: preset.name, race: preset.race, cls: preset.cls });
  s.members.set(aiId, { memberId: aiId, clientId: null, name: preset.name, icon: preset.icon, character, ready: true, ai: true });
  return { ok: true };
}

function removeCompanion(clientId, memberId) {
  const s = sessionOf(clientId); if (!s || s.host !== clientId) return { ok: false };
  const m = s.members.get(memberId);
  if (m && m.ai) s.members.delete(memberId);
  return { ok: true };
}

function startRun(clientId) {
  const s = sessionOf(clientId); if (!s) return { ok: false, error: 'no delve' };
  if (!s.members.has(clientId)) return { ok: false, error: 'only a player can start' };
  const ready = [...s.members.values()].filter(m => m.ready && m.character);
  if (ready.length < 1) return { ok: false, error: 'no ready characters yet' };
  s.run = partyrun.createPartyRun(ready.map(m => ({ clientId: m.memberId, icon: m.icon, character: m.character, ai: m.ai })));
  s.phase = 'playing';
  s.startedAt = now();
  return { ok: true };
}

function action(clientId, act) {
  const s = sessionOf(clientId); if (!s || s.phase !== 'playing' || !s.run) return { ok: false, error: 'no run' };
  return partyrun.applyAction(s.run, clientId, act);
}

function leave(clientId) {
  const s = sessionOf(clientId);
  clients.delete(clientId);
  if (!s) return;
  s.members.delete(clientId);
  s.spectators.delete(clientId);
  // A delve with no human members left is abandoned.
  const humans = [...s.members.values()].filter(m => !m.ai).length;
  if (humans === 0 && s.spectators.size === 0) sessions.delete(s.id);
}

function memberView(m, clientId) {
  return { memberId: m.memberId, name: m.name, icon: m.icon, ready: m.ready, ai: m.ai,
    cls: m.character ? m.character.cls : null, race: m.character ? m.character.race : null,
    isYou: m.memberId === clientId };
}

/** Detailed view of the client's own delve. */
function sessionSnapshotFor(clientId) {
  const c = clients.get(clientId); if (!c) return null;
  const s = sessions.get(c.sessionId); if (!s) return null;
  return {
    id: s.id, name: s.name, phase: s.phase, role: c.role, youAreHost: s.host === clientId,
    counts: { party: partySize(s), maxParty: MAX_PARTY, spectators: s.spectators.size, maxSpectators: MAX_SPECTATORS },
    members: [...s.members.values()].map(m => memberView(m, clientId)),
    spectators: [...s.spectators.values()].map(sp => ({ name: sp.name, icon: sp.icon, isYou: sp.clientId === clientId })),
    run: s.run ? partyrun.publicRun(s.run) : null,
  };
}

/** Compact summaries of ALL delves for the side window. */
function allSummaries() {
  return [...sessions.values()].map(s => {
    const elapsedSec = Math.floor((now() - (s.startedAt || s.createdAt)) / 1000);
    let depth = 0, round = 0, heroes;
    if (s.run) {
      const sum = partyrun.summary(s.run);
      depth = sum.depth; round = sum.round; heroes = sum.heroes;
    } else {
      heroes = [...s.members.values()].map(m => ({ icon: m.icon, name: m.name, ai: m.ai, hp: null, maxHp: null, down: false }));
    }
    return {
      id: s.id, name: s.name, phase: s.phase, depth, round, elapsedSec,
      partySize: partySize(s), spectators: s.spectators.size, heroes,
    };
  });
}

/** The per-client SSE payload: your delve + everyone's summaries. */
function snapshotFor(clientId) {
  return { you: clientId ? sessionSnapshotFor(clientId) : null, sessions: allSummaries() };
}

module.exports = {
  ICONS, COMPANIONS, MAX_PARTY, MAX_SPECTATORS,
  createDelve, joinDelve, setCharacter, addCompanion, removeCompanion,
  startRun, action, leave, snapshotFor, sessionSnapshotFor, allSummaries,
  _reset() { sessions.clear(); clients.clear(); seq = 0; sid = 0; },
};
