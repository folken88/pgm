/**
 * PGM dungeon blind layer — POKER'S ACTUAL CODE, transplanted.
 * =====================================================================
 * Josh's disorientation came from PGM re-implementing poker's blind dungeon by
 * hand, so the keymap and narration never matched. This file ends that: it is
 * poker's real dungeon keydown handler (client.js:2028-2895) and its narration
 * (blindMode.js onDungeonState + helpers), copied VERBATIM, driven by PGM's
 * snapshot through a thin adapter. Same keys, same play-by-play, because it IS
 * poker's code.
 *
 * The seam (all of it):
 *   - `state.dungeon` — PGM's publicRun, reshaped to poker's dungeon-state by
 *     `setDungeonState()` (called from app.js on every SSE push).
 *   - `state.me.player_id` — this client's id.
 *   - `dungeonAction(kind, payload)` — poker's socket verbs → PGM's
 *     POST /api/session/action ({attack, cast, descend, cantrip, retreat, ...}).
 *   - speak()/earcon()/readEnemies() — PGM's BlindMode engine.
 * Poker's DOM (`renderDungeon`) is intentionally NOT ported — Josh plays by ear;
 * the sighted UI stays PGM's own.
 */
(function () {
  'use strict';
  var BM = window.BlindMode;
  if (!BM) return;

  // ---- shimmed globals poker's transplanted code reads ------------------------
  var state = { dungeon: null, me: { player_id: null } };
  function speak(t, prio, phase) { if (t) BM.speak(t, prio || 'event'); }   // phase (segmented-S) is a no-op here
  function earcon(kind) { try { BM.earcon ? BM.earcon(kind) : _beep(kind); } catch (_) {} }
  function _beep(kind) {
    try {
      var AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
      var ctx = _beep._c || (_beep._c = new AC());
      var seq = kind === 'turn' ? [660, 780, 920] : kind === 'clear' ? [523, 659, 784] : [520];
      seq.forEach(function (f, i) {
        var o = ctx.createOscillator(), g = ctx.createGain();
        o.frequency.value = f; o.connect(g); g.connect(ctx.destination);
        var t0 = ctx.currentTime + i * 0.08; g.gain.setValueAtTime(0.0001, t0);
        g.gain.exponentialRampToValueAtTime(0.12, t0 + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.07);
        o.start(t0); o.stop(t0 + 0.08);
      });
    } catch (_) {}
  }

  // poker's `dungeonAction(kind, payload)` → PGM action verbs. This is the whole
  // transport adapter: poker's socket kinds map onto PGM's /api/session/action.
  function dungeonAction(kind, payload) {
    payload = payload || {};
    var a = null;
    if (kind === 'attack') a = { type: 'attack', target: payload.targetUid };
    else if (kind === 'ability') a = { type: 'cast', spell: payload.slot, target: payload.targetUid, ally: payload.allyUid, mode: payload.mode };
    else if (kind === 'door') a = { type: 'descend' };
    else if (kind === 'cantrip') a = { type: 'cantrip' };
    else if (kind === 'bail') a = { type: 'retreat' };
    else if (kind === 'pass') a = { type: 'pass' };
    else { speak('That is not available in this dungeon yet.', 'urgent'); return; }   // loadout/domains/metamagic/lootroll/hock: PGM has no equivalent
    if (window.__pgmAction) window.__pgmAction(a);
  }
  // The sub-menu senders round-trip to poker's server for the loadout model; PGM
  // has no such endpoints yet, so they degrade to a spoken notice.
  var socket = { emit: function (evt, msg, cb) { if (typeof cb === 'function') cb({ ok: false, error: 'not available yet' }); } };
  function sbpickSend(_m, cb) { if (cb) cb({ pool: [], caps: {}, prepared: {}, known: [] }); }
  function dmpickSend(_m, cb) { if (cb) cb({ domains: [], picks: [], max: 0 }); }
  function emitAim() {}
  function bailToSpectate() { speak('Spectate is not available here yet.', 'urgent'); }
  function returnFromDungeon() { if (window.__pgmLeave) window.__pgmLeave(); }
  function cancelDungeon() { if (window.__pgmLeave) window.__pgmLeave(); }
  function renderDungeon() {}   // PGM re-renders from the SSE snapshot; no DOM to repaint here
  var $ = function (sel) { return document.querySelector(sel); };
  var _recruitOpen = false, _bankDollOpen = false, _sbpModel = null, _dmpModel = null;

  // ---- keymap sub-mode state (poker's module-scope vars) ----------------------
  var _blindHelp = false, _dunCancelArm = 0, _dunSbp = null, _dunDmp = false, _dunProg = null,
      _dunMmMenu = null, _dunSbMode = false, _dunSbLevel = null, _dunSbIdx = -1, _dunImbuedMode = false,
      _dunAllyPick = null, _dunDispelPick = null, _dunModePick = null, _dunSessionMode = false,
      _dunSessionIdx = 0, _dunEnemyMode = false, _dunEnemyIdx = -1, _dunTarget = null,
      _dunQueuedAttack = null, _spellbookOpen = false, _dungeonSel = [];

  // ============================ NARRATION ====================================
  // Poker's blindMode.js dungeon section (onDungeonState + helpers), verbatim.
  var _dun = { depth: -1, logT: 0, turnKey: '', status: '', lootKey: '' };
  function _stripGlyphs(s) {
    try { return String(s || '').replace(/\[[^\]]*\]/g, '').replace(/\p{Extended_Pictographic}/gu, '').replace(/\s+/g, ' ').trim(); }
    catch (_) { return String(s || '').replace(/\[[^\]]*\]/g, '').trim(); }
  }
  function _crVal(cr) { var s = String(cr || 0); if (s.indexOf('/') >= 0) { var p = s.split('/'); return (+p[0] || 0) / (+p[1] || 1); } return +s || 0; }
  function _dunEnemyPhrase(d) {
    var alive = (d.enemies || []).filter(function (e) { return e.alive; }).sort(function (a, b) { return _crVal(b.cr) - _crVal(a.cr); });
    if (!alive.length) return 'No enemies.';
    var fly = function (e) { return e.flying ? ', flying' : ''; };
    var hp = function (e) { return Math.round(100 * Math.max(0, e.hp | 0) / (e.maxHp || 1)) + '%'; };
    var debs = function (e) { var ds = (e.conditions || []).map(function (c) { return c.label; }).filter(Boolean); return ds.length ? ', ' + ds.join(', ') : ''; };
    if (alive.length === 1) return 'Enemy: ' + alive[0].name + ', ' + hp(alive[0]) + fly(alive[0]) + debs(alive[0]) + '.';
    return alive.length + ' enemies, deadliest first. ' + alive.map(function (e, i) { return (i + 1) + ': ' + e.name + ', ' + hp(e) + fly(e) + debs(e); }).join('. ') + '.';
  }
  function _meId() { return state.me && state.me.player_id; }
  function _dunActionsHint(d) {
    var meId = _meId();
    var kit = ((d.party || []).find(function (m) { return m.playerId === meId; }) || {}).kit;
    var names = kit ? (kit.abilities || []).map(function (a) { return a && a.name; }).filter(Boolean) : [];
    var atk = (kit && kit.atwill && kit.atwill.name) || 'attack';
    if (names.length) return 'Say ' + atk.toLowerCase() + ', ' + names.join(', ') + ', or bail. Add a number to target, like ' + atk.toLowerCase() + ' two.';
    return 'Say attack, ability one, ability two, or bail. Add a number to target.';
  }
  function _dunNarrateFull(d) {
    var me = (d.party || []).find(function (m) { return m.playerId === _meId(); }) || {};
    var bits = ['Depth ' + d.depth + '.', 'You have ' + me.hp + ' of ' + me.maxHp + ' hit points.', _dunEnemyPhrase(d), d.runGold + ' gold this run.'];
    if (d.status === 'exploring') bits.push('Say open to descend, or bail to leave.');
    else if (d.status === 'combat') bits.push(_dunActionsHint(d));
    speak(bits.join(' '), 'urgent');
  }
  function readEnemies(d) { speak(_dunEnemyPhrase(d || state.dungeon), 'urgent'); }

  function onDungeonState(st) {
    if (!BM.isOn() || !st) return;
    var meId = _meId();
    if (st.depth !== _dun.depth) {
      _dun.depth = st.depth;
      if (st.depth === 0) speak('You enter the dungeon. Say open to descend, or bail to leave.', 'event');
      else { var ne = (st.enemies || []).filter(function (e) { return e.alive; }).length; speak('Room ' + st.depth + '. ' + ne + ' ' + (ne === 1 ? 'enemy' : 'enemies') + '. Press E to inspect them.', 'event'); }
    }
    if (Array.isArray(st.log) && st.log.length) {
      var fresh = st.log.filter(function (e) { return e.t > _dun.logT; });
      if (fresh.length) {
        _dun.logT = Math.max.apply(null, [_dun.logT].concat(st.log.map(function (e) { return e.t; })));
        var said = function (t, ph) { if (t) speak(t, 'event', ph || null); };
        var enemyCount = (st.enemies || []).filter(function (e) { return e.alive; }).length;
        var meM = (st.party || []).find(function (m) { return m.playerId === meId; }) || {};
        var myNick = String(meM.trueNick || meM.nickname || '').toLowerCase();
        var live = fresh.filter(function (e) { return !e.voiced; });
        if (enemyCount >= 6 && live.length > 6) {
          var isMine = function (e) { return e.side !== 'enemy' || (myNick && _stripGlyphs(e.text).toLowerCase().indexOf(myNick) >= 0); };
          var mine = live.filter(isMine);
          var enemyTally = live.length - mine.length;
          var show = mine.length > 8 ? mine.slice(-8) : mine;
          if (show.length < mine.length) said('Skipping ' + (mine.length - show.length) + ' earlier ally lines.', 'combat');
          show.forEach(function (e) { said(_stripGlyphs(e.text), e.phase || 'combat'); });
          if (enemyTally) said('Plus ' + enemyTally + ' more enemy action' + (enemyTally > 1 ? 's' : '') + ' — press E to inspect the foes.', 'combat');
        } else {
          var isIdleNoop = function (e) { return e.side === 'enemy' && /does nothing|loses its turn|struggles in vain/i.test(String(e.text || '')); };
          var active = live.filter(function (e) { return !isIdleNoop(e); });
          var idleN = live.length - active.length;
          var toSay = active.length > 8 ? active.slice(-8) : active;
          if (toSay.length < active.length) said('Skipping ' + (active.length - toSay.length) + ' earlier lines.', toSay[0] && toSay[0].phase);
          toSay.forEach(function (e) { said(_stripGlyphs(e.text), e.phase || (st.status === 'combat' ? 'combat' : null)); });
          if (idleN) said(idleN + ' foe' + (idleN === 1 ? '' : 's') + ' stand idle — entranced or held — and do nothing.', 'combat');
        }
      }
    }
    var turnKey = st.turn ? (st.turn.kind + ':' + st.turn.id + ':' + st.round) : ('' + st.status);
    if (turnKey !== _dun.turnKey) {
      _dun.turnKey = turnKey;
      if (st.status === 'combat' && st.turn && st.turn.kind === 'party' && st.turn.id === meId) {
        earcon('turn');
        speak('Your turn. ' + _dunEnemyPhrase(st), 'event');
      } else if (st.status === 'exploring' && _dun.status === 'combat') {
        earcon('clear');
        if (!st.lootRoll) speak('Room clear. Open the next door, or bail with your gold.', 'event');
      }
    }
    if (st.status !== _dun.status) {
      var prev = _dun.status; _dun.status = st.status;
      if (st.status === 'dead') speak('You have fallen in the dungeon. The run is lost.', 'urgent');
      else if (st.status === 'bailed' && prev) speak('You climbed out with ' + st.runGold + ' gold.', 'urgent');
    }
  }

  // ============================ KEYMAP =======================================
  // Poker's dungeon keydown handler (client.js:2028-2895), verbatim. Only the
  // shimmed globals above differ; the play semantics are byte-for-byte poker.
  document.addEventListener('keydown', function (e) {
    if (document.body.dataset.screen !== 'dungeon') return;
    var tag = e.target && e.target.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || (e.target && e.target.isContentEditable)) return;
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    var d = state.dungeon; if (!d) return;
    var k = (e.key || '').toLowerCase();
    if (window.BlindMode && window.BlindMode.isOn && window.BlindMode.isOn()) {
      if (e.key !== '.') _dunCancelArm = 0;
      if (e.key === '?') { e.preventDefault(); _blindHelp = !_blindHelp; BM.speak('Help mode ' + (_blindHelp ? 'on' : 'off') + '.', 'urgent'); return; }
      var sayU = function (t) { BM.speak(t, 'urgent'); };
      // PGM has a player-rolled INITIATIVE step poker lacks — any number or Return
      // rolls it, then normal combat keys take over.
      if (d.phase === 'initiative') {
        if (/^[1-9]$/.test(k) || e.key === 'Enter' || e.code === 'NumpadEnter') {
          e.preventDefault();
          if (_blindHelp) { sayU('Press a number to roll for initiative.'); return; }
          sayU('Rolling for initiative.'); if (window.__pgmAction) window.__pgmAction({ type: 'initiative' });
          return;
        }
      }
      if (e.key === '\\') {
        e.preventDefault();
        if (_blindHelp) { sayU('Backslash: open the message field to type to the party. Enter sends, Escape cancels.'); return; }
        var input = document.getElementById('chat-input') || document.getElementById('dungeonChatInput');
        if (!input) { sayU('No message field here.'); return; }
        input.focus(); try { input.select(); } catch (_) {}
        sayU('Message field. Type your message, Enter to send, Escape to cancel.');
        return;
      }
      var crNum = function (cr) { var s = String(cr == null ? '' : cr); if (s.indexOf('/') >= 0) { var p = s.split('/'); var a = parseFloat(p[0]), b = parseFloat(p[1]); return b ? a / b : 0; } var n = parseFloat(s); return isFinite(n) ? n : 0; };
      var byCr = function (a, b) { return crNum(b.cr) - crNum(a.cr); };
      var aliveE = (d.enemies || []).filter(function (x) { return x.alive; }).sort(byCr);
      var enemyDesc = function (en, i) {
        var c = (en.conditions || []).map(function (x) { return String(x.label || '').toLowerCase(); }).filter(Boolean);
        var s = (i + 1) + ': ' + en.name + ', ' + Math.max(0, en.hp | 0) + ' of ' + (en.maxHp | 0) + ' HP';
        if (en.flying) s += ', flying';
        if (en.boss) s += ', boss';
        if (en.cr) s += ', CR ' + en.cr;
        if (en.drDesc) s += ', ' + en.drDesc;
        if (c.length) s += ', ' + c.join(', ');
        return s;
      };
      var meId = _meId();
      var meM = (d.party || []).find(function (m) { return m.playerId === meId; }) || {};
      var kit = meM.kit || { atwill: { name: 'Attack' }, abilities: [] };
      var myTurn = d.status === 'combat' && d.turn && d.turn.kind === 'party' && d.turn.id === meId;

      // --- Class-progression (X), metamagic (G), prepare (K), domains (V) are
      //     poker features that need server round-trips PGM lacks; they answer
      //     gracefully rather than break. (Kept as stubs so the keys are known.)
      if (k === 'x') { e.preventDefault(); sayU(_blindHelp ? 'X: class progression — not available in this dungeon yet.' : 'Class progression is not available here yet.'); return; }
      if (k === 'g') { e.preventDefault(); sayU(_blindHelp ? 'G: metamagic — not available in this dungeon yet.' : 'Metamagic toggles are not available here yet.'); return; }
      if (k === 'k') { e.preventDefault(); sayU(_blindHelp ? 'K: prepare spells — not available in this dungeon yet.' : 'Preparing spells is not available here yet — your spells are ready to cast.'); return; }
      if (k === 'v') { e.preventDefault(); sayU(_blindHelp ? 'V: domains — not available in this dungeon yet.' : 'Domains are not available here yet.'); return; }

      // --- Blind action list: 1 = Attack, 2..N = features, then Spellbook ---
      var ord = function (nn) { var s = ['th', 'st', 'nd', 'rd'], v = nn % 100; return nn + (s[(v - 20) % 10] || s[v] || s[0]); };
      var spells = (kit.abilities || []).filter(function (a) { return a.slvl != null; });
      var hasSpellbook = !!kit.caster && spells.length > 0;
      var spellLevels = Array.from(new Set(spells.map(function (s) { return s.slvl; }))).sort(function (a, b) { return a - b; });
      var sbAt = function (L) { return spells.filter(function (s) { return s.slvl === L; }).slice().sort(function (a, b) { return String(a.name).localeCompare(String(b.name)); }); };
      var blindActions = [{ kind: 'attack', label: (kit.atwill && kit.atwill.name) || 'Attack' }];
      (kit.abilities || []).forEach(function (ab, i) {
        if (ab.slvl != null) return;                 // spells → spellbook
        if (ab.available === false) return;           // level-locked don't eat numbers
        blindActions.push({ kind: 'ability', ab: ab, slot: (ab.slot != null ? ab.slot : ab.key), label: ab.name });
      });
      if (hasSpellbook) blindActions.push({ kind: 'spellbook', label: 'Spellbook' });

      var castSpell = function (ab) {
        if (!myTurn) { BM.speak('Not your turn.', 'ambient'); return; }
        var slot = (ab.slot != null ? ab.slot : ab.key);
        if (ab.target === 'enemy' && ab.effect !== 'missile' && aliveE.length > 1) {
          _dunTarget = { kind: 'ability', slot: slot, label: ab.name };
          var list = aliveE.slice(0, 9).map(function (x, i) { return (i + 1) + ', ' + x.name + (x.flying ? ', flying' : '') + ', ' + Math.round(100 * Math.max(0, x.hp | 0) / (x.maxHp || 1)) + '%'; }).join('; ');
          sayU(ab.name + ' — select a target, deadliest first: ' + list + '.');
          return;
        }
        if (ab.target === 'aoe') { dungeonAction('ability', { slot: slot, targetUid: aliveE[0] && aliveE[0].uid, targetUids: aliveE.slice(0, 6).map(function (x) { return x.uid; }) }); return; }
        var locked = _dunQueuedAttack && aliveE.find(function (x) { return x.uid === _dunQueuedAttack; });
        var tgt = locked || aliveE[0];
        dungeonAction('ability', { slot: slot, targetUid: tgt && tgt.uid });
      };

      // --- Spellbook sub-mode ---
      var closeSb = function () { _dunSbMode = false; _dunSbLevel = null; _dunSbIdx = -1; _spellbookOpen = false; };
      if (_dunSbMode) {
        if (e.key === 'Escape') {
          e.preventDefault();
          if (_dunSbLevel != null) { _dunSbLevel = null; _dunSbIdx = -1; sayU('Spellbook. Levels: ' + spellLevels.map(ord).join(', ') + '. Pick a level, or Escape to close.'); }
          else { closeSb(); sayU('Spellbook closed.'); }
          return;
        }
        if (/^[1-9]$/.test(k)) {
          e.preventDefault();
          var n0 = parseInt(k, 10);
          if (_dunSbLevel == null) {
            var at0 = sbAt(n0);
            if (!at0.length) { sayU('No level ' + ord(n0) + ' spells.'); return; }
            _dunSbLevel = n0; _dunSbIdx = -1;
            sayU(ord(n0) + ' level: ' + at0.map(function (s, i) { return (i + 1) + ' ' + s.name + (s.available === false ? ', no slots' : ''); }).join(', ') + '. Press a number to cast, Tab to browse, 0 to go back.');
            return;
          }
          var atC = sbAt(_dunSbLevel);
          var spC = atC[n0 - 1];
          if (!spC) { sayU('No spell ' + n0 + ' at this level.'); return; }
          if (!myTurn) { sayU('Not your turn.'); return; }
          if (spC.available === false) { sayU(spC.name + ' is out of slots.'); return; }
          closeSb();
          var willPromptC = (spC.target === 'enemy' && spC.effect !== 'missile' && aliveE.length > 1);
          if (!willPromptC) sayU('Casting ' + spC.name + '.');
          castSpell(spC);
          return;
        }
        if (k === '0') { e.preventDefault(); if (_dunSbLevel != null) { _dunSbLevel = null; _dunSbIdx = -1; sayU('Spellbook. Levels: ' + spellLevels.map(ord).join(', ') + '. Pick a level.'); } return; }
        if (e.key === 'Tab') {
          e.preventDefault();
          if (_dunSbLevel == null) { sayU('Pick a spell level first: ' + spellLevels.map(ord).join(', ') + '.'); return; }
          var atT = sbAt(_dunSbLevel);
          if (!atT.length) { sayU('No spells at this level.'); return; }
          _dunSbIdx = e.shiftKey ? _dunSbIdx - 1 : _dunSbIdx + 1;
          if (_dunSbIdx < 0) _dunSbIdx = atT.length - 1;
          if (_dunSbIdx >= atT.length) _dunSbIdx = 0;
          var spT = atT[_dunSbIdx];
          sayU(spT.name + (spT.available === false ? ', no slots' : '') + '.');
          return;
        }
        if (e.key === 'Enter' || e.code === 'NumpadEnter') {
          e.preventDefault();
          if (_dunSbLevel == null || _dunSbIdx < 0) { sayU('Tab to a spell first, then Return to cast — or just press its number.'); return; }
          var spE = sbAt(_dunSbLevel)[_dunSbIdx];
          if (!spE) { sayU('No spell selected.'); return; }
          if (!myTurn) { sayU('Not your turn.'); return; }
          if (spE.available === false) { sayU(spE.name + ' is out of slots.'); return; }
          closeSb();
          var willPromptE = (spE.target === 'enemy' && spE.effect !== 'missile' && aliveE.length > 1);
          if (!willPromptE) sayU('Casting ' + spE.name + '.');
          castSpell(spE);
          return;
        }
      }

      // --- Session menu (Esc) ---
      var SESSION_ITEMS = [
        { label: 'Bail out with your gold', fn: function () { sayU('Bailing out with your gold.'); dungeonAction('bail'); } },
        { label: 'Leave the delve (it stays saved)', fn: function () { returnFromDungeon(); } },
      ];
      if (_dunSessionMode) {
        if (e.key === 'Tab') { e.preventDefault(); _dunSessionIdx = (e.shiftKey ? _dunSessionIdx - 1 + SESSION_ITEMS.length : _dunSessionIdx + 1) % SESSION_ITEMS.length; sayU(SESSION_ITEMS[_dunSessionIdx].label + '.'); return; }
        if (e.key === 'Enter' || e.code === 'NumpadEnter') { e.preventDefault(); var it = SESSION_ITEMS[_dunSessionIdx]; _dunSessionMode = false; sayU(it.label + '.'); it.fn(); return; }
        if (e.key === 'Escape') { e.preventDefault(); _dunSessionMode = false; sayU('Session menu closed.'); return; }
        e.preventDefault(); return;
      }

      // F = read the foes again.
      if (k === 'f') { e.preventDefault(); if (_blindHelp) { sayU('F: read the foes again — the quick enemy list for a fast target pick.'); return; } readEnemies(d); return; }
      // E = inspect enemies browse mode.
      if (k === 'e') {
        e.preventDefault();
        if (_blindHelp) { sayU('E: inspect enemies — Tab to cycle, Return to target, E to exit.'); return; }
        _dunEnemyMode = !_dunEnemyMode; _dunEnemyIdx = -1;
        if (_dunEnemyMode) sayU('Enemy inspect: ' + aliveE.length + ' ' + (aliveE.length === 1 ? 'enemy' : 'enemies') + '. Tab to cycle, a number to jump, Return to target it, E to exit.');
        else sayU('Exited enemy inspect.');
        return;
      }
      if (_dunEnemyMode && e.key === 'Tab') {
        e.preventDefault();
        if (!aliveE.length) { sayU('No enemies.'); return; }
        _dunEnemyIdx = (e.shiftKey ? _dunEnemyIdx - 1 : _dunEnemyIdx + 1);
        if (_dunEnemyIdx < 0) _dunEnemyIdx = aliveE.length - 1;
        if (_dunEnemyIdx >= aliveE.length) _dunEnemyIdx = 0;
        sayU(enemyDesc(aliveE[_dunEnemyIdx], _dunEnemyIdx));
        return;
      }
      if (_dunEnemyMode && e.key === 'Escape') { e.preventDefault(); _dunEnemyMode = false; sayU('Exited enemy inspect.'); return; }
      if ((e.key === 'Enter' || e.code === 'NumpadEnter') && _dunEnemyMode) {
        e.preventDefault();
        if (!aliveE.length) { sayU('No enemies.'); return; }
        var enE = aliveE[_dunEnemyIdx >= 0 ? _dunEnemyIdx : 0];
        _dunEnemyMode = false;
        if (_dunTarget && myTurn) { var pend0 = _dunTarget; _dunTarget = null; sayU(pend0.label + ' ' + enE.name + '.'); if (pend0.kind === 'attack') dungeonAction('attack', { targetUid: enE.uid }); else dungeonAction('ability', { slot: pend0.slot, targetUid: enE.uid }); return; }
        _dunTarget = null;
        if (myTurn) { _dunQueuedAttack = null; sayU('Attacking ' + enE.name + '.'); dungeonAction('attack', { targetUid: enE.uid }); }
        else { _dunQueuedAttack = enE.uid; dungeonAction('attack', { targetUid: enE.uid }); sayU(enE.name + ' locked in — your attack fires the moment your turn comes.'); }
        return;
      }
      // C = cycle cantrip element.
      if (k === 'c') {
        e.preventDefault();
        if (_blindHelp) { BM.speak('C: switch your cantrip element.', 'urgent'); return; }
        var ct = meM.cantrip;
        if (!ct || !(ct.choices || []).length) { BM.speak('You have no cantrip to switch.', 'urgent'); return; }
        dungeonAction('cantrip', {});
        return;
      }
      // M = money.
      if (k === 'm') { e.preventDefault(); if (_blindHelp) { BM.speak('M: gold earned this run.', 'urgent'); return; } BM.speak((d.runGold | 0) + ' gold in the run pool, depth ' + (d.depth | 0) + '.', 'urgent'); return; }
      // L = life.
      if (k === 'l') {
        e.preventDefault();
        if (_blindHelp) { BM.speak('L: your life and status.', 'urgent'); return; }
        if (!meM.playerId) { BM.speak('You are not in the party.', 'urgent'); return; }
        var hpL = Math.max(0, meM.hp | 0), maxL = meM.maxHp | 0;
        var buffsL = (meM.buffs || []).map(function (b) { return String(b.label || '').toLowerCase(); }).filter(Boolean);
        var condsL = (meM.conditions || []).map(function (c) { return String(c.label || '').toLowerCase(); }).filter(Boolean);
        var lvlL = meM.level ? ('Level ' + meM.level + (meM.cls ? ' ' + meM.cls : '') + ', ') : '';
        var sL = lvlL + hpL + ' of ' + maxL + ' HP';
        if (meM.dead) sL += ', dead'; else if (meM.downed || hpL <= 0) sL += ', downed';
        var statusesL = buffsL.concat(condsL);
        if (statusesL.length) sL += ', ' + statusesL.join(', ');
        BM.speak(sL + '.', 'urgent');
        return;
      }
      // H = party health.
      if (k === 'h') {
        e.preventDefault();
        if (_blindHelp) { BM.speak('H: party health summary.', 'urgent'); return; }
        var partyH = (d.party || []).filter(function (p) { return !p.left; });
        if (!partyH.length) { BM.speak('No party.', 'urgent'); return; }
        BM.speak('Party: ' + partyH.map(function (p) { var hp = Math.max(0, p.hp | 0), max = p.maxHp | 0; var s = p.nickname + ' ' + hp + ' of ' + max; if (p.dead) s += ', dead'; else if (p.downed || hp <= 0) s += ', down'; return s; }).join('; ') + '.', 'urgent');
        return;
      }
      // Numbers: enemy-inspect jump, pending-target pick, or action-list choice.
      if (/^[1-9]$/.test(k)) {
        e.preventDefault();
        var n = parseInt(k, 10);
        var aliveN = (d.enemies || []).filter(function (x) { return x.alive; }).sort(byCr);
        if (_dunEnemyMode) { var enN = aliveN[n - 1]; if (!enN) { sayU('No enemy ' + n + '.'); return; } _dunEnemyIdx = n - 1; sayU(enemyDesc(enN, n - 1)); return; }
        if (_dunTarget) {
          if (!myTurn) { _dunTarget = null; BM.speak('Not your turn.', 'urgent'); return; }
          var tgtN = aliveN[n - 1];
          if (!tgtN) { BM.speak('No enemy ' + n + '.', 'urgent'); return; }
          var pendN = _dunTarget; _dunTarget = null;
          BM.speak(pendN.label + ' ' + tgtN.name + '.', 'urgent');
          if (pendN.kind === 'attack') dungeonAction('attack', { targetUid: tgtN.uid }); else dungeonAction('ability', { slot: pendN.slot, targetUid: tgtN.uid });
          return;
        }
        var act = blindActions[n - 1];
        if (!act) { BM.speak('No action ' + n + '.', 'urgent'); return; }
        if (_blindHelp) { BM.speak(n + ': ' + act.label + '.', 'urgent'); return; }
        if (act.kind === 'spellbook') { _dunSbMode = true; _dunSbLevel = null; _dunSbIdx = -1; _spellbookOpen = true; sayU('Spellbook. Levels: ' + spellLevels.map(ord).join(', ') + '. Pick a level, then press a spell\'s number to cast it. Escape to close.'); return; }
        if (!myTurn) { BM.speak('Not your turn.', 'ambient'); return; }
        var abN = act.ab || null;
        var singleEnemyTarget = act.kind === 'attack' || (abN && abN.target === 'enemy');
        if (singleEnemyTarget && aliveN.length > 1) {
          _dunTarget = { kind: act.kind === 'attack' ? 'attack' : 'ability', slot: act.slot, label: act.label };
          var listN = aliveN.slice(0, 9).map(function (x, i) { var pct = Math.round(100 * Math.max(0, x.hp | 0) / (x.maxHp || 1)); var debs = (x.conditions || []).map(function (c) { return c.label; }).filter(Boolean); return (i + 1) + ', ' + x.name + ', ' + pct + '%' + (x.flying ? ', flying' : '') + (debs.length ? ', ' + debs.join(', ') : ''); }).join('; ');
          BM.speak(act.label + ' — select a target, deadliest first: ' + listN + '.', 'urgent');
          return;
        }
        var targetUidN = aliveN[0] && aliveN[0].uid;
        BM.speak(act.label + '.', 'urgent');
        if (act.kind === 'attack') dungeonAction('attack', { targetUid: targetUidN });
        else dungeonAction('ability', { slot: act.slot, targetUid: targetUidN });
        return;
      }
      // 0 = open the next door.
      if (k === '0') {
        e.preventDefault();
        if (_blindHelp) { BM.speak('0: open the next door. Number row or numpad.', 'urgent'); return; }
        if (d.status === 'combat') { BM.speak('Cannot open a door during combat.', 'urgent'); return; }
        BM.speak('Opening the door.', 'urgent'); dungeonAction('door'); return;
      }
      if (e.key === '.') { e.preventDefault(); if (_blindHelp) BM.speak('Period: unassigned.', 'urgent'); return; }
      // Esc → session controls.
      if (e.key === 'Escape') {
        if (_dunTarget) { e.preventDefault(); _dunTarget = null; BM.speak('Target selection cancelled.', 'urgent'); return; }
        e.preventDefault();
        if (_blindHelp) { BM.speak('Escape: open the session menu — bail out with your share, or leave.', 'urgent'); return; }
        _dunSessionMode = true; _dunSessionIdx = 0;
        BM.speak('Session menu. Tab through bail out with your gold, and leave the delve; Return to choose; Escape to exit. Bail out with your gold.', 'urgent');
        return;
      }
      // B = party buffs.
      if (k === 'b') {
        e.preventDefault();
        if (_blindHelp) { sayU('B: read every party member\'s active buffs. Debuffs are on the D key.'); return; }
        var liveB = (d.party || []).filter(function (p) { return !p.left && !p.dead; });
        if (!liveB.length) { sayU('No party members.'); return; }
        var PERSONAL = { powerattack: 1, deadlyaim: 1, rapidshot: 1, fightdefensively: 1 };
        sayU('Party buffs. ' + liveB.map(function (p) { var items = (p.buffs || []).filter(function (b) { return !PERSONAL[b.key]; }).map(function (b) { return b.label; }); return p.nickname + ': ' + (items.length ? items.join(', ') : 'no buffs'); }).join('. ') + '.');
        return;
      }
      // D = debuffs only.
      if (k === 'd') {
        e.preventDefault();
        if (_blindHelp) { sayU('D: debuffs only — bad conditions on you and the party, like held or sickened.'); return; }
        var liveD = (d.party || []).filter(function (p) { return !p.left && !p.dead; });
        if (!liveD.length) { sayU('No party members.'); return; }
        var linesD = liveD.map(function (p) { var debs = (p.conditions || []).map(function (c) { return c.label; }).filter(Boolean); return debs.length ? p.nickname + ': ' + debs.join(', ') : null; }).filter(Boolean);
        sayU(linesD.length ? 'Debuffs. ' + linesD.join('. ') + '.' : 'No debuffs on the party.');
        return;
      }
      // Unassigned letters: A and S are GLOBAL (repeat / stop) — leave them to
      // blindmode.js. Everything else answers "not mapped" and never leaks.
      if (/^[a-z]$/.test(k)) {
        if (k === 's' || k === 'a') return;
        e.preventDefault();
        if (_blindHelp) sayU(k.toUpperCase() + ': not mapped.');
        else if (['q', 'w', 'o'].indexOf(k) >= 0) sayU('Not mapped.');
        return;
      }
      if ((e.key === 'Enter' || e.code === 'NumpadEnter') && (!document.activeElement || document.activeElement === document.body)) {
        e.preventDefault();
        if (_blindHelp) sayU('Return: confirms inside the spellbook and session menu. 0 opens doors.');
        return;
      }
      return;
    }
  });

  // ---- public surface for app.js ---------------------------------------------
  function setDungeonState(st, myId) {
    state.me.player_id = myId;
    state.dungeon = st;
    onDungeonState(st);
  }
  function resetNarration() { _dun = { depth: -1, logT: 0, turnKey: '', status: '', lootKey: '' }; }
  window.DungeonBlind = { setDungeonState: setDungeonState, readEnemies: readEnemies, resetNarration: resetNarration };
})();
