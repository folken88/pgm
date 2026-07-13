#!/usr/bin/env bash
# =============================================================================
# sync-from-poker.sh  —  PGM <- poker shared-PF1 pipeline
# -----------------------------------------------------------------------------
# Poker is the source of truth for PF1 CONTENT (bestiary) and BEHAVIOR (the
# dungeon combat mixins). PGM adapts the mixins through pokerdungeon/shim.js.
# Run this AFTER poker ships a PF1 improvement to bring PGM current.
#
# Scope (deliberately minimal + safe):
#   * pf1data/monsters.js  -> pf1core/pf1data/monsters.js   (bestiary DATA)
#   * game/dungeon/*.js     -> pokerdungeon/game/dungeon/*   (combat mixins)
#   * new tarkov_*.mp3       -> public/audio/                 (gun-angel SFX)
# NOT synced (would clobber PGM's independently-developed rules engine, or PGM
# has no consumer): pf1data/{classes,feats,abilities,...}, staples/weapons,
# poker-style monster art. Mechanics living in poker's Dungeon.js HOST
# (precision bleed, Ton Bokiri frenzy) belong in shim.js — port separately.
#
# Safety: backs up every target, rebuilds PGM, verifies modules load + the app
# boots, and AUTO-REVERTS (restore + rebuild) if verification fails.
# =============================================================================
set -e
POKER=/mnt/fast/apps/stacks/poker/backend/src
POKERPUB=/mnt/fast/apps/stacks/poker/public
PGMROOT=/mnt/fast/apps/stacks/pgm
PGM=$PGMROOT/backend/src
PGMPUB=$PGMROOT/public
BK=$PGMROOT/.sync-backup
OWNER=$(stat -c '%U:%G' "$PGM/pf1core/pf1data/monsters.js")
# Only mixins present in BOTH trees. PGM keeps makeenemy/swing split out and handles
# loot/serialize elsewhere, so we sync the 4 shared behavior files (they carry the new
# mechanics: enemy Blaze of Glory, ranged-attack SFX, flyers-don't-wrestle, flavor
# summons, Ton Bokiri rage). Adding a brand-new mixin would need shim wiring — skip.
MIXINS="enemyAI abilities heroAI summons"
SOUNDS="tarkov_mp153_shotgun.mp3 tarkov_revolver_357_shot.mp3"

rebuild() { cd "$PGMROOT" && docker compose build >/dev/null 2>&1 && docker compose up -d --force-recreate >/dev/null 2>&1; sleep 6; }

echo "===== 1) BACK UP current PGM targets ====="
rm -rf "$BK"; mkdir -p "$BK/dungeon"
cp "$PGM/pf1core/pf1data/monsters.js" "$BK/monsters.js"
for m in $MIXINS; do cp "$PGM/pokerdungeon/game/dungeon/$m.js" "$BK/dungeon/$m.js"; done
echo "backed up monsters.js + $MIXINS -> $BK"

echo "===== 2) SYNC data + mixins + audio ====="
cp "$POKER/pf1data/monsters.js" "$PGM/pf1core/pf1data/monsters.js"
for m in $MIXINS; do cp "$POKER/game/dungeon/$m.js" "$PGM/pokerdungeon/game/dungeon/$m.js"; done
for s in $SOUNDS; do cp "$POKERPUB/audio/$s" "$PGMPUB/audio/$s"; done
chown "$OWNER" "$PGM/pf1core/pf1data/monsters.js" "$PGM/pokerdungeon/game/dungeon/"*.js "$PGMPUB/audio/"tarkov_*.mp3
if command -v node >/dev/null 2>&1; then
  echo "copied. host syntax check:"
  for f in "$PGM/pf1core/pf1data/monsters.js" $(for m in $MIXINS; do echo "$PGM/pokerdungeon/game/dungeon/$m.js"; done); do
    node --check "$f" || { echo "SYNTAX FAIL $f — reverting"; cp "$BK/monsters.js" "$PGM/pf1core/pf1data/monsters.js"; for m in $MIXINS; do cp "$BK/dungeon/$m.js" "$PGM/pokerdungeon/game/dungeon/$m.js"; done; exit 2; }
  done
  echo "all syntax OK"
else
  echo "copied. (host node absent — syntax verified by the post-rebuild require-smoke)"
fi

echo "===== 3) REBUILD PGM image + recreate ====="
rebuild
PORT=$(docker inspect pgm --format '{{range $p,$c := .NetworkSettings.Ports}}{{range $c}}{{.HostPort}} {{end}}{{end}}' 2>/dev/null | awk '{print $1}')
echo "pgm port: ${PORT:-unknown}"

echo "===== 4) VERIFY: modules load + content present + app boots ====="
set +e
LOAD=$(docker exec pgm node -e "
let ok=true;
for (const m of ['./pf1core','./pokerdungeon/shim','./pf1core/pf1data/monsters','./pokerdungeon/game/dungeon/enemyAI','./pokerdungeon/game/dungeon/abilities','./pokerdungeon/game/dungeon/summons','./partyrun']) {
  try { require('/app/backend/src/'+m); } catch(e){ ok=false; console.log('LOADFAIL '+m+' :: '+e.message.split('\n')[0]); }
}
const {MON}=require('/app/backend/src/pf1core/pf1data/monsters');
if(!MON.master_uke||!MON.parnoneryx||!MON.chen){ok=false;console.log('CONTENT MISSING');}
console.log(ok?'VERIFY_OK':'VERIFY_FAIL');
" 2>&1)
echo "$LOAD"
BOOT="skip"; [ -n "$PORT" ] && BOOT=$(curl -s -o /dev/null -w '%{http_code}' "http://localhost:$PORT/" 2>/dev/null)
echo "boot http: $BOOT"
set -e

if echo "$LOAD" | grep -q VERIFY_OK && { [ "$BOOT" = "skip" ] || [ "$BOOT" -ge 200 ] 2>/dev/null && [ "$BOOT" -lt 500 ] 2>/dev/null; }; then
  echo "===== VERIFY PASSED ====="
  echo "SYNC_OK"
else
  echo "===== VERIFY FAILED — AUTO-REVERTING ====="
  cp "$BK/monsters.js" "$PGM/pf1core/pf1data/monsters.js"
  for m in $MIXINS; do cp "$BK/dungeon/$m.js" "$PGM/pokerdungeon/game/dungeon/$m.js"; done
  chown "$OWNER" "$PGM/pf1core/pf1data/monsters.js" "$PGM/pokerdungeon/game/dungeon/"*.js
  rebuild
  echo "REVERTED to backup + rebuilt. PGM restored. SYNC_FAILED"
  exit 1
fi
