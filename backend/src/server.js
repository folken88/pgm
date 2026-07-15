/**
 * PGM v0 server — zero-dependency Node http. Serves the blind-first frontend
 * from /public and exposes a tiny JSON API. Runs are held in memory (a run is
 * a play session for v0; SQLite-backed saves + multiplayer sockets come with
 * the persistence/party subsystem). Server-authoritative state: the client
 * only sends actions and renders the snapshot + events it gets back.
 */
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

// Load a gitignored .env (KEY=VALUE) if present, BEFORE modules read process.env.
(function loadEnv() {
  try {
    const envPath = path.join(__dirname, '..', '..', '.env');
    if (!fs.existsSync(envPath)) return;
    for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*?)\s*$/);
      if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
  } catch (e) {}
})();

const game = require('./game');
const session = require('./session');
const eleven = require('./elevenlabs');
const gm = require('./gm');
const accounts = require('./accounts');
const devtools = require('./devtools');
const { VERSION, HEADLINE } = require('./version');
const { RACES, CLASSES, planCharacter } = require('./characters');

const PORT = process.env.PORT || 4173;
const PUBLIC_DIR = path.join(__dirname, '..', '..', 'public');

const runs = new Map();
let nextId = 1;

// ---- SSE: push each client its own delve detail + all-delve summaries ----
const sseClients = new Set();   // entries: { res, clientId|null }
function broadcast() {
  for (const c of sseClients) {
    try { c.res.write(`event: state\ndata: ${JSON.stringify(session.snapshotFor(c.clientId))}\n\n`); } catch (e) {}
  }
}

// Only requests originating from inside the container (loopback) — gates the
// admin/dev delve routes. External requests come via Traefik with a real IP.
function isLocal(req) {
  const a = (req.socket && req.socket.remoteAddress) || '';
  return a === '127.0.0.1' || a === '::1' || a === '::ffff:127.0.0.1';
}

const MIME = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml', '.ico': 'image/x-icon',
};

function sendJSON(res, code, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve) => {
    let data = '';
    req.on('data', (c) => { data += c; if (data.length > 1e6) req.destroy(); });
    req.on('end', () => { try { resolve(data ? JSON.parse(data) : {}); } catch { resolve({}); } });
  });
}

function serveStatic(req, res) {
  let rel = decodeURIComponent(req.url.split('?')[0]);
  if (rel === '/') rel = '/index.html';
  const filePath = path.join(PUBLIC_DIR, path.normalize(rel).replace(/^(\.\.[/\\])+/, ''));
  if (!filePath.startsWith(PUBLIC_DIR)) { res.writeHead(403); return res.end('Forbidden'); }
  fs.readFile(filePath, (err, buf) => {
    if (err) { res.writeHead(404, { 'Content-Type': 'text/plain' }); return res.end('Not found'); }
    const ext = path.extname(filePath);
    const headers = { 'Content-Type': MIME[ext] || 'application/octet-stream' };
    // Testers must always get the CURRENT client after a deploy (a cached
    // app.js froze Tobias's UI). Small files — revalidation is cheap.
    if (ext === '.html' || ext === '.js' || ext === '.css') headers['Cache-Control'] = 'no-cache';
    res.writeHead(200, headers);
    res.end(buf);
  });
}

const server = http.createServer(async (req, res) => {
  const url = req.url.split('?')[0];

  // ---- API ----
  // The build the client is talking to. Josh's patch-note emails carry this in
  // the subject line, so it must be readable from a running server.
  if ((url === '/api/version' || url === '/api/health') && req.method === 'GET') {
    return sendJSON(res, 200, { ok: true, version: VERSION, headline: HEADLINE });
  }

  if (url === '/api/meta' && req.method === 'GET') {
    return sendJSON(res, 200, {
      version: VERSION, headline: HEADLINE,
      races: RACES, classes: CLASSES, icons: session.ICONS,
      companions: require('./cast').ROSTER.map(r => ({ name: r.name, race: r.race, cls: r.cls, icon: r.icon })),
      voice: { enabled: eleven.enabled(), name: eleven.voiceName() },
    });
  }

  // GM-voice TTS: synthesize a narration line in the ElevenLabs GM voice.
  // Returns { ok, audio: <base64 mp3> } or { ok:false } (client uses browser TTS).
  if (url === '/api/tts' && req.method === 'POST') {
    const body = await readBody(req);
    const audio = await eleven.synthesize(String(body.text || ''), body.voiceId ? String(body.voiceId) : undefined);
    return sendJSON(res, 200, audio ? { ok: true, audio } : { ok: false });
  }

  // The LLM Game Master: question + live delve context -> narrated answer.
  if (url === '/api/gm' && req.method === 'POST') {
    const body = await readBody(req);
    const snap = session.sessionSnapshotFor(body.clientId);
    const r = await gm.askGM(String(body.question || '').slice(0, 400), snap);
    return sendJSON(res, 200, { ok: r.provider !== 'none', text: r.text, provider: r.provider });
  }

  // Companion chat: speak WITH a party companion (LLM roleplay + their voice).
  if (url === '/api/companion' && req.method === 'POST') {
    const body = await readBody(req);
    const snap = session.sessionSnapshotFor(body.clientId);
    const member = snap && snap.members && snap.members.find(m => m.ai && m.name.toLowerCase() === String(body.name || '').toLowerCase());
    if (!member) return sendJSON(res, 404, { ok: false, error: 'no such companion in your party' });
    const { CHARACTER_FLAVOR } = require('./dungeon-port/character_flavor');
    const flavor = CHARACTER_FLAVOR[member.name] || CHARACTER_FLAVOR[member.name.split(' ')[0]] || `${member.name}, a ${member.race} ${member.cls} adventurer.`;
    const r = await gm.askCompanion(member.name, flavor, String(body.question || '').slice(0, 400), snap);
    const voiceId = require('./cast').BY_NAME[member.name.toLowerCase()] ? require('./cast').BY_NAME[member.name.toLowerCase()].voiceId : null;
    return sendJSON(res, 200, { ok: r.provider !== 'none', text: r.text, name: member.name, voiceId });
  }

  if (url === '/api/character/plan' && req.method === 'POST') {
    const body = await readBody(req);
    const plan = planCharacter({ name: body.name, race: body.race, cls: body.cls || body.class });
    return sendJSON(res, 200, plan);
  }

  // ---- Concurrent delves (SSE per-client: your delve + all summaries) ----
  if (url === '/api/session/stream' && req.method === 'GET') {
    let clientId = null;
    try { clientId = new URL(req.url, 'http://x').searchParams.get('clientId'); } catch (e) {}
    res.writeHead(200, {
      'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache',
      'Connection': 'keep-alive', 'X-Accel-Buffering': 'no',
    });
    const entry = { res, clientId: clientId || null };
    res.write(`event: state\ndata: ${JSON.stringify(session.snapshotFor(entry.clientId))}\n\n`);
    sseClients.add(entry);
    const ping = setInterval(() => { try { res.write(': ping\n\n'); } catch (e) {} }, 25000);
    req.on('close', () => { clearInterval(ping); sseClients.delete(entry); });
    return;
  }

  function sessionResult(r, clientId) {
    return Object.assign({}, r, { snapshot: session.sessionSnapshotFor(r.clientId || clientId) });
  }

  // ── DEV BACKDOOR (DEV_BACKDOOR=1 only; never in prod compose): drive every
  // play function through the real action paths — Tobias 2026-07-12. ──
  if (url === '/api/dev/inspect' && req.method === 'GET') {
    if (!devtools.ENABLED) return sendJSON(res, 404, { error: 'unknown endpoint' });
    return sendJSON(res, 200, devtools.inspect());
  }
  if (url === '/dev' && req.method === 'GET') {
    if (!devtools.ENABLED) { res.writeHead(404); return res.end('Not found'); }
    return fs.readFile(path.join(PUBLIC_DIR, 'dev.html'), (e, buf) => {
      if (e) { res.writeHead(404); return res.end('Not found'); }
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache' });
      res.end(buf);
    });
  }
  if (url === '/api/dev/cmd' && req.method === 'POST') {
    if (!devtools.ENABLED) return sendJSON(res, 404, { error: 'unknown endpoint' });
    const body = await readBody(req);
    const r = await devtools.runCmd(body.who, body.cmd);
    broadcast();
    return sendJSON(res, 200, r);
  }

  // ── Accounts: one call signs in OR registers; /me resumes from a token ──
  if (url === '/api/auth/signin' && req.method === 'POST') {
    const body = await readBody(req);
    return sendJSON(res, 200, accounts.signIn(body.name, body.password));
  }
  if (url === '/api/auth/me' && req.method === 'POST') {
    const body = await readBody(req);
    const a = accounts.byToken(String(body.token || ''));
    if (!a) return sendJSON(res, 200, { ok: false });
    return sendJSON(res, 200, {
      ok: true, name: a.name, character: a.character || null,
      characters: a.characters || [], delves: session.delvesForAccount(a.name),
    });
  }

  if (url === '/api/session/create' && req.method === 'POST') {
    const body = await readBody(req);
    const acct = accounts.byToken(String(body.token || ''));
    const r = session.createDelve({ name: body.name, icon: body.icon, delveName: body.delveName, account: acct && acct.name });
    if (r.ok) broadcast();
    return sendJSON(res, r.ok ? 200 : 400, sessionResult(r));
  }

  if (url === '/api/session/join' && req.method === 'POST') {
    const body = await readBody(req);
    const acctJ = accounts.byToken(String(body.token || ''));
    const r = session.joinDelve(body.sessionId, { name: body.name, icon: body.icon, role: body.role, account: acctJ && acctJ.name });
    if (r.ok) broadcast();
    return sendJSON(res, r.ok ? 200 : 409, sessionResult(r));
  }

  if (url === '/api/session/character' && req.method === 'POST') {
    const body = await readBody(req);
    const r = session.setCharacter(body.clientId, { name: body.name ? String(body.name) : null, race: body.race, cls: body.cls || body.class, skills: Array.isArray(body.skills) ? body.skills : null, token: body.token ? String(body.token) : null });
    if (r.ok) broadcast();
    return sendJSON(res, r.ok ? 200 : 400, sessionResult(r, body.clientId));
  }

  if (url === '/api/session/companion' && req.method === 'POST') {
    const body = await readBody(req);
    const r = session.addCompanion(body.clientId, body.name != null ? String(body.name) : body.index);
    if (r.ok) broadcast();
    return sendJSON(res, r.ok ? 200 : 400, sessionResult(r, body.clientId));
  }

  // The Swashgoblin: buy potions/Restoration/Raise Dead between delves.
  if (url === '/api/pub/buy' && req.method === 'POST') {
    const body = await readBody(req);
    const r = session.pubBuy(body.clientId, String(body.service || ''), body.target);
    if (r.ok) broadcast();
    return sendJSON(res, r.ok ? 200 : 400, sessionResult(r, body.clientId));
  }

  // Leveling screen — resolve pending class choices (cavalier Order, …). Works in
  // the lobby (creation-time) and mid-delve; opening it auto-skips the hero's turns.
  if (url === '/api/session/level' && req.method === 'POST') {
    const body = await readBody(req);
    const r = session.levelAction(body.clientId, { type: body.action, choice: body.choice, option: body.option });
    if (r.ok) broadcast();
    return sendJSON(res, r.ok ? 200 : 400, sessionResult(r, body.clientId));
  }

  if (url === '/api/pub/sell' && req.method === 'POST') {
    const body = await readBody(req);
    const r = session.pubSell(body.clientId, String(body.item || ''));
    if (r.ok) broadcast();
    return sendJSON(res, r.ok ? 200 : 400, sessionResult(r, body.clientId));
  }

  if (url === '/api/session/start' && req.method === 'POST') {
    const body = await readBody(req);
    const r = session.startRun(body.clientId);
    if (r.ok) broadcast();
    return sendJSON(res, r.ok ? 200 : 400, sessionResult(r, body.clientId));
  }

  if (url === '/api/session/action' && req.method === 'POST') {
    const body = await readBody(req);
    const act = { type: body.action, target: body.target, item: body.item, spell: body.spell };
    const r = session.action(body.clientId, act);
    if (r.ok) broadcast();
    return sendJSON(res, r.ok ? 200 : 400, sessionResult(r, body.clientId));
  }

  if (url === '/api/session/leave' && req.method === 'POST') {
    const body = await readBody(req);
    session.leave(body.clientId);
    broadcast();
    return sendJSON(res, 200, { ok: true });
  }

  // DELETE a delve — owner only (host clientId or the host's account via token).
  if (url === '/api/session/delete' && req.method === 'POST') {
    const body = await readBody(req);
    const acct = accounts.byToken(String(body.token || ''));
    const r = session.removeDelve(body.clientId, String(body.sessionId || ''), acct && acct.name);
    if (r.ok) broadcast();
    return sendJSON(res, r.ok ? 200 : 400, r);
  }

  // ── ADMIN (dev, NO confirmation): delete/list any delve. LOCALHOST-ONLY, so
  //    only reachable from inside the container (docker exec wget 127.0.0.1) —
  //    external requests via Traefik carry a non-loopback IP and get a 404.
  if (url === '/api/admin/delves' && req.method === 'GET') {
    if (!isLocal(req)) return sendJSON(res, 404, { error: 'unknown endpoint' });
    return sendJSON(res, 200, session.adminListDelves());
  }
  if (url === '/api/admin/delve/delete' && req.method === 'POST') {
    if (!isLocal(req)) return sendJSON(res, 404, { error: 'unknown endpoint' });
    const body = await readBody(req);
    const ok = session.deleteDelve(String(body.id || ''));
    if (ok) broadcast();
    return sendJSON(res, ok ? 200 : 404, { ok });
  }

  if (url.startsWith('/api/')) return sendJSON(res, 404, { error: 'unknown endpoint' });

  // ---- static ----
  return serveStatic(req, res);
});

// Async events (LLM banter landing) push fresh state to every client.
session.setNotify(() => { try { broadcast(); } catch (e) {} });

// AFK backstop: an idle human's turn auto-attacks after AFK_MS so the party
// is never held hostage (poker parity). Sweep every 5s, push state if moved.
setInterval(() => { try { if (session.sweepAfk()) broadcast(); } catch (e) {} }, 5000).unref();

server.listen(PORT, () => {
  console.log(`[PGM v${VERSION}] listening on http://localhost:${PORT}`);
  console.log(`[PGM v${VERSION}] ${HEADLINE}`);
});

module.exports = server;
