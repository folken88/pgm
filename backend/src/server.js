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
const game = require('./game');
const session = require('./session');
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
    res.writeHead(200, { 'Content-Type': MIME[path.extname(filePath)] || 'application/octet-stream' });
    res.end(buf);
  });
}

const server = http.createServer(async (req, res) => {
  const url = req.url.split('?')[0];

  // ---- API ----
  if (url === '/api/meta' && req.method === 'GET') {
    return sendJSON(res, 200, {
      races: RACES, classes: CLASSES, icons: session.ICONS,
      companions: session.COMPANIONS.map((c, i) => ({ index: i, name: c.name, race: c.race, cls: c.cls, icon: c.icon })),
    });
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

  if (url === '/api/session/create' && req.method === 'POST') {
    const body = await readBody(req);
    const r = session.createDelve({ name: body.name, icon: body.icon, delveName: body.delveName });
    if (r.ok) broadcast();
    return sendJSON(res, r.ok ? 200 : 400, sessionResult(r));
  }

  if (url === '/api/session/join' && req.method === 'POST') {
    const body = await readBody(req);
    const r = session.joinDelve(body.sessionId, { name: body.name, icon: body.icon, role: body.role });
    if (r.ok) broadcast();
    return sendJSON(res, r.ok ? 200 : 409, sessionResult(r));
  }

  if (url === '/api/session/character' && req.method === 'POST') {
    const body = await readBody(req);
    const r = session.setCharacter(body.clientId, { race: body.race, cls: body.cls || body.class, skills: Array.isArray(body.skills) ? body.skills : null });
    if (r.ok) broadcast();
    return sendJSON(res, r.ok ? 200 : 400, sessionResult(r, body.clientId));
  }

  if (url === '/api/session/companion' && req.method === 'POST') {
    const body = await readBody(req);
    const r = session.addCompanion(body.clientId, body.index);
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
    const act = body.target ? { type: body.action, target: body.target } : { type: body.action };
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

  if (url.startsWith('/api/')) return sendJSON(res, 404, { error: 'unknown endpoint' });

  // ---- static ----
  return serveStatic(req, res);
});

server.listen(PORT, () => {
  console.log(`[PGM v0] listening on http://localhost:${PORT}`);
});

module.exports = server;
