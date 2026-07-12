/**
 * Test isolation preload (via `node --test --import ./backend/test/_isolate.js`).
 * node:test runs each test FILE in its own process; without this they all
 * share the real data/ dir and race on legacy.json / sessions/ (lost-update:
 * one process's saveLegacy clobbers another's entry between write and read).
 * Give every test process its own throwaway DATA_DIR before any module loads.
 */
const os = require('node:os');
const path = require('node:path');
const fs = require('node:fs');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pgm-test-'));
process.env.DATA_DIR = dir;
process.env.DEV_BACKDOOR = '1';   // tests may exercise the dev console

process.on('exit', () => { try { fs.rmSync(dir, { recursive: true, force: true }); } catch (e) {} });
