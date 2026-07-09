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
