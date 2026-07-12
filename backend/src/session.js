/**
 * Session registry — multiple concurrent delves at once. Each delve is an
 * independent party (human players + AI companions) with its own lobby/run.
 * Every SSE client receives its own delve's detail PLUS a compact summary of all
 * delves (for the side window). One human may delve solo with AI companions;
 * different groups delve separately in parallel.
 */
const fs = require('node:fs');
const path = require('node:path');
const characters = require('./characters');
const partyrun = require('./partyrun');
const { COMPANIONS } = require('./content');
const cast = require('./cast');

// ── Full per-delve text logs (Tobias: keep them for analysis/troubleshooting) ──
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', '..', 'data');
const DELVE_DIR = path.join(DATA_DIR, 'delves');
try { fs.mkdirSync(DELVE_DIR, { recursive: true }); } catch (e) {}
const BOOT = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 16);   // session ids restart each boot — stamp the file
function delveFile(s) { return path.join(DELVE_DIR, BOOT + '_' + s.id + '-' + s.name.replace(/[^a-z0-9]+/gi, '_').slice(0, 30) + '.log'); }
function delveLog(s, line) {
  try { fs.appendFileSync(delveFile(s), new Date().toISOString() + ' ' + line + '\n'); } catch (e) {}
}
// ── Hero LEGACY (persists across restarts/deploys): xp/level keyed by
// delve name + hero name. Runs are roguelite-fresh; PROGRESSION endures.
const LEGACY_FILE = path.join(DATA_DIR, 'legacy.json');
let LEGACY = {};
try { LEGACY = JSON.parse(fs.readFileSync(LEGACY_FILE, 'utf8')); } catch (e) {}
function legacyKey(s, name) { return (s.name + '::' + name).toLowerCase(); }
function saveLegacy() { try { fs.writeFileSync(LEGACY_FILE, JSON.stringify(LEGACY)); } catch (e) {} }
function persistProgress(s) {
  if (!s.run) return;
  let dirty = false;
  for (const h of s.run.heroes) {
    if (!h.xp && !h.negLevels) continue;
    const k = legacyKey(s, h.name);
    const prev = LEGACY[k] || {};
    if (prev.xp !== h.xp || (prev.negLevels || 0) !== (h.negLevels || 0)) {
      LEGACY[k] = { xp: h.xp, level: h.level || 1, negLevels: h.negLevels || 0, at: Date.now() };
      dirty = true;
    }
  }
  if (dirty) saveLegacy();
}

/** Append any run-log lines newer than the last flush (seq-tracked). */
function flushRunLog(s) {
  if (!s || !s.run) return;
  const newer = s.run.log.filter(e => e.seq > (s._logSeq || 0));
  if (!newer.length) return;
  s._logSeq = newer[newer.length - 1].seq;
  const stamp = new Date().toISOString();
  const lines = newer.map(e => `${stamp} [room ${s.run.roomsCleared + 1} rd ${s.run.round}] ${e.text}`).join('\n') + '\n';
  try { fs.appendFileSync(delveFile(s), lines); } catch (e) {}
}

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
  delveLog(s, `DELVE CREATED "${s.name}" by ${name} ${icon}`);
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
    delveLog(s, `PLAYER JOINED: ${name}`);
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

function addCompanion(clientId, nameOrIndex) {
  const s = sessionOf(clientId); if (!s) return { ok: false, error: 'no delve' };
  if (s.host !== clientId) return { ok: false, error: 'only the host adds companions' };
  if (s.phase !== 'lobby') return { ok: false, error: 'delve already started' };
  if (partySize(s) >= MAX_PARTY) return { ok: false, error: 'party is full' };
  // The POKER CAST by name; numeric index falls back to the legacy presets.
  let name, icon, character, voiceId = null;
  if (typeof nameOrIndex === 'string' && cast.BY_NAME[nameOrIndex.toLowerCase()]) {
    if ([...s.members.values()].some(m => m.ai && m.name === cast.BY_NAME[nameOrIndex.toLowerCase()].name)) {
      return { ok: false, error: 'they are already in the party' };
    }
    const built = cast.buildCompanion(nameOrIndex);
    name = built.roster.name; icon = built.roster.icon; character = built.character; voiceId = built.roster.voiceId;
  } else {
    const preset = COMPANIONS[((nameOrIndex | 0) % COMPANIONS.length + COMPANIONS.length) % COMPANIONS.length];
    name = preset.name; icon = preset.icon;
    character = characters.createCharacter({ name: preset.name, race: preset.race, cls: preset.cls });
  }
  const aiId = 'ai' + (++seq);
  s.members.set(aiId, { memberId: aiId, clientId: null, name, icon, character, ready: true, ai: true, voiceId });
  delveLog(s, `COMPANION ADDED: ${name} (${character.cls})`);
  return { ok: true };
}

function removeCompanion(clientId, memberId) {
  const s = sessionOf(clientId); if (!s || s.host !== clientId) return { ok: false };
  const m = s.members.get(memberId);
  if (m && m.ai) s.members.delete(memberId);
  return { ok: true };
}

// ── THE SWASHGOBLIN (Tobias 2026-07-11): the adventurers' pub between delves.
// A run's end drops the party here: gold banks into the party purse, the dead
// are hauled along like luggage until a hired cleric raises them (2 negative
// levels, PF1), Restoration and potions are for sale. Prices are tunable —
// RAW where affordable, mates' rates where RAW would empty every purse forever.
const PUB_SERVICES = {
  potion_clw:  { label: 'Potion of Cure Light Wounds', gp: 50,  kind: 'stash', item: 'potion_clw' },
  potion_cmw:  { label: 'Potion of Cure Moderate Wounds', gp: 300, kind: 'stash', item: 'potion_cmw' },
  restoration: { label: 'Restoration (cure negative levels)', gp: 380, kind: 'restoration' },
  raisedead:   { label: 'Hire a cleric: Raise Dead', gp: 1000, kind: 'raise' },
};
function pubKey(s) { return ('pub::' + s.name).toLowerCase(); }
function pubPurse(s) { return (LEGACY[pubKey(s)] && LEGACY[pubKey(s)].gold) || 0; }
function pubBank(s, delta) {
  const k = pubKey(s);
  LEGACY[k] = { gold: Math.max(0, pubPurse(s) + delta), at: Date.now() };
  saveLegacy();
}
/** A run just ended — the party staggers back to the Swashgoblin. */
function enterPub(s) {
  if (!s.run) return;
  pubBank(s, s.run.gold || 0);
  for (const h of s.run.heroes) {
    const m = [...s.members.values()].find(x => x.name === h.name);
    if (m) { m.dead = !!h.dead; m.negLevels = h.negLevels || 0; }
    const k = legacyKey(s, h.name);
    LEGACY[k] = Object.assign({}, LEGACY[k], { dead: !!h.dead, negLevels: h.negLevels || 0, at: Date.now() });
  }
  saveLegacy();
  s.phase = 'pub';
  delveLog(s, 'PARTY AT THE SWASHGOBLIN: purse ' + pubPurse(s) + 'gp, dead: ' + ([...s.members.values()].filter(m => m.dead).map(m => m.name).join(', ') || 'none'));
}
function pubBuy(clientId, serviceKey, targetName) {
  const s = sessionOf(clientId); if (!s || s.phase !== 'pub') return { ok: false, error: 'you are not at the Swashgoblin' };
  const svc = PUB_SERVICES[serviceKey]; if (!svc) return { ok: false, error: 'the barkeep has never heard of that' };
  if (pubPurse(s) < svc.gp) return { ok: false, error: 'not enough gold — the purse holds ' + pubPurse(s) + 'gp' };
  if (svc.kind === 'stash') {
    pubBank(s, -svc.gp);
    s.stash = s.stash || {};
    s.stash[svc.item] = (s.stash[svc.item] || 0) + 1;
    delveLog(s, 'PUB: bought ' + svc.label + ' (' + svc.gp + 'gp)');
    return { ok: true, text: svc.label + ' added to the party stash.' };
  }
  const m = [...s.members.values()].find(x => x.name.toLowerCase() === String(targetName || '').toLowerCase());
  if (!m) return { ok: false, error: 'no party member by that name' };
  if (svc.kind === 'restoration') {
    if (!(m.negLevels > 0)) return { ok: false, error: m.name + ' has no negative levels' };
    pubBank(s, -svc.gp);
    m.negLevels = 0;
    LEGACY[legacyKey(s, m.name)] = Object.assign({}, LEGACY[legacyKey(s, m.name)], { negLevels: 0, at: Date.now() });
    saveLegacy();
    delveLog(s, 'PUB: Restoration on ' + m.name + ' (' + svc.gp + 'gp)');
    return { ok: true, text: 'The cleric chants — ' + m.name + ' stands straighter. Negative levels gone.' };
  }
  if (svc.kind === 'raise') {
    if (!m.dead) return { ok: false, error: m.name + ' is not dead' };
    pubBank(s, -svc.gp);
    m.dead = false;
    m.negLevels = (m.negLevels || 0) + 2;   // PF1 Raise Dead
    LEGACY[legacyKey(s, m.name)] = Object.assign({}, LEGACY[legacyKey(s, m.name)], { dead: false, negLevels: m.negLevels, at: Date.now() });
    saveLegacy();
    delveLog(s, 'PUB: Raise Dead on ' + m.name + ' (' + svc.gp + 'gp) — 2 negative levels');
    return { ok: true, text: m.name + ' gasps back to life — weakened by two negative levels until a Restoration.' };
  }
  return { ok: false, error: 'nothing happened' };
}

function startRun(clientId) {
  const s = sessionOf(clientId); if (!s) return { ok: false, error: 'no delve' };
  if (!s.members.has(clientId)) return { ok: false, error: 'only a player can start' };
  for (const m of s.members.values()) {   // legacy dead flag follows the hero
    const saved = LEGACY[legacyKey(s, m.name)] || {};
    if (saved.dead != null && m.dead == null) m.dead = !!saved.dead;
  }
  const ready = [...s.members.values()].filter(m => m.ready && m.character && !m.dead);
  const anyDead = [...s.members.values()].some(m => m.dead);
  if (ready.length < 1 || !ready.some(m => !m.ai)) {
    return { ok: false, error: anyDead ? 'your dead need raising first — the Swashgoblin cleric awaits payment' : 'no ready characters yet' };
  }
  // Returning heroes (same delve name + hero name) resume their earned levels.
  for (const m of ready) {
    const saved = LEGACY[legacyKey(s, m.name)];
    if (saved && saved.xp) {
      const lvl = require('./pf1core').xp.levelFromXp(saved.xp);
      if (lvl > (m.character.derived.level || 1)) characters.levelUp(m.character, lvl);
      m._legacyXp = saved.xp;
    }
  }
  s.run = partyrun.createPartyRun(ready.map(m => {
    const saved = LEGACY[legacyKey(s, m.name)] || {};
    return { clientId: m.memberId, icon: m.icon, character: m.character, ai: m.ai, negLevels: saved.negLevels || 0 };
  }));
  for (const m of ready) {
    if (!m._legacyXp) continue;
    const h = s.run.heroes.find(x => x.name === m.name);
    if (h) {
      h.xp = m._legacyXp; h.level = m.character.derived.level;
      delveLog(s, `LEGACY RESUMED: ${m.name} returns at level ${h.level} (${h.xp} XP)`);
    }
  }
  if (s.stash) {   // pub purchases ride along in the party bag
    for (const [k, q] of Object.entries(s.stash)) {
      const slot = s.run.inventory.find(x => x.key === k);
      if (slot) slot.qty += q; else s.run.inventory.push({ key: k, qty: q });
    }
    s.stash = null;
  }
  const dead = [...s.members.values()].filter(m => m.dead);
  if (dead.length) delveLog(s, 'LUGGAGE: hauling the dead — ' + dead.map(m => m.name).join(', '));
  s.phase = 'playing';
  s.startedAt = now();
  delveLog(s, `RUN STARTED: party = ${ready.map(m => m.name + ' (' + m.character.cls + (m.ai ? ', AI' : '') + ')').join(', ')}`);
  flushRunLog(s);
  return { ok: true };
}

function action(clientId, act) {
  const s = sessionOf(clientId); if (!s || s.phase !== 'playing' || !s.run) return { ok: false, error: 'no run' };
  const r = partyrun.applyAction(s.run, clientId, act);
  flushRunLog(s);
  persistProgress(s);
  if (s.run && (s.run.phase === 'retreated' || s.run.phase === 'defeated')) enterPub(s);
  return r;
}

/** AFK sweep across every live delve (server.js runs this on an interval and
 *  broadcasts when anything moved). */
function sweepAfk() {
  let changed = false;
  for (const s of sessions.values()) {
    if (s.phase !== 'playing' || !s.run) continue;
    if (partyrun.sweepAfk(s.run)) { flushRunLog(s); persistProgress(s); changed = true; }
  }
  return changed;
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
    pub: s.phase === 'pub' ? {
      gold: pubPurse(s),
      stash: s.stash || {},
      services: Object.entries(PUB_SERVICES).map(([key, v]) => ({ key, label: v.label, gp: v.gp, kind: v.kind })),
      dead: [...s.members.values()].filter(m => m.dead).map(m => m.name),
      hurt: [...s.members.values()].filter(m => (m.negLevels || 0) > 0).map(m => ({ name: m.name, negLevels: m.negLevels })),
    } : null,
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
  startRun, action, leave, sweepAfk, pubBuy, snapshotFor, sessionSnapshotFor, allSummaries,
  _reset() { sessions.clear(); clients.clear(); seq = 0; sid = 0; },
  _testInternals(clientId) { return sessionOf(clientId); },
};
