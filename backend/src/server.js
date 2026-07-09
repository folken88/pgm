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
const { RACES, CLASSES, planCharacter } = require('./characters');

const PORT = process.env.PORT || 4173;
const PUBLIC_DIR = path.join(__dirname, '..', '..', 'public');

const runs = new Map();
let nextId = 1;

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
    return sendJSON(res, 200, { races: RACES, classes: CLASSES });
  }

  if (url === '/api/character/plan' && req.method === 'POST') {
    const body = await readBody(req);
    const plan = planCharacter({ name: body.name, race: body.race, cls: body.cls || body.class });
    return sendJSON(res, 200, plan);
  }

  if (url === '/api/run/start' && req.method === 'POST') {
    const body = await readBody(req);
    const state = game.startRun({
      name: body.name, race: body.race, cls: body.cls || body.class,
      skills: Array.isArray(body.skills) ? body.skills : null,
    });
    const id = String(nextId++);
    runs.set(id, state.run);
    return sendJSON(res, 200, { runId: id, snapshot: game.snapshot(state.run), events: state.events });
  }

  const m = url.match(/^\/api\/run\/([^/]+)\/action$/);
  if (m && req.method === 'POST') {
    const run = runs.get(m[1]);
    if (!run) return sendJSON(res, 404, { error: 'run not found' });
    const body = await readBody(req);
    const state = game.applyAction(run, String(body.action || ''));
    if (state.status === 'dead' || state.status === 'fled') runs.delete(m[1]);
    return sendJSON(res, 200, { snapshot: game.snapshot(run), events: state.events });
  }

  if (url.startsWith('/api/')) return sendJSON(res, 404, { error: 'unknown endpoint' });

  // ---- static ----
  return serveStatic(req, res);
});

server.listen(PORT, () => {
  console.log(`[PGM v0] listening on http://localhost:${PORT}`);
});

module.exports = server;
