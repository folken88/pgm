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
const accounts = require('./accounts');

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

// ── Savable/resumable delves (Tobias 2026-07-11): every live delve is written
// to data/sessions/<id>.json after each meaningful change and restored on boot.
// Sets serialize as {__set:[...]}; the run's shim is rebuilt on load.
const SESS_DIR = path.join(DATA_DIR, 'sessions');
try { fs.mkdirSync(SESS_DIR, { recursive: true }); } catch (e) {}
function sessFile(s) { return path.join(SESS_DIR, s.id + '.json'); }
function packer(k, v) {
  if (v instanceof Set) return { __set: [...v] };
  if (k === 'shim') return undefined;
  return v;
}
function unpacker(k, v) { return (v && v.__set) ? new Set(v.__set) : v; }
function saveSession(s) {
  s.touchedAt = Date.now();
  try {
    const doc = {
      id: s.id, name: s.name, phase: s.phase, host: s.host, touchedAt: s.touchedAt,
      createdAt: s.createdAt, startedAt: s.startedAt, _logSeq: s._logSeq || 0,
      stash: s.stash || null, corpses: s.corpses || null,
      members: [...s.members.values()],
      run: s.run ? Object.assign({}, s.run, { shim: undefined }) : null,
    };
    fs.writeFileSync(sessFile(s), JSON.stringify(doc, packer));
  } catch (e) { try { console.warn('[session] save failed', s.id, e.message); } catch (e2) {} }
}
function deleteSave(s) { try { fs.unlinkSync(sessFile(s)); } catch (e) {} }
function restoreSessions() {
  let files = [];
  try { files = fs.readdirSync(SESS_DIR).filter(f => f.endsWith('.json')); } catch (e) { return; }
  for (const f of files) {
    try {
      const doc = JSON.parse(fs.readFileSync(path.join(SESS_DIR, f), 'utf8'), unpacker);
      const s = {
        id: doc.id, name: doc.name, phase: doc.phase, host: doc.host, touchedAt: doc.touchedAt || Date.now(),
        createdAt: doc.createdAt, startedAt: doc.startedAt, _logSeq: doc._logSeq || 0,
        stash: doc.stash || null, corpses: doc.corpses || null,
        members: new Map(doc.members.map(m => [m.memberId, m])),
        spectators: new Map(), run: doc.run || null,
      };
      if (s.run) {
        // combatants/heroes were serialized as separate copies of the same
        // objects — re-link heroes to the combatant instances by id.
        const byId = new Map(s.run.combatants.map(c => [c.id, c]));
        s.run.heroes = s.run.heroes.map(h => byId.get(h.id) || h);
        s.run.shim = new (require('./pokerdungeon/shim').DungeonShim)(s.run);
        s.run.turnStartedAt = Date.now();   // don't AFK-fire on a freshly restored delve
      }
      const n = parseInt(String(s.id).replace(/\D/g, ''), 10) || 0;
      if (n >= sid) sid = n + 1;
      for (const m of s.members.values()) {
        const mn = parseInt(String(m.memberId).replace(/\D/g, ''), 10) || 0;
        if (mn >= seq) seq = mn + 1;
      }
      sessions.set(s.id, s);
      console.log('[session] restored delve ' + s.id + ' "' + s.name + '" (' + s.phase + ')');
    } catch (e) { try { console.warn('[session] restore failed for', f, e.message); } catch (e2) {} }
  }
}

const sessions = new Map();   // sessionId -> delve
const clients = new Map();    // clientId -> { sessionId, role }
let seq = 0, sid = 0;

function now() { return Date.now(); }
function cleanName(n) { return String(n || '').trim().slice(0, 24) || 'Someone'; }
function cleanIcon(i) { return ICONS.includes(i) ? i : ICONS[0]; }
function newClientId() { return 'c' + (++seq); }
function partySize(s) { return s.members.size; }

function createDelve({ name, icon, delveName, account }) {
  name = cleanName(name); icon = cleanIcon(icon);
  const accountId = account ? accounts.keyOf(account) : null;
  const id = 's' + (++sid);
  const s = { id, name: cleanName(delveName) !== 'Someone' && delveName ? cleanName(delveName) : name + "'s Delve",
    phase: 'lobby', host: null, members: new Map(), spectators: new Map(),
    run: null, createdAt: now(), startedAt: null };
  const clientId = newClientId();
  s.host = clientId;
  s.members.set(clientId, { memberId: clientId, clientId, name, icon, character: null, ready: false, ai: false, accountId });
  clients.set(clientId, { sessionId: id, role: 'player', memberId: clientId });
  sessions.set(id, s);
  delveLog(s, `DELVE CREATED "${s.name}" by ${name} ${icon}`);
  return { ok: true, clientId, sessionId: id };
}

function joinDelve(sessionId, { name, icon, role, account }) {
  const s = sessions.get(sessionId);
  if (!s) return { ok: false, error: 'That delve no longer exists.' };
  name = cleanName(name); icon = cleanIcon(icon);
  const accountId = account ? accounts.keyOf(account) : null;
  if (role === 'player') {
    // RESUME: a saved/live delve can be re-entered by the SAME hero name if
    // that seat is a human currently unclaimed (server restarted, tab closed).
    if (s.phase !== 'lobby') {
      const seat = [...s.members.values()].find(m => !m.ai
        && ((accountId && m.accountId === accountId) || m.name.toLowerCase() === name.toLowerCase()));
      // An ACCOUNT match is proof it's the same person returning (a reload leaves
      // a ghost client holding the seat, since clientId isn't persisted). Let them
      // back in and evict any stale client on that seat. A name-only match still
      // requires the seat to be unclaimed (don't let a stranger boot an active player).
      const byAccount = !!(seat && accountId && seat.accountId === accountId);
      const claimed = seat && [...clients.values()].some(c => c.sessionId === s.id && c.memberId === seat.memberId);
      if (seat && (byAccount || !claimed)) {
        if (claimed) {   // boot the ghost/other client holding this seat
          for (const [cid, c] of [...clients.entries()]) {
            if (c.sessionId === s.id && c.memberId === seat.memberId) clients.delete(cid);
          }
        }
        const clientId = newClientId();
        clients.set(clientId, { sessionId, role: 'player', memberId: seat.memberId });
        delveLog(s, `PLAYER RECLAIMED SEAT: ${seat.name}${claimed ? ' (evicted a stale session)' : ''}`);
        return { ok: true, clientId, sessionId, role: 'player', reclaimed: true };
      }
      return { ok: false, error: 'That delve has already set out — you can spectate. (Party members can rejoin under their own name.)', canSpectate: true, sessionId };
    }
    if (partySize(s) >= MAX_PARTY) return { ok: false, error: 'That party is full.', canSpectate: true, sessionId };
    const clientId = newClientId();
    s.members.set(clientId, { memberId: clientId, clientId, name, icon, character: null, ready: false, ai: false, accountId });
    clients.set(clientId, { sessionId, role: 'player', memberId: clientId });
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
  if (c) return sessions.get(c.sessionId) || null;
  // AUTO-REBIND after a server restart (Tobias hit this live): the browser
  // still holds its old clientId, and restored sessions still carry that id
  // as a memberId. If the seat is unclaimed, silently re-attach — the player
  // never notices the restart.
  for (const s of sessions.values()) {
    const seat = s.members.get(clientId);
    if (!seat || seat.ai) continue;
    const claimed = [...clients.values()].some(x => x.sessionId === s.id && x.memberId === clientId);
    if (claimed) continue;
    clients.set(clientId, { sessionId: s.id, role: 'player', memberId: clientId });
    delveLog(s, 'SEAT AUTO-REBOUND after restart: ' + seat.name + ' (' + clientId + ')');
    return s;
  }
  return null;
}
/** The stable in-run identity for a client (survives reclaim after resume). */
function memberIdOf(clientId) {
  const c = clients.get(clientId);
  return (c && c.memberId) || clientId;
}

function setCharacter(clientId, charInput) {
  const s = sessionOf(clientId); if (!s) return { ok: false, error: 'no delve' };
  const m = s.members.get(memberIdOf(clientId)); if (!m) return { ok: false, error: 'not a player' };
  if (s.phase !== 'lobby') return { ok: false, error: 'delve already started' };
  // The CHARACTER's name (Toby's "Lien" on the board) is distinct from the member's
  // account/login name (m.name = "toby"). Use the sent character name; fall back to
  // the account name so an old client that omits it still works.
  const charName = (charInput.name && String(charInput.name).trim()) || m.name;
  m.charName = charName;
  m.character = characters.createCharacter({ name: charName, race: charInput.race, cls: charInput.cls, skills: charInput.skills });
  // Player-chosen art token — a bare, safe filename only (no path traversal).
  if (charInput.token != null) m.token = /^[a-z0-9][a-z0-9._-]*\.webp$/i.test(charInput.token) ? charInput.token : null;
  m.ready = true;
  if (m.accountId) accounts.rememberCharacter(m.accountId, { race: charInput.race, cls: charInput.cls, charName: charName, token: m.token || null });
  saveSession(s);
  return { ok: true };
}

function addCompanion(clientId, nameOrIndex) {
  const s = sessionOf(clientId); if (!s) return { ok: false, error: 'no delve' };
  if (s.host !== memberIdOf(clientId)) return { ok: false, error: 'only the host adds companions' };
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
// Expensive-component rule (Tobias 2026-07-11): the service price is casting
// fee + the PF1 component price; BRING the component (found in the dungeon,
// carried in the stash) and you pay only the casting fee.
const PUB_SERVICES = {
  potion_clw:  { label: 'Potion of Cure Light Wounds', gp: 50,  kind: 'stash', item: 'potion_clw' },
  potion_cmw:  { label: 'Potion of Cure Moderate Wounds', gp: 300, kind: 'stash', item: 'potion_cmw' },
  restoration: { label: 'Restoration (cure negative levels)', gp: 380, withComponent: 280, component: 'diamond_dust', kind: 'restoration' },
  raisedead:   { label: 'Hire a cleric: Raise Dead', gp: 5450, withComponent: 450, component: 'diamond', kind: 'raise' },
};
/** Price after components: consume one from the stash if it covers the spell. */
function priceFor(s, svc) {
  if (svc.component && s.stash && (s.stash[svc.component] || 0) > 0) {
    return { gp: svc.withComponent, useComponent: svc.component };
  }
  return { gp: svc.gp, useComponent: null };
}
function pubKey(s) { return ('pub::' + s.name).toLowerCase(); }
function pubPurse(s) { return (LEGACY[pubKey(s)] && LEGACY[pubKey(s)].gold) || 0; }
function pubBank(s, delta) {
  const k = pubKey(s);
  LEGACY[k] = { gold: Math.max(0, pubPurse(s) + delta), at: Date.now() };
  saveLegacy();
}
// ── GRAVES (Tobias 2026-07-11): a TPK is FINAL for that delve — the delve is
// dead and the characters are LOST, unless another party later reaches the
// same depth, finds the corpses (and their loot), and pays to raise them.
const GRAVES_FILE = path.join(DATA_DIR, 'graves.json');
let GRAVES = [];
try { GRAVES = JSON.parse(fs.readFileSync(GRAVES_FILE, 'utf8')); } catch (e) {}
function saveGraves() { try { fs.writeFileSync(GRAVES_FILE, JSON.stringify(GRAVES)); } catch (e) {} }
function tpk(s) {
  const run = s.run;
  GRAVES.push({
    delve: s.name, depth: run.roomsCleared + 1, gold: run.gold || 0,
    heroes: run.heroes.filter(h => !h.ai).map(h => ({ name: h.name, level: h.level || 1, xp: h.xp || 0, negLevels: h.negLevels || 0 })),
    at: Date.now(),
  });
  saveGraves();
  for (const h of run.heroes) {
    if (h.ai) continue;
    const k = legacyKey(s, h.name);
    LEGACY[k] = Object.assign({}, LEGACY[k], { dead: true, lost: true, at: Date.now() });
  }
  saveLegacy();
  delveLog(s, 'TPK at depth ' + (run.roomsCleared + 1) + ' — the delve dies with them. Corpses + ' + (run.gold || 0) + 'gp await a braver party.');
  sessions.delete(s.id);
  deleteSave(s);
}
/** A descending party may stumble on an earlier TPK at this depth. */
function checkGraves(s) {
  const depth = s.run.roomsCleared + 1;
  const i = GRAVES.findIndex(g => g.depth === depth && g.delve !== s.name);
  if (i < 0) return;
  const g = GRAVES.splice(i, 1)[0];
  saveGraves();
  s.run.gold += g.gold;
  s.corpses = (s.corpses || []).concat(g.heroes.map(h => Object.assign({ delve: g.delve }, h)));
  const names = g.heroes.map(h => h.name).join(', ');
  s.run.log.push({ seq: ++s.run.seq, text: String.fromCodePoint(0x1FAA6) + ' Among the bones: the lost party of "' + g.delve + '" — ' + names + '. You recover their ' + g.gold + ' gold and take up the corpses. A cleric could yet raise them.', priority: 'urgent', sound: null });
  delveLog(s, 'GRAVE FOUND: recovered ' + names + ' of "' + g.delve + '" (+' + g.gold + 'gp)');
}

/** A run just ended — the party staggers back to the Swashgoblin. */
function enterPub(s) {
  if (!s.run) return;
  pubBank(s, s.run.gold || 0);
  for (const h of s.run.heroes) {
    const m = [...s.members.values()].find(x => x.name === h.name);
    if (m) { m.dead = !!h.dead; m.negLevels = h.negLevels || 0; m.pack = h.pack || m.pack || []; }
    const k = legacyKey(s, h.name);
    LEGACY[k] = Object.assign({}, LEGACY[k], { dead: !!h.dead, negLevels: h.negLevels || 0, at: Date.now() });
  }
  // Everything still in the party bag comes home to the stash — found
  // components especially ("you'd hang on to it in case you needed a raise").
  s.stash = s.stash || {};
  for (const slot of (s.run.inventory || [])) s.stash[slot.key] = (s.stash[slot.key] || 0) + slot.qty;
  saveLegacy();
  s.phase = 'pub';
  delveLog(s, 'PARTY AT THE SWASHGOBLIN: purse ' + pubPurse(s) + 'gp, dead: ' + ([...s.members.values()].filter(m => m.dead).map(m => m.name).join(', ') || 'none'));
}
/** Sell a stash item (gems/art at full value, gear at half) into the purse. */
function pubSell(clientId, itemKey) {
  const s = sessionOf(clientId); if (!s || s.phase !== 'pub') return { ok: false, error: 'you are not at the Swashgoblin' };
  if (!s.stash || !(s.stash[itemKey] > 0)) return { ok: false, error: 'nothing like that in the stash' };
  const it = require('./items').ITEM_BY_KEY[itemKey];
  if (!it || !it.value) return { ok: false, error: 'the barkeep will not buy that' };
  const price = it.type === 'valuable' ? it.value : Math.floor(it.value / 2);
  s.stash[itemKey] -= 1; if (s.stash[itemKey] <= 0) delete s.stash[itemKey];
  pubBank(s, price);
  saveSession(s);
  delveLog(s, 'PUB: sold ' + it.name + ' for ' + price + 'gp');
  return { ok: true, text: it.name + ' sold for ' + price + ' gold. Purse: ' + pubPurse(s) + '.' };
}

function pubBuy(clientId, serviceKey, targetName) {
  const s = sessionOf(clientId); if (!s || s.phase !== 'pub') return { ok: false, error: 'you are not at the Swashgoblin' };
  const svc = PUB_SERVICES[serviceKey]; if (!svc) return { ok: false, error: 'the barkeep has never heard of that' };
  const price = priceFor(s, svc);
  if (pubPurse(s) < price.gp) return { ok: false, error: 'not enough gold — the purse holds ' + pubPurse(s) + 'gp' + (svc.component && !price.useComponent ? ' (a ' + svc.component.replace('_', ' ') + ' would make it ' + svc.withComponent + 'gp)' : '') };
  const spendComponent = () => { if (price.useComponent) { s.stash[price.useComponent] -= 1; if (s.stash[price.useComponent] <= 0) delete s.stash[price.useComponent]; } };
  if (svc.kind === 'stash') {
    pubBank(s, -price.gp);
    s.stash = s.stash || {};
    s.stash[svc.item] = (s.stash[svc.item] || 0) + 1;
    delveLog(s, 'PUB: bought ' + svc.label + ' (' + svc.gp + 'gp)');
    return { ok: true, text: svc.label + ' added to the party stash.' };
  }
  // Target: named member, else auto-pick the one who needs THIS service (a
  // hurt member for restoration, a dead one for raise) so "pub buy restoration"
  // with no name just works, and the refusal reads sensibly when nobody needs it.
  let m = targetName
    ? [...s.members.values()].find(x => x.name.toLowerCase() === String(targetName).toLowerCase())
    : (svc.kind === 'restoration' ? [...s.members.values()].find(x => (x.negLevels || 0) > 0)
      : svc.kind === 'raise' ? [...s.members.values()].find(x => x.dead) : null);
  if (svc.kind === 'restoration' && !m) return { ok: false, error: 'nobody in the party carries negative levels' };
  if (!m && svc.kind !== 'raise') return { ok: false, error: 'no party member by that name' };
  if (svc.kind === 'restoration') {
    if (!(m.negLevels > 0)) return { ok: false, error: m.name + ' has no negative levels' };
    pubBank(s, -price.gp); spendComponent();
    m.negLevels = 0;
    LEGACY[legacyKey(s, m.name)] = Object.assign({}, LEGACY[legacyKey(s, m.name)], { negLevels: 0, at: Date.now() });
    saveLegacy();
    delveLog(s, 'PUB: Restoration on ' + m.name + ' (' + svc.gp + 'gp)');
    return { ok: true, text: 'The cleric chants — ' + m.name + ' stands straighter. Negative levels gone.' };
  }
  if (svc.kind === 'raise' && !m) {
    // Not one of ours — maybe a recovered corpse from a fallen delve.
    const ci = (s.corpses || []).findIndex(c2 => c2.name.toLowerCase() === String(targetName || '').toLowerCase());
    if (ci < 0) return { ok: false, error: 'no party member or recovered corpse by that name' };
    const corpse = s.corpses.splice(ci, 1)[0];
    pubBank(s, -price.gp); spendComponent();
    const k = (corpse.delve + '::' + corpse.name).toLowerCase();
    LEGACY[k] = Object.assign({}, LEGACY[k], { dead: false, lost: false, xp: corpse.xp, level: corpse.level, negLevels: (corpse.negLevels || 0) + 2, at: Date.now() });
    saveLegacy();
    saveSession(s);
    delveLog(s, 'PUB: raised recovered adventurer ' + corpse.name + ' of "' + corpse.delve + '" (' + price.gp + 'gp)');
    return { ok: true, sound: '/audio/spell_revive.mp3', text: corpse.name + ' of "' + corpse.delve + '" breathes again — free to delve anew under that banner, two negative levels the wiser.' };
  }
  if (svc.kind === 'raise') {
    if (!m.dead) return { ok: false, error: m.name + ' is not dead' };
    pubBank(s, -price.gp); spendComponent();
    m.dead = false;
    m.negLevels = (m.negLevels || 0) + 2;   // PF1 Raise Dead
    LEGACY[legacyKey(s, m.name)] = Object.assign({}, LEGACY[legacyKey(s, m.name)], { dead: false, negLevels: m.negLevels, at: Date.now() });
    saveLegacy();
    delveLog(s, 'PUB: Raise Dead on ' + m.name + ' (' + svc.gp + 'gp) — 2 negative levels');
    return { ok: true, sound: '/audio/spell_revive.mp3', text: m.name + ' draws a sudden BREATH OF LIFE — back from the dead, weakened by two negative levels until a Restoration.' };
  }
  return { ok: false, error: 'nothing happened' };
}

// ── LEVELING SCREEN (Tobias 2026-07-15) ─────────────────────────────────────
// A shop-modeled screen where a player resolves pending CLASS CHOICES (cavalier
// Order, later domains/bloodline) — at creation (lobby) or on level-up (mid-delve).
// It's SESSION-level so it works with or without a run: the choice records on the
// member's character (which the run's hero combatant shares by reference, so it
// takes effect instantly). While the screen is open IN A DELVE, the hero's turns
// auto-skip (the `leveling` flag, like `shopping`) so the party isn't blocked.
function levelHero(s, m) {
  return (s && s.run) ? s.run.heroes.find(h => h.ownerClientId === m.clientId) : null;
}
function levelPayload(m) {
  const ch = m.character || {};
  const choices = require('./pf1core').choices;
  const madeNames = Object.entries(ch.choices || {}).map(([k, v]) => {
    const o = choices.chosenOption(ch, k); return { key: k, option: v, name: o ? o.name : v };
  });
  return {
    pending: choices.pendingChoices(ch).map(cp => ({
      key: cp.key, prompt: cp.prompt,
      options: cp.options.map(o => ({ key: o.key, name: o.name, icon: o.icon || '', desc: o.desc || '', blurb: o.blurb || '' })),
    })),
    made: madeNames,
    build: { name: ch.name, cls: ch.cls, race: ch.race, level: (ch.derived && ch.derived.level) || ch.level || 1,
      hp: ch.maxHp, ac: ch.ac },
  };
}
function levelAction(clientId, act) {
  const s = sessionOf(clientId); if (!s) return { ok: false, error: 'no delve' };
  const m = s.members.get(memberIdOf(clientId)); if (!m || !m.character) return { ok: false, error: 'no character' };
  const type = act && act.type;
  if (type === 'level_open') {
    // Leveling is available OUT of combat only (Tobias): the lobby, or between
    // rooms. If a fight is on and it's your turn, it's not the moment.
    const hero = levelHero(s, m);
    if (s.run && s.run.phase === 'combat') {
      const cur = partyrun.current(s.run);
      if (cur && hero && cur.id === hero.id) return { ok: false, error: 'finish this fight — level up when the room is clear' };
    }
    if (hero) hero.leveling = true;
    return Object.assign({ ok: true }, levelPayload(m));
  }
  if (type === 'level_close') {
    const hero = levelHero(s, m); if (hero) hero.leveling = false;
    return { ok: true };
  }
  if (type === 'level_choose') {
    const choices = require('./pf1core').choices;
    if (!choices.isLegalChoice(m.character, act.choice, act.option)) return { ok: false, error: 'not a choice you can make' };
    m.character.choices = m.character.choices || {};
    m.character.choices[act.choice] = act.option;
    // An Order grants features (read live from the kit) — no stat re-derive needed.
    const opt = choices.chosenOption(m.character, act.choice);
    saveSession(s);
    return Object.assign({ ok: true, text: (opt ? opt.name : act.option) + ' chosen.' }, levelPayload(m));
  }
  return { ok: false, error: 'unknown leveling action' };
}

function startRun(clientId) {
  const s = sessionOf(clientId); if (!s) return { ok: false, error: 'no delve' };
  if (!s.members.has(memberIdOf(clientId))) return { ok: false, error: 'only a player can start' };
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
    return { clientId: m.memberId, icon: m.icon, character: m.character, ai: m.ai, negLevels: saved.negLevels || 0, token: m.token || (m.roster && m.roster.token) || null };
  }));
  // Live runs PACE their AI/enemy turns (1-2s deliberation each), streaming each
  // via SSE. Setting onUpdate flips partyrun into paced mode; without it (tests)
  // turns resolve synchronously. See partyrun.driveTurnsPaced.
  s.run.onUpdate = () => { try { maybeBanter(s); notifyChange(); } catch (e) {} };   // paced AI/enemy kills trigger combat banter too
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
  for (const m of ready) {   // personal packs ride between runs
    if (!m.pack || !m.pack.length) continue;
    const h = s.run.heroes.find(x => x.name === m.name);
    if (h) h.pack = m.pack.map(x => Object.assign({}, x));
  }
  s.run.hostId = s.host;   // the leader may use pile loot directly (self-send implied)
  const dead = [...s.members.values()].filter(m => m.dead);
  if (dead.length) delveLog(s, 'LUGGAGE: hauling the dead — ' + dead.map(m => m.name).join(', '));
  s.phase = 'playing';
  s.startedAt = now();
  saveSession(s);
  delveLog(s, `RUN STARTED: party = ${ready.map(m => m.name + ' (' + m.character.cls + (m.ai ? ', AI' : '') + ')').join(', ')}`);
  flushRunLog(s);
  return { ok: true };
}

// ── COMBAT BANTER (Tobias 2026-07-11: LLM-generated) ──
// COMBAT BANTER (poker parity, banter.js is a line pool). Scan fresh log lines
// for a quip-worthy beat (a foe slain, an ally down). At most ONE quip per round
// per delve, 60% of the time, from a random living AI companion — spoken INSTANTLY
// in their own 11labs voice (no LLM latency; the LLM stays for direct chat).
// Called from action() (human turns) AND run.onUpdate (paced AI/enemy turns) —
// the per-round throttle keeps it from double-firing.
const COMBAT_QUIPS = {
  foe: ["That's one less.", 'Down you go!', 'Next!', 'Ha — too easy.', 'Stay down.',
    "Who's next?", 'Cleared.', "That's how it's done.", 'Rest now.', 'Scratch one.',
    'Sent it packing.', 'One down — keep moving!'],
  ally: ['No — get up!', 'Someone help them!', "Hold on, I've got you!",
    "We're not losing anyone today!", 'Cover them, quickly!', 'Stay with us!',
    'Not like this — fight on!', 'Get them up, now!'],
};
function combatQuip(beatText) {
  const foe = /is slain!|is destroyed!|slain by|cut down/.test(beatText);
  const pool = foe ? COMBAT_QUIPS.foe : COMBAT_QUIPS.ally;
  return pool[Math.floor(Math.random() * pool.length)];
}
let notifyChange = () => {};
function setNotify(fn) { notifyChange = fn || (() => {}); }
function maybeBanter(s) {
  try {
    const run = s.run; if (!run) return;
    const fresh = run.log.filter(e => e.seq > (s._banterSeq || 0));
    if (!fresh.length) return;
    s._banterSeq = run.log[run.log.length - 1].seq;
    const beat = fresh.find(e => /is slain!|is destroyed!|falls!|DEAD —|bleeds out|cut down/.test(e.text));
    if (!beat || s._lastBanterRound === run.round || Math.random() > 0.6) return;
    const ais = run.heroes.filter(h => h.ai && !h.down);
    if (!ais.length) return;
    const speaker = ais[Math.floor(Math.random() * ais.length)];
    s._lastBanterRound = run.round;
    const member = [...s.members.values()].find(m => m.name === speaker.name);
    const line = combatQuip(beat.text);
    run.log.push({ seq: ++run.seq, text: '💬 ' + speaker.name + ': ' + line, priority: 'banter', sound: null, voiceId: (member && member.voiceId) || null });
    flushRunLog(s);
    // No notifyChange here — every caller broadcasts right after (action() via the
    // server, run.onUpdate via notifyChange), so the line ships with that push.
  } catch (e) {}
}

function action(clientId, act) {
  const s = sessionOf(clientId); if (!s || s.phase !== 'playing' || !s.run) return { ok: false, error: 'no run' };
  if ((act.type === 'loot_send' || act.type === 'loot_party') && memberIdOf(clientId) !== s.host) {
    return { ok: false, error: 'only the party leader divides the loot' };
  }
  const r = partyrun.applyAction(s.run, memberIdOf(clientId), act);
  flushRunLog(s);
  persistProgress(s);
  // Grave discovery fires on ANY descend into a new room — including a QUIET one
  // (all foes stealthed, phase lands on 'cleared'): the lost party's remains are
  // lying right there whether or not anything jumps you (v1.17.0).
  if (r.ok && act && act.type === 'descend' && (s.run.phase === 'initiative' || s.run.phase === 'combat' || s.run._seemsEmpty)) checkGraves(s);
  maybeBanter(s);
  if (s.run && s.run.phase === 'defeated') { tpk(s); return r; }
  if (s.run && s.run.phase === 'retreated') enterPub(s);
  saveSession(s);
  return r;
}

/** AFK sweep across every live delve (server.js runs this on an interval and
 *  broadcasts when anything moved). Also GARBAGE-COLLECTS stale saved delves:
 *  nobody connected + untouched for SESSION_TTL hours (default 72) -> gone. */
const SESSION_TTL_MS = (parseFloat(process.env.SESSION_TTL_H || '72')) * 3600 * 1000;
function sweepAfk() {
  let changed = false;
  for (const s of sessions.values()) {
    const attached = [...clients.values()].some(c => c.sessionId === s.id);
    if (!attached && Date.now() - (s.touchedAt || s.createdAt || 0) > SESSION_TTL_MS) {
      delveLog(s, 'DELVE EXPIRED (' + (SESSION_TTL_MS / 3600000) + 'h untouched) — removed');
      sessions.delete(s.id); deleteSave(s); changed = true; continue;
    }
    if (s.phase !== 'playing' || !s.run) continue;
    if (partyrun.sweepAfk(s.run)) { flushRunLog(s); persistProgress(s); maybeBanter(s); changed = true; }
  }
  return changed;
}

function leave(clientId) {
  const s = sessionOf(clientId);
  const mid = memberIdOf(clientId);
  clients.delete(clientId);
  if (!s) return;
  s.spectators.delete(clientId);
  if (s.phase === 'lobby') {
    // Lobby seats are cheap — dropping out empties them.
    s.members.delete(mid);
    const humans = [...s.members.values()].filter(m => !m.ai).length;
    if (humans === 0 && s.spectators.size === 0) { sessions.delete(s.id); deleteSave(s); }
    return;
  }
  // A live delve (playing / at the pub) is SAVED, not abandoned — the seat
  // stays and can be reclaimed by name (Tobias: delves are resumable).
  saveSession(s);
}

function memberView(m, clientId) {
  let pendingLevel = 0;
  try { pendingLevel = m.character ? require('./pf1core').choices.pendingChoices(m.character).length : 0; } catch (e) {}
  return { memberId: m.memberId, name: m.name, icon: m.icon, ready: m.ready, ai: m.ai,
    cls: m.character ? m.character.cls : null, race: m.character ? m.character.race : null,
    dead: !!m.dead, negLevels: m.negLevels || 0,
    pendingLevel,                         // >0 → the "Level up" affordance shows (a choice awaits)
    isYou: m.memberId === clientId };
}

/** Detailed view of the client's own delve. */
function sessionSnapshotFor(clientId) {
  if (!clients.get(clientId)) sessionOf(clientId);   // auto-rebind severed SSE clients too
  const c = clients.get(clientId); if (!c) return null;
  const s = sessions.get(c.sessionId); if (!s) return null;
  return {
    id: s.id, name: s.name, phase: s.phase, role: c.role,
    youAreHost: s.host === memberIdOf(clientId), yourMemberId: memberIdOf(clientId),
    counts: { party: partySize(s), maxParty: MAX_PARTY, spectators: s.spectators.size, maxSpectators: MAX_SPECTATORS },
    members: [...s.members.values()].map(m => memberView(m, memberIdOf(clientId))),
    spectators: [...s.spectators.values()].map(sp => ({ name: sp.name, icon: sp.icon, isYou: sp.clientId === clientId })),
    run: s.run ? partyrun.publicRun(s.run) : null,
    pub: s.phase === 'pub' ? {
      gold: pubPurse(s),
      stash: s.stash || {},
      stashView: Object.entries(s.stash || {}).map(([k, q]) => {
        const it = require('./items').ITEM_BY_KEY[k] || { name: k, type: 'misc' };
        const sell = it.value ? (it.type === 'valuable' ? it.value : Math.floor(it.value / 2)) : 0;
        return { key: k, name: it.name, qty: q, type: it.type, sellGp: sell };
      }),
      services: Object.entries(PUB_SERVICES).map(([key, v]) => {
        const pr2 = priceFor(s, v);
        return { key, label: v.label, gp: pr2.gp, fullGp: v.gp, component: v.component || null, usingComponent: !!pr2.useComponent, kind: v.kind };
      }),
      corpses: (s.corpses || []).map(c2 => ({ name: c2.name, delve: c2.delve, level: c2.level })),
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
      hostAccount: (s.members.get(s.host) || {}).accountId || null,   // so the owner sees a Delete button
    };
  });
}

/** Hard-remove a delve (in-memory + its saved file), detaching any clients.
 *  No auth — used by removeDelve (after an owner check) and the admin path. */
function deleteDelve(sessionId) {
  const s = sessions.get(sessionId);
  if (!s) return false;
  for (const [cid, c] of [...clients.entries()]) if (c.sessionId === sessionId) clients.delete(cid);
  if (s.run && s.run.paceTimer) { try { clearTimeout(s.run.paceTimer); } catch (e) {} }
  sessions.delete(sessionId);
  deleteSave(s);
  return true;
}

/** Owner-gated delete (the delve host, by clientId OR by account). */
function removeDelve(clientId, sessionId, account) {
  const s = sessions.get(sessionId);
  if (!s) return { ok: false, error: 'that delve no longer exists' };
  const accountId = account ? accounts.keyOf(account) : null;
  const hostMember = s.members.get(s.host);
  const isHost = memberIdOf(clientId) === s.host;
  const isOwnerAccount = !!(accountId && hostMember && hostMember.accountId === accountId);
  if (!isHost && !isOwnerAccount) return { ok: false, error: 'only the delve owner can delete it' };
  deleteDelve(sessionId);
  delveLog(s, 'DELVE DELETED by owner');
  return { ok: true };
}

/** Admin (localhost-only): list every delve for dev cleanup. */
function adminListDelves() {
  return [...sessions.values()].map(s => ({
    id: s.id, name: s.name, phase: s.phase,
    hostAccount: (s.members.get(s.host) || {}).accountId || null,
    members: [...s.members.values()].filter(m => !m.ai).map(m => m.name),
  }));
}

/** All live delves this account has a seat in (for welcome-back resume). */
function delvesForAccount(accountName) {
  const k = accounts.keyOf(accountName);
  if (!k) return [];
  const out = [];
  for (const s of sessions.values()) {
    const seat = [...s.members.values()].find(m => m.accountId === k);
    if (seat) out.push({ sessionId: s.id, delveName: s.name, phase: s.phase, heroName: seat.name });
  }
  return out;
}

/** The per-client SSE payload: your delve + everyone's summaries. */
function snapshotFor(clientId) {
  return { you: clientId ? sessionSnapshotFor(clientId) : null, sessions: allSummaries() };
}

restoreSessions();

module.exports = {
  ICONS, COMPANIONS, MAX_PARTY, MAX_SPECTATORS,
  createDelve, joinDelve, setCharacter, addCompanion, removeCompanion,
  startRun, action, leave, sweepAfk, pubBuy, pubSell, levelAction, saveSession, setNotify, delvesForAccount, snapshotFor, sessionSnapshotFor, allSummaries,
  removeDelve, deleteDelve, adminListDelves,
  _reset() { sessions.clear(); clients.clear(); seq = 0; sid = 0; },
  _testInternals(clientId) { return sessionOf(clientId); },
  // Test seam: inject a combat beat and run the banter scan; returns any quip line.
  _bantForTest(clientId, beatText) {
    const s = sessionOf(clientId); if (!s || !s.run) return null;
    s.run.log.push({ seq: ++s.run.seq, text: beatText, priority: 'urgent', sound: null });
    const before = s.run.log.length;
    maybeBanter(s);
    return s.run.log.slice(before)[0] || null;
  },
  _devSetPurse(s, gold) { LEGACY[pubKey(s)] = { gold: Math.max(0, gold), at: Date.now() }; saveLegacy(); },
};
