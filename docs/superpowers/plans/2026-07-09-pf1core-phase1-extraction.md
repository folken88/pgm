# pf1core Phase 1 — Rules Data + Character Derivation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up the `folken88/pf1core` repo as a proven, consumable shared package containing PF1 rules DATA + character derivation, with a purity gate and smoke tests, and make PGM consume it via a vendor-and-sync script — touching zero live poker code.

**Architecture:** Copy the *unambiguously pure* files out of poker's live source (the 12 `pf1data/*` rules files that are already declared core, plus `game/character.js`) into the pf1core repo, restructured behind an `index.js` façade that mirrors poker's existing one (minus `combat`, deferred to Phase 2). pf1core gets its own `node --test` suite: a **purity gate** (fails if any core file imports persistence/sockets/poker-specific modules) and **smoke tests** (namespaces load, known data values are correct). Both consuming apps keep a plain committed copy refreshed by `scripts/sync-pf1core.sh`. Phase 1 wires that script into **PGM only**; poker's switchover is Phase 3.

**Tech Stack:** Node 24 (built-in `node:test` runner + `node:assert` — no test framework dependency), CommonJS modules (matches poker), plain git (no submodules).

**Scope boundary (what Phase 1 deliberately excludes):**
- `game/combat.js` — part poker-cosmetic (sound-pool resolvers), part pure math, and entangled with the weapon-registry seam. Deferred to **Phase 2** (combat decomposition + injectable weapon registry).
- Poker's switchover to consume vendored pf1core — deferred to **Phase 3** (gated by poker's deploy-safety rule: never rebuild while humans are at the table or in the dungeon).
- `pf1data/staples.js`, `pf1data/characterBuilds.js` — app-side (poker's dropdown/shop + authored cast). Never enter pf1core.
- `pf1data/kits.generated.js` — internal build artifact of `abilities.js`; it IS copied (abilities.js requires it) but never imported directly by consumers.

**Ground-truth source for the copy:** a clean clone of `folken88/poker`. The scratchpad clone used during planning is ephemeral — Task 1 re-clones to a stable location.

---

## File Structure

pf1core repo final layout (Phase 1):

```
pf1core/
  package.json              # name: pf1core, main: index.js, test: node --test
  index.js                  # façade: 12 rules-data namespaces + character (NO combat yet)
  pf1data/
    abilities.js  feats.js  classes.js  races.js  domains.js  monsters.js
    weapons.js  xp.js  abilityScores.js  loadouts.js  characterProfiles.js
    kits.generated.js       # internal to abilities.js
  game/
    character.js            # deriveCharacter, attackProfile (pure derivation)
  test/
    purity.test.js          # the purity gate
    smoke.test.js           # namespaces load + known-value assertions
  scripts/
    check-purity.js         # shared scanner used by purity.test.js (also runnable standalone)
  README.md                 # already exists
  .gitignore                # node_modules, .DS_Store
```

PGM repo additions (Phase 1):

```
pgm/
  scripts/sync-pf1core.sh   # clone/pull pf1core, copy tree into backend/src/pf1core/, report
  backend/src/pf1core/      # vendored copy (committed) — created by first sync run
  backend/test/pf1core-consume.test.js   # proves PGM can build a character through vendored pf1core
```

**Relative-path invariant (why this layout works unchanged in both repos):** `game/character.js` requires `../pf1data/abilityScores` and `../pf1data/classes`. `index.js` requires `./pf1data/*` and `./game/character`. When the whole tree is vendored into `pgm/backend/src/pf1core/`, every one of those relative paths still resolves correctly (façade → `./pf1data/x`, character → `../pf1data/x` from `game/`). No path rewrites are ever needed on sync. This is the entire reason the layout mirrors poker's existing `backend/src/{pf1core,pf1data,game}` arrangement.

---

## Task 1: Clone poker to a stable location and scaffold the pf1core repo

**Files:**
- Create: `pf1core/package.json`
- Create: `pf1core/.gitignore`
- Working dir: `C:\Users\Tobias Merriman\Documents\pf1core` (repo already exists, remote set)

- [ ] **Step 1: Re-clone poker to a stable scratch path (ground-truth source)**

The planning-time clone is ephemeral. Make a stable read-only reference clone.

Run:
```bash
git clone --depth 1 https://github.com/folken88/poker.git "/c/Users/Tobias Merriman/Documents/_pf1core_src/poker"
```
Expected: `Cloning into ...poker...done.` and `ls "/c/Users/Tobias Merriman/Documents/_pf1core_src/poker/backend/src/pf1data"` lists `abilities.js classes.js ... weapons.js xp.js`.

- [ ] **Step 2: Create `pf1core/package.json`**

```json
{
  "name": "pf1core",
  "version": "0.1.0",
  "description": "Pure Pathfinder 1e rules engine (data + derivation) shared by folken poker and PGM.",
  "main": "index.js",
  "scripts": {
    "test": "node --test",
    "check-purity": "node scripts/check-purity.js"
  },
  "license": "UNLICENSED",
  "private": true
}
```

- [ ] **Step 3: Create `pf1core/.gitignore`**

```gitignore
node_modules/
.DS_Store
*.log
```

- [ ] **Step 4: Verify the repo is a clean git working tree on main**

Run: `git -C "/c/Users/Tobias Merriman/Documents/pf1core" status --short && git -C "/c/Users/Tobias Merriman/Documents/pf1core" branch --show-current`
Expected: only the two new untracked files (`package.json`, `.gitignore`) shown; branch `main`.

- [ ] **Step 5: Commit**

```bash
cd "/c/Users/Tobias Merriman/Documents/pf1core"
git add package.json .gitignore
git commit -m "chore: scaffold pf1core package (node --test, no deps)"
```

---

## Task 2: Copy the pure rules-data + character files into pf1core

**Files:**
- Create: `pf1core/pf1data/{abilities,feats,classes,races,domains,monsters,weapons,xp,abilityScores,loadouts,characterProfiles,kits.generated}.js`
- Create: `pf1core/game/character.js`
- Source: `_pf1core_src/poker/backend/src/{pf1data,game}/`

- [ ] **Step 1: Copy the 12 pure pf1data files (explicit allowlist — NOT the whole dir)**

Copy only the core files. `staples.js` and `characterBuilds.js` are deliberately excluded.

Run:
```bash
SRC="/c/Users/Tobias Merriman/Documents/_pf1core_src/poker/backend/src"
DST="/c/Users/Tobias Merriman/Documents/pf1core"
mkdir -p "$DST/pf1data" "$DST/game"
for f in abilities feats classes races domains monsters weapons xp abilityScores loadouts characterProfiles kits.generated; do
  cp "$SRC/pf1data/$f.js" "$DST/pf1data/$f.js"
done
cp "$SRC/game/character.js" "$DST/game/character.js"
echo "copied:"; ls -1 "$DST/pf1data" "$DST/game"
```
Expected: `pf1data/` lists exactly the 12 files above; `game/` lists `character.js`. `staples.js` and `characterBuilds.js` are absent.

- [ ] **Step 2: Verify no copied file imports an excluded or app-side module**

This is a fast pre-check before writing the formal gate (Task 4). `character.js` should import only `../pf1data/abilityScores` and `../pf1data/classes`.

Run:
```bash
cd "/c/Users/Tobias Merriman/Documents/pf1core"
grep -rnE "require\(" pf1data game | grep -viE "require\((['\"])\./(kits\.generated|weapons|classes|abilities|abilityScores)\1\)" | grep -viE "require\((['\"])\.\./pf1data/(abilityScores|classes)\1\)"
echo "=== EXIT: any lines above referencing staples/characterBuilds/persistence/sockets = a problem ==="
```
Expected: no line references `staples`, `characterBuilds`, `persistence`, `sockets`, `discord`, `server`, or `db`.

- [ ] **Step 3: Commit**

```bash
cd "/c/Users/Tobias Merriman/Documents/pf1core"
git add pf1data game
git commit -m "feat: vendor pure PF1 rules data + character derivation from poker"
```

---

## Task 3: Write the pf1core façade (`index.js`)

**Files:**
- Create: `pf1core/index.js`

- [ ] **Step 1: Write `pf1core/index.js`**

Mirrors poker's façade namespace list, minus `combat` (Phase 2). Keeps the `profiles → characterProfiles` mapping exactly as poker's façade does.

```js
/**
 * pf1core/index.js — THE one door to the shared PF1 rules engine.
 * Pure: no persistence, no sockets, no app-specific coupling (enforced by
 * test/purity.test.js — the purity gate). Consumed by folken poker and PGM.
 *
 * Namespaces (mirrors poker's original façade):
 *   abilities, feats, classes, races, domains, monsters, weapons, xp,
 *   abilityScores, loadouts, profiles, character
 *
 * NOTE: `combat` is intentionally absent in Phase 1. game/combat.js is being
 * decomposed (pure math vs. poker-cosmetic resolvers + weapon registry) in
 * Phase 2; until then, apps keep their own combat module.
 */
module.exports = {
  abilities: require('./pf1data/abilities'),
  feats: require('./pf1data/feats'),
  classes: require('./pf1data/classes'),
  races: require('./pf1data/races'),
  domains: require('./pf1data/domains'),
  monsters: require('./pf1data/monsters'),
  weapons: require('./pf1data/weapons'),
  xp: require('./pf1data/xp'),
  abilityScores: require('./pf1data/abilityScores'),
  loadouts: require('./pf1data/loadouts'),
  profiles: require('./pf1data/characterProfiles'),
  character: require('./game/character'),
};
```

- [ ] **Step 2: Verify the façade loads without throwing**

Run: `node -e "const c = require('./index.js'); console.log(Object.keys(c).join(','))"` (from the pf1core dir)
Expected output: `abilities,feats,classes,races,domains,monsters,weapons,xp,abilityScores,loadouts,profiles,character`

- [ ] **Step 3: Commit**

```bash
cd "/c/Users/Tobias Merriman/Documents/pf1core"
git add index.js
git commit -m "feat: add pf1core index façade (12 namespaces, combat deferred to phase 2)"
```

---

## Task 4: Write the purity gate

**Files:**
- Create: `pf1core/scripts/check-purity.js`
- Create: `pf1core/test/purity.test.js`

- [ ] **Step 1: Write the failing test `pf1core/test/purity.test.js`**

```js
const { test } = require('node:test');
const assert = require('node:assert');
const { findImpurities } = require('../scripts/check-purity.js');

test('no pf1core file imports persistence, sockets, or app-side modules', () => {
  const violations = findImpurities();
  assert.deepStrictEqual(
    violations,
    [],
    'pf1core purity violated:\n' + violations.map(v => `  ${v.file}:${v.line} → ${v.match}`).join('\n')
  );
});
```

- [ ] **Step 2: Run it to verify it fails (module not yet written)**

Run: `node --test test/purity.test.js` (from pf1core dir)
Expected: FAIL — `Cannot find module '../scripts/check-purity.js'`.

- [ ] **Step 3: Write `pf1core/scripts/check-purity.js`**

```js
/**
 * Purity gate for pf1core: scans every .js under pf1data/ and game/ for a
 * require() of a forbidden module. Forbidden = anything that would couple the
 * rules engine to an app: persistence, sockets, discord, servers, databases,
 * poker-app-side files (staples, characterBuilds), or any path escaping the
 * pf1core root (../../ and up). Exported for the test; also runs standalone.
 */
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const SCAN_DIRS = ['pf1data', 'game'];

// Forbidden substrings inside a require('...') target.
const FORBIDDEN = [
  'persistence', 'sockets', 'socket.io', 'discord', 'server',
  'db', 'sqlite', 'better-sqlite3',
  'staples', 'characterBuilds',
];

function jsFiles(dir) {
  const abs = path.join(ROOT, dir);
  if (!fs.existsSync(abs)) return [];
  return fs.readdirSync(abs)
    .filter(f => f.endsWith('.js'))
    .map(f => path.join(dir, f));
}

function requireTargets(line) {
  const out = [];
  const re = /require\(\s*['"]([^'"]+)['"]\s*\)/g;
  let m;
  while ((m = re.exec(line)) !== null) out.push(m[1]);
  return out;
}

function findImpurities() {
  const violations = [];
  for (const dir of SCAN_DIRS) {
    for (const rel of jsFiles(dir)) {
      const text = fs.readFileSync(path.join(ROOT, rel), 'utf8');
      text.split(/\r?\n/).forEach((line, i) => {
        for (const target of requireTargets(line)) {
          const lower = target.toLowerCase();
          const bad =
            FORBIDDEN.some(w => lower.includes(w.toLowerCase())) ||
            target.includes('../../');          // escapes the pf1core root
          if (bad) violations.push({ file: rel, line: i + 1, match: target });
        }
      });
    }
  }
  return violations;
}

module.exports = { findImpurities };

if (require.main === module) {
  const v = findImpurities();
  if (v.length === 0) { console.log('pf1core purity: OK'); process.exit(0); }
  console.error('pf1core purity VIOLATED:');
  for (const x of v) console.error(`  ${x.file}:${x.line} → ${x.match}`);
  process.exit(1);
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `node --test test/purity.test.js` (from pf1core dir)
Expected: PASS — `tests 1 / pass 1 / fail 0`. (If it FAILS, a forbidden import slipped in during the copy — stop and investigate; do not weaken the FORBIDDEN list to make it green.)

- [ ] **Step 5: Verify the gate actually catches a violation (guard against a no-op gate)**

Temporarily prove the gate bites, then revert.
Run:
```bash
cd "/c/Users/Tobias Merriman/Documents/pf1core"
printf "\nconst _x = require('../persistence/db');\n" >> game/character.js
node --test test/purity.test.js; echo "exit=$?"
git checkout -- game/character.js
```
Expected: the run FAILS (`exit=1`) and the failure message names `game/character.js` → `../persistence/db`; after `git checkout`, `node --test test/purity.test.js` passes again.

- [ ] **Step 6: Commit**

```bash
cd "/c/Users/Tobias Merriman/Documents/pf1core"
git add scripts/check-purity.js test/purity.test.js
git commit -m "test: add pf1core purity gate (forbids app-side/persistence/socket imports)"
```

---

## Task 5: Write smoke tests (namespaces load + known-value assertions)

**Files:**
- Create: `pf1core/test/smoke.test.js`

- [ ] **Step 1: Write the failing test `pf1core/test/smoke.test.js`**

Uses only facts confirmed from the source: the 12 façade keys; `classes.js` exports `babFor`, `saveFor`, `DEFAULT_CLASS`; `character.js` exports `deriveCharacter`, `attackProfile`; `weapons.js` exports `WEAPON_BY_NAME` with real PF1 stat rows (Bastard Sword = 1d10/19-20, Battle Axe = ×3 crit).

```js
const { test } = require('node:test');
const assert = require('node:assert');
const pf1 = require('../index.js');

const EXPECTED_NAMESPACES = [
  'abilities', 'feats', 'classes', 'races', 'domains', 'monsters',
  'weapons', 'xp', 'abilityScores', 'loadouts', 'profiles', 'character',
];

test('façade exposes all Phase-1 namespaces', () => {
  for (const ns of EXPECTED_NAMESPACES) {
    assert.ok(pf1[ns], `missing namespace: ${ns}`);
  }
  assert.ok(!('combat' in pf1), 'combat must not be exported in Phase 1');
});

test('classes namespace exposes its core API', () => {
  assert.strictEqual(typeof pf1.classes.babFor, 'function');
  assert.strictEqual(typeof pf1.classes.saveFor, 'function');
  assert.ok(pf1.classes.DEFAULT_CLASS, 'DEFAULT_CLASS should be set');
});

test('character namespace exposes the derivation engine', () => {
  assert.strictEqual(typeof pf1.character.deriveCharacter, 'function');
  assert.strictEqual(typeof pf1.character.attackProfile, 'function');
});

test('weapons namespace carries correct PF1 stat rows', () => {
  const byName = pf1.weapons.WEAPON_BY_NAME;
  assert.ok(byName, 'WEAPON_BY_NAME should exist');
  const bastard = byName['bastard sword'];
  assert.ok(bastard, 'bastard sword should be present');
  assert.strictEqual(bastard.dmgDie, 10, 'bastard sword is 1d10');
  assert.strictEqual(bastard.crit, 19, 'bastard sword threatens on 19-20');
  const axe = byName['battle axe'];
  assert.ok(axe, 'battle axe should be present');
  assert.strictEqual(axe.mult, 3, 'battle axe is a ×3 crit weapon');
});
```

- [ ] **Step 2: Run it to verify it passes (the code already exists — this validates the copy, not new code)**

Run: `node --test test/smoke.test.js` (from pf1core dir)
Expected: PASS — 4 tests pass. If `WEAPON_BY_NAME` keys aren't lowercased as assumed, the failure message will show it; fix the test's key casing to match the actual data (inspect with `node -e "console.log(Object.keys(require('./pf1data/weapons').WEAPON_BY_NAME).slice(0,3))"`), do NOT change the source data.

- [ ] **Step 3: Run the full suite**

Run: `node --test` (from pf1core dir)
Expected: PASS — both `purity.test.js` and `smoke.test.js` green; `tests 5 / pass 5 / fail 0`.

- [ ] **Step 4: Commit**

```bash
cd "/c/Users/Tobias Merriman/Documents/pf1core"
git add test/smoke.test.js
git commit -m "test: add pf1core smoke tests (namespaces + known weapon stat rows)"
```

- [ ] **Step 5: Push pf1core**

```bash
cd "/c/Users/Tobias Merriman/Documents/pf1core"
git push -u origin main
```
Expected: push succeeds; `folken88/pf1core` now populated. (If the push prompts for credentials / hits the known Windows git-credential friction, use the same workaround documented in the `poker-deploy-ops` memory.)

---

## Task 6: Write PGM's sync script

**Files:**
- Create: `pgm/scripts/sync-pf1core.sh`

- [ ] **Step 1: Write `pgm/scripts/sync-pf1core.sh`**

Clones-or-pulls pf1core into a sibling cache, then copies the shared tree (index.js, pf1data/, game/) into PGM's `backend/src/pf1core/`. Idempotent; leaves the vendored copy staged for the caller to commit.

```bash
#!/usr/bin/env bash
# Vendor the shared pf1core rules engine into PGM.
# Usage: scripts/sync-pf1core.sh
# Fixing a rules bug: fix in the pf1core repo -> push -> run this -> commit here.
set -euo pipefail

PGM_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CACHE="${PF1CORE_CACHE:-$PGM_ROOT/../_pf1core_cache}"
REPO="https://github.com/folken88/pf1core.git"
DEST="$PGM_ROOT/backend/src/pf1core"

echo "[sync-pf1core] cache: $CACHE"
if [ -d "$CACHE/.git" ]; then
  git -C "$CACHE" fetch --depth 1 origin main
  git -C "$CACHE" reset --hard origin/main
else
  git clone --depth 1 "$REPO" "$CACHE"
fi

echo "[sync-pf1core] vendoring into: $DEST"
rm -rf "$DEST"
mkdir -p "$DEST/pf1data" "$DEST/game"
cp "$CACHE/index.js" "$DEST/index.js"
cp "$CACHE"/pf1data/*.js "$DEST/pf1data/"
cp "$CACHE"/game/*.js "$DEST/game/"

REV="$(git -C "$CACHE" rev-parse --short HEAD)"
echo "[sync-pf1core] vendored pf1core @ $REV"
echo "[sync-pf1core] review with 'git status' and commit the vendored copy."
```

- [ ] **Step 2: Make it executable and run it**

Run:
```bash
cd "/c/Users/Tobias Merriman/Documents/pgm"
chmod +x scripts/sync-pf1core.sh
bash scripts/sync-pf1core.sh
```
Expected: prints `vendored pf1core @ <hash>`; `ls backend/src/pf1core backend/src/pf1core/pf1data backend/src/pf1core/game` shows `index.js`, the 12 data files, and `character.js`.

- [ ] **Step 3: Verify the vendored copy loads inside PGM's tree**

Run: `node -e "const c=require('./backend/src/pf1core'); console.log(Object.keys(c).length, 'namespaces')"` (from pgm dir)
Expected: `12 namespaces`.

- [ ] **Step 4: Commit (script + vendored copy together)**

```bash
cd "/c/Users/Tobias Merriman/Documents/pgm"
git add scripts/sync-pf1core.sh backend/src/pf1core
git commit -m "feat: add pf1core sync script and vendor the rules engine into PGM"
```

---

## Task 7: Prove PGM can build a character through vendored pf1core

**Files:**
- Create: `pgm/backend/test/pf1core-consume.test.js`
- Modify: `pgm/package.json` (add a `test` script if none exists)

- [ ] **Step 1: Ensure PGM has a package.json with a test script**

If `pgm/package.json` does not exist, create it:
```json
{
  "name": "pgm",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "test": "node --test"
  }
}
```
If it already exists, add `"test": "node --test"` to its `scripts` block (leave all other fields unchanged).

- [ ] **Step 2: Write the failing test `pgm/backend/test/pf1core-consume.test.js`**

Proves the vendored engine is usable from PGM's own tree — the whole point of Phase 1. Asserts the façade resolves and the derivation engine is callable through the vendored path.

```js
const { test } = require('node:test');
const assert = require('node:assert');
const pf1 = require('../src/pf1core');

test('PGM can load the vendored pf1core façade', () => {
  assert.ok(pf1.character, 'character namespace present');
  assert.ok(pf1.classes, 'classes namespace present');
  assert.strictEqual(typeof pf1.character.deriveCharacter, 'function');
});

test('PGM sees standard PF1 weapon data (no poker signature weapons)', () => {
  const byName = pf1.weapons.WEAPON_BY_NAME;
  assert.ok(byName['longsword'], 'longsword is a standard PF1 weapon');
  // Signature/custom weapons live only in poker's app-side staples.js and must
  // NOT have been vendored — PGM parties start with basic found gear.
  const keys = Object.keys(byName).join('|').toLowerCase();
  assert.ok(!keys.includes("bastard's blade"), 'no poker signature weapons in PGM');
});
```

- [ ] **Step 3: Run it to verify it passes**

Run: `node --test backend/test/pf1core-consume.test.js` (from pgm dir)
Expected: PASS — 2 tests. If step-2's `require('../src/pf1core')` path is wrong for the eventual backend layout, adjust the relative path to match where `backend/src/pf1core` sits; the assertion content stays the same.

- [ ] **Step 4: Commit**

```bash
cd "/c/Users/Tobias Merriman/Documents/pgm"
git add backend/test/pf1core-consume.test.js package.json
git commit -m "test: prove PGM builds characters through vendored pf1core"
```

- [ ] **Step 5: Push PGM**

```bash
cd "/c/Users/Tobias Merriman/Documents/pgm"
git push -u origin main
```
Expected: push succeeds.

---

## Task 8: Update docs and memory to reflect Phase 1 done

**Files:**
- Modify: `pgm/PRIMER.md` (mark the pf1core extraction status)
- Modify: `pf1core/README.md:43` (the "not yet populated" status line)

- [ ] **Step 1: Update `pf1core/README.md` status line**

Find the line beginning `**Status (2026-07-09): repo created, not yet populated.**` and replace that sentence with:
```markdown
**Status: Phase 1 populated (2026-07-09).** Rules DATA (12 pf1data namespaces) +
`character` derivation are extracted, behind `index.js`, with a passing purity
gate and smoke tests. PGM consumes it via vendor-and-sync. STILL PENDING:
`combat` (Phase 2 — decompose pure math from poker's cosmetic resolvers + build
the injectable weapon registry) and poker's own switchover to the vendored copy
(Phase 3, deploy-safety gated).
```

- [ ] **Step 2: Update `pgm/PRIMER.md` "Suggested first steps" section**

Under the numbered first-steps list, mark step 2 (the pf1core extraction) status by appending this line after that list item:
```markdown
   > **DONE (Phase 1, 2026-07-09):** data + character derivation extracted and
   > proven; PGM consumes vendored pf1core. Remaining: combat (Phase 2), poker
   > switchover (Phase 3). See `docs/superpowers/plans/2026-07-09-pf1core-phase1-extraction.md`.
```

- [ ] **Step 3: Commit and push docs**

```bash
cd "/c/Users/Tobias Merriman/Documents/pgm"
git add PRIMER.md
git commit -m "docs: mark pf1core Phase 1 (data + derivation) complete"
git push
cd "/c/Users/Tobias Merriman/Documents/pf1core"
git add README.md
git commit -m "docs: update status to Phase 1 populated"
git push
```

- [ ] **Step 4: Update the `pgm-app` memory entry**

Edit `C:\Users\Tobias Merriman\.claude\projects\C--Users-Tobias-Merriman\memory\pgm-app.md`: change the status line from "kickoff done, implementation not started" to note Phase 1 pf1core (data + character derivation) is extracted, proven, and consumed by PGM; Phase 2 = combat.js decomposition + weapon registry; Phase 3 = poker switchover (deploy-safety gated). Keep it to a few edited lines — do not rewrite the whole file.

---

## Definition of Done (Phase 1)

- `folken88/pf1core` is populated: `index.js` + 12 pf1data files + `game/character.js`, pushed.
- `node --test` in pf1core is green (purity gate + smoke tests, 5 tests), and the purity gate is proven to bite (Task 4 Step 5).
- PGM has `scripts/sync-pf1core.sh`, a committed vendored copy under `backend/src/pf1core/`, and a passing consume-test — all pushed.
- Poker's live code is **untouched** and still works exactly as before (nothing in this plan modifies the poker repo).
- Docs + memory updated to point Phase 2/3 at the right next work.

---

## Self-Review notes

- **Spec coverage:** This plan implements the "pf1core sharing mechanism (vendor-and-sync)" and "Reused wholesale: pf1core" sections of the design spec, for the data+derivation subset. `combat`, world-gen, character-creation UI, LLM layer, and deploy are explicitly out of scope for this plan (separate plans).
- **The weapon-seam decision (registry + hook, poker-only signature weapons)** is honored structurally here by *excluding* `staples.js`/`combat.js` from Phase 1 — the seam is resolved in Phase 2, not papered over. Phase 1's consume-test asserts PGM sees no signature weapons.
- **Type/name consistency:** namespace list is identical between poker's façade (minus `combat`), pf1core `index.js`, the smoke test's `EXPECTED_NAMESPACES`, and the README. `profiles` maps to `characterProfiles.js` in all places.
- **No placeholders:** every code step contains complete file content or an exact command with expected output. The two "adjust if the path/casing differs" notes (Task 5 Step 2, Task 7 Step 3) are verification-diagnosis guidance, not deferred implementation.
