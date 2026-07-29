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
      var seq = kind === 'turn' ? [660, 780, 920] : kind === 'clear' ? [523, 659, 784] : kind === 'toggle' ? [520, 880] : [520];
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
  var _blindHelp = false, _dunCancelArm = 0, _dunSbp = null, _dunDmp = false, _dunDmpIdx = -1, _dunProg = null,
      _dunMmMenu = null, _dunSbMode = false, _dunSbLevel = null, _dunSbIdx = -1, _dunImbuedMode = false,
      _dunAllyPick = null, _dunDispelPick = null, _dunModePick = null, _dunSessionMode = false,
      _dunSessionIdx = 0, _dunEnemyMode = false, _dunEnemyIdx = -1, _dunTarget = null,
      _dunQueuedAttack = null, _spellbookOpen = false, _dungeonSel = [],
      _dunPad = false, _dunPadIdx = -1, _dunPadAssign = null, _padMgrModel = null,
      _sbpModelM = null, _dmpModelM = null;   // K/V picker models — module scope so they survive between keypresses   // N numpad manager (poker PAD MAP v2, v1.19.0)

  // ============================ NARRATION ====================================
  // Poker's blindMode.js dungeon section (onDungeonState + helpers), verbatim.
  var _dun = { depth: -1, logT: 0, turnKey: '', status: '', lootKey: '', enemySig: '' };
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
        // Terse play-by-play (Tobias 2026-07-15: "Farrus Richton flies into a rage"
        // should speak as "Farrus: rage" — a general convention; the blind player
        // receives LESS flavor to save time). The screen keeps the full line; only
        // speech compresses. Names shorten further via the TTS nickname pass.
        var TERSE = [
          [/^(.+?) flies into an? (?:MIGHTY |GREATER )?RAGE!?.*$/i, '$1: rage.'],
          [/^(.+?) strikes up (.+?) — .*$/i, '$1: $2.'],
          [/^(.+?) intones (.+?) — .*$/i, '$1: $2.'],
          [/^(.+?) blesses the party'?s weapons with (.+?)[.!]?\s*$/i, '$1: $2.'],
          [/^(.+?) casts (.+?) on (.+?)\.\s*$/i, '$1: $2 on $3.'],
          [/^(.+?) casts (.+?)(?: —.*|!.*)$/i, '$1: $2.'],
          [/^(.+?) uses (.+?)!\s*$/i, '$1: $2.'],
          [/^(.+?) calls a Smite —.*$/i, '$1: smite.'],
          [/^(.+?) channels? positive energy —\s*/i, '$1: channel — '],
          [/^(.+?) bellows a furious challenge \[[^\]]*\] —\s*/i, '$1 taunts: '],
          [/^(.+?) pours? out the last of the day'?s healing.*$/i, '$1 tends the wounded.'],
        ];
        var _terse = function (t) {
          for (var i = 0; i < TERSE.length; i++) { if (TERSE[i][0].test(t)) return t.replace(TERSE[i][0], TERSE[i][1]); }
          return t;
        };
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
          show.forEach(function (e) { said(_terse(_stripGlyphs(e.text)), e.phase || 'combat'); });
          if (enemyTally) said('Plus ' + enemyTally + ' more enemy action' + (enemyTally > 1 ? 's' : '') + ' — press E to inspect the foes.', 'combat');
        } else {
          var isIdleNoop = function (e) { return e.side === 'enemy' && /does nothing|loses its turn|struggles in vain/i.test(String(e.text || '')); };
          var active = live.filter(function (e) { return !isIdleNoop(e); });
          var idleN = live.length - active.length;
          var toSay = active.length > 8 ? active.slice(-8) : active;
          if (toSay.length < active.length) said('Skipping ' + (active.length - toSay.length) + ' earlier lines.', toSay[0] && toSay[0].phase);
          toSay.forEach(function (e) { said(_terse(_stripGlyphs(e.text)), e.phase || (st.status === 'combat' ? 'combat' : null)); });
          if (idleN) said(idleN + ' foe' + (idleN === 1 ? '' : 's') + ' stand idle — entranced or held — and do nothing.', 'combat');
        }
      }
    }
    var turnKey = st.turn ? (st.turn.kind + ':' + st.turn.id + ':' + st.round) : ('' + st.status);
    if (turnKey !== _dun.turnKey) {
      _dun.turnKey = turnKey;
      if (st.status === 'combat' && st.turn && st.turn.kind === 'party' && st.turn.id === meId) {
        earcon('turn');
        // Read the enemy lineup only when it CHANGED since you last heard it (a foe
        // died or a new one appeared) — otherwise just "Your turn." Tobias: it read
        // every enemy's HP every single turn, "constantly talking." F re-reads them.
        var sig = (st.enemies || []).filter(function (e) { return e.alive; })
          .map(function (e) { return e.uid + ':' + Math.round(100 * Math.max(0, e.hp | 0) / (e.maxHp || 1) / 25); }).join(',');
        if (sig !== _dun.enemySig) { _dun.enemySig = sig; speak('Your turn. ' + _dunEnemyPhrase(st), 'event'); }
        else speak('Your turn.', 'event');
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

      // --- Poker-parity ROUND-TRIP PICKERS (v1.19.0): X progression, G metamagic,
      //     K prepare, V domains — REAL now, served by the same transplanted mixin
      //     poker runs, through /api/session/action. Spoken flows match poker's.
      var ord = function (nn) { var s2 = ['th', 'st', 'nd', 'rd'], v2 = nn % 100; return nn + (s2[(v2 - 20) % 10] || s2[v2] || s2[0]); };   // needed by the K menu callbacks — the later  assignment never runs when a picker block returns early
      var pickSend = function (type, payload, cb) {
        if (!window.__pgmActionRaw) { sayU('Not available.'); return; }
        window.__pgmActionRaw(Object.assign({ type: type }, payload || {}), function (r) {
          if (!r || r.ok === false) { sayU((r && r.error) || 'Unavailable.'); return; }
          if (cb) cb(r);
        });
      };
      // ----- Class-progression reference — X (poker: "what does each level give me?")
      if (_dunProg) {
        if (e.key === 'Escape') { e.preventDefault(); _dunProg = null; sayU('Progression closed.'); return; }
        if (/^[1-9]$/.test(k)) {
          e.preventDefault();
          var pe = (_dunProg.next || [])[parseInt(k, 10) - 1];
          if (!pe) { sayU('Nothing that far — you cap at level 20.'); return; }
          sayU('Level ' + pe.level + ': ' + pe.gains + '.');
          return;
        }
      }
      if (k === 'x') {
        e.preventDefault();
        if (_blindHelp) { sayU('X: class progression. Speaks what your next level grants — feats, spells, slots. While open, press 1 through 9 for further levels; Escape closes.'); return; }
        if (_dunProg) { _dunProg = null; sayU('Progression closed.'); return; }
        sayU('Looking up your progression.');
        pickSend('progression', {}, function (resp) {
          _dunProg = resp;
          var first = (resp.next || [])[0];
          sayU('You are level ' + resp.level + ' ' + resp.cls + '. ' + (first ? 'Level ' + first.level + ' grants: ' + first.gains + '. Press 2 through 9 for later levels, Escape to close.' : 'You are at the level cap.'));
        });
        return;
      }
      // ----- Metamagic — G (spontaneous toggles; prepared casters get the honest report)
      var _mm = (kit && kit.metamagic) || [];
      if (_dunMmMenu) {
        if (e.key === 'Escape') { e.preventDefault(); _dunMmMenu = null; sayU('Metamagic menu closed.'); return; }
        if (/^[1-9]$/.test(k)) {
          e.preventDefault();
          var mm = _dunMmMenu[parseInt(k, 10) - 1];
          if (!mm) { sayU('No metamagic ' + k + '.'); return; }
          pickSend('metamagic', { key: mm.key }, function () {});
          mm.on = !mm.on;
          sayU(mm.name + ' ' + (mm.on ? 'on' : 'off') + '.');
          return;
        }
      }
      if (k === 'g') {
        e.preventDefault();
        if (_blindHelp) { sayU('G: metamagic. If you have metamagic feats, press G then a number to toggle one on or off before you cast. A prepared caster has no toggles — G tells you which metamagic is baked into your spells.'); return; }
        if (!meM.kit) { sayU('Metamagic opens on your turn.'); return; }   // PGM's kit rides the turn payload
        if (!_mm.length) {
          var owned = kit.metamagicOwned || [];
          if (kit.metamagicBaked && owned.length) { sayU('You have ' + owned.join(', ') + '. As a prepared caster there is nothing to toggle — your metamagic is already built into your spell list, as the Intensified, Empowered, Maximized and Quickened versions of your spells. Open your spellbook and cast those directly.'); return; }
          sayU('You have no metamagic feats.'); return;
        }
        if (_dunMmMenu) { _dunMmMenu = null; sayU('Metamagic menu closed.'); return; }
        _dunMmMenu = _mm.map(function (m2) { return { key: m2.key, name: m2.name, adj: m2.adj, on: m2.on }; });
        sayU('Metamagic: ' + _dunMmMenu.map(function (m2, i) { return (i + 1) + ' ' + m2.name + ', ' + (m2.on ? 'on' : 'off'); }).join('; ') + '. Press a number to toggle, Escape closes.');
        return;
      }
      // ----- Prepare menu — K (poker's spell KIT; level → numbered spells → toggle)
      var _sbpModel = _sbpModelM || null;
      var _sbpAt = function (mdl, L) { return (mdl.pool || []).filter(function (s) { return s.slvl === L; }).slice().sort(function (a, b) { return String(a.name).localeCompare(String(b.name)); }); };
      var _sbpPicked = function (mdl, sp) {
        if (mdl.spont) return (mdl.known || []).indexOf(sp.key) >= 0;
        var prep = mdl.prepared || {};
        return Object.keys(prep).some(function (L) { return (prep[L] || []).indexOf(sp.key) >= 0; });
      };
      var _sbpLevels = function (mdl) { return Array.from(new Set((mdl.pool || []).map(function (s) { return s.slvl; }))).sort(function (a, b) { return a - b; }); };
      var _sbpSpeakLevels = function () {
        var mdl = _sbpModelM; if (!mdl) { sayU('Still loading your spell list.'); return; }
        var Ls = _sbpLevels(mdl);
        sayU('Prepare spells — levels: ' + Ls.map(ord).join(', ') + '. Press a level number, then a number toggles a spell; Tab steps the level one spell at a time and Enter toggles; 0 goes back; Escape closes. Changes land at the next door.');
      };
      var _sbpSpeakLevel = function (L) {
        var mdl = _sbpModelM; if (!mdl) { sayU('Still loading your spell list.'); return; }
        var at = _sbpAt(mdl, L);
        var cap = mdl.caps ? mdl.caps[L] : null;
        var cnt = mdl.spont ? null : ((mdl.prepared || {})[L] || []).length;
        sayU(ord(L) + ' level' + (cap != null ? ', ' + cnt + ' of ' + cap + ' prepared' : '') + ': ' + at.map(function (s, i) { return (i + 1) + ' ' + s.name + (_sbpPicked(mdl, s) ? (mdl.spont ? ', known' : ', prepared') : ''); }).join('; ') + '.');
      };
      var _sbpToggle = function (sp, L) {
        pickSend('loadout', { toggle: sp.key }, function (m2) {
          _sbpModelM = m2;
          var now = _sbpPicked(m2, sp);
          sayU(sp.name + ' ' + (now ? (m2.spont ? 'learned' : 'prepared') : 'removed') + '. Takes effect at the next door.');
        });
      };
      if (_dunSbp) {
        if (e.key === 'Escape') { e.preventDefault(); _dunSbp = null; sayU('Prepare menu closed.'); return; }
        if (k === '0') { e.preventDefault(); _dunSbp.lvl = null; _dunSbp.idx = -1; _sbpSpeakLevels(); return; }
        if (e.key === 'Tab' && _dunSbp.lvl != null) {
          e.preventDefault();
          var mdlT = _sbpModelM;
          var atT2 = mdlT ? _sbpAt(mdlT, _dunSbp.lvl) : [];
          if (!atT2.length) { sayU('Still loading your spell list.'); return; }
          var nT = atT2.length;
          _dunSbp.idx = (((_dunSbp.idx == null ? -1 : _dunSbp.idx) + (e.shiftKey ? -1 : 1)) % nT + nT) % nT;
          var spT2 = atT2[_dunSbp.idx];
          var pk = _sbpPicked(mdlT, spT2);
          sayU((_dunSbp.idx + 1) + ', ' + spT2.name + ', ' + (pk ? (mdlT.spont ? 'known' : 'prepared') : 'available') + '. Enter to ' + (pk ? 'remove' : (mdlT.spont ? 'learn' : 'prepare')) + '.');
          return;
        }
        if (e.key === 'Enter' && _dunSbp.lvl != null && _dunSbp.idx != null && _dunSbp.idx >= 0) {
          e.preventDefault();
          var mdlE = _sbpModelM;
          var spE = mdlE && _sbpAt(mdlE, _dunSbp.lvl)[_dunSbp.idx];
          if (!spE) { sayU('Still loading your spell list.'); return; }
          _sbpToggle(spE, _dunSbp.lvl);
          return;
        }
        if (/^[1-9]$/.test(k)) {
          e.preventDefault();
          var mdlK = _sbpModelM;
          if (!mdlK) { sayU('Still loading your spell list.'); return; }
          if (_dunSbp.lvl == null) {
            var LK = parseInt(k, 10);
            if (!(mdlK.pool || []).some(function (s) { return s.slvl === LK; })) { sayU('No level ' + LK + ' spells.'); return; }
            _dunSbp.lvl = LK; _dunSbp.idx = -1; _sbpSpeakLevel(LK);
            return;
          }
          var spK = _sbpAt(mdlK, _dunSbp.lvl)[parseInt(k, 10) - 1];
          if (!spK) { sayU('No spell ' + k + ' at this level. Tab steps through them all.'); return; }
          _sbpToggle(spK, _dunSbp.lvl);
          return;
        }
      }
      if (k === 'k') {
        e.preventDefault();
        if (_blindHelp) { sayU('K: prepare spells, your spell kit. Press a level number, then a number toggles a spell — or Tab steps through the level one spell at a time and Enter toggles the one you are on. Changes land at the next door.'); return; }
        if (_dunSbp) { _dunSbp = null; sayU('Prepare menu closed.'); return; }
        _dunSbp = { lvl: null, idx: -1 };
        sayU('Opening your spell kit.');
        pickSend('loadout', {}, function (m2) { _sbpModelM = m2; if (_dunSbp) _sbpSpeakLevels(); });
        return;
      }
      // ----- Domain menu — V (poker Domains Phase C, verbatim flow)
      var _dmpSpeak = function () {
        var mdl = _dmpModelM; if (!mdl) { sayU('Still loading your domains.'); return; }
        var list = (mdl.domains || []).map(function (d2, i) { return (i + 1) + ' ' + d2.name + (d2.picked ? ', picked' : ''); }).join('; ');
        sayU('Domains — choose ' + mdl.max + ', ' + (mdl.picks || []).length + ' picked: ' + list + '. Numbers 1 through 9 toggle; Tab steps through them all, Enter toggles the one you are on; Escape closes. Changes take effect next room.');
      };
      var _dmpToggle = function (d2) {
        pickSend('domains', { toggle: d2.key }, function (m2) {
          _dmpModelM = m2;
          var now = (m2.picks || []).indexOf(d2.key) >= 0;
          sayU(d2.name + ' ' + (now ? 'picked' : 'dropped') + '. ' + (m2.picks || []).length + ' of ' + m2.max + ' picked. Takes effect next room.');
        });
      };
      if (_dunDmp) {
        if (e.key === 'Escape') { e.preventDefault(); _dunDmp = false; _dunDmpIdx = -1; sayU('Domain menu closed.'); return; }
        if (e.key === 'Tab') {
          e.preventDefault();
          var mdlD = _dmpModelM;
          if (!mdlD || !(mdlD.domains || []).length) { sayU('Still loading your domains.'); return; }
          var nD = mdlD.domains.length;
          _dunDmpIdx = ((_dunDmpIdx + (e.shiftKey ? -1 : 1)) % nD + nD) % nD;
          var dD = mdlD.domains[_dunDmpIdx];
          sayU((_dunDmpIdx + 1) + ', ' + dD.name + (dD.picked ? ', picked' : '') + '. Enter to ' + (dD.picked ? 'drop' : 'pick') + '.');
          return;
        }
        if (e.key === 'Enter' && _dunDmpIdx >= 0) {
          e.preventDefault();
          var mdlD2 = _dmpModelM;
          var dE = mdlD2 && (mdlD2.domains || [])[_dunDmpIdx];
          if (!dE) { sayU('Still loading your domains.'); return; }
          _dmpToggle(dE);
          return;
        }
        if (/^[1-9]$/.test(k)) {
          e.preventDefault();
          var mdlD3 = _dmpModelM;
          if (!mdlD3) { sayU('Still loading your domains.'); return; }
          var dN = (mdlD3.domains || [])[parseInt(k, 10) - 1];
          if (!dN) { sayU('No domain ' + k + '.'); return; }
          _dmpToggle(dN);
          return;
        }
      }
      if (k === 'v') {
        e.preventDefault();
        if (_blindHelp) { sayU('V: domains. Clerics choose two domains, inquisitors one. Press V, then a number 1 through 9 toggles a domain; Tab steps through the full list and Enter toggles the one you are on. Changes land at the next room.'); return; }
        if (meM.kit && !(kit.domainsMax || 0)) { sayU('Your class has no domains.'); return; }
        if (_dunDmp) { _dunDmp = false; _dunDmpIdx = -1; sayU('Domain menu closed.'); return; }
        _dunDmp = true; _dunDmpIdx = -1;
        sayU('Opening your domains.');
        pickSend('domains', {}, function (m2) { _dmpModelM = m2; if (_dunDmp) _dmpSpeak(); });
        return;
      }

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
      // ── PAD MAP (poker v3.37.95, Josh's own design): explicit numpad-slot
      // assignments override the natural order; unplaced actions auto-fill the
      // remaining keys in order (never accidental gaps, only deliberate 'none'
      // dead keys). Same resolution as poker's client.
      var _padIdOf = function (it) { return it.kind === 'ability' ? (it.ab.key || it.slot) : it.kind; };
      var naturalActions = blindActions;
      var _padMapK = (kit && kit.padMap) || {};
      if (Object.keys(_padMapK).length) {
        var byId = {}; naturalActions.forEach(function (it) { byId[_padIdOf(it)] = it; });
        var slots = new Array(9); var used = {};
        for (var s9 = 1; s9 <= 9; s9++) {
          var k9 = _padMapK[s9] != null ? _padMapK[s9] : _padMapK[String(s9)];
          if (!k9) continue;
          if (k9 === 'none') { slots[s9 - 1] = null; continue; }
          var it9 = byId[k9];
          if (it9 && !used[k9]) { slots[s9 - 1] = it9; used[k9] = true; }
        }
        var rest = naturalActions.filter(function (it) { return !used[_padIdOf(it)]; });
        for (var s8 = 0; s8 < 9; s8++) if (slots[s8] === undefined) slots[s8] = rest.shift() || null;
        blindActions = slots;
      }
      // ----- Numpad manager — N (poker PAD MAP v2, v1.19.0). Slot view: Tab reads
      // keys 1-9 + what's mapped; a digit/Enter opens that key's assignment menu
      // (server pad model + Attack/Spellbook + Nothing); digit/Enter assigns.
      var _padChoices = function () {
        var ch = [{ id: 'attack', label: (kit.atwill && kit.atwill.name) || 'Attack', desc: '' }];
        (((_padMgrModel || {}).abilities) || []).forEach(function (a) { ch.push({ id: a.key, label: a.name, desc: a.desc || '' }); });
        if (hasSpellbook || !meM.kit) ch.push({ id: 'spellbook', label: 'Spellbook', desc: 'Opens your leveled spell list.' });
        ch.push({ id: 'none', label: 'Nothing — disable this key', desc: 'The key does nothing, so a stray press can never waste your turn.' });
        return ch;
      };
      var _padSlotLabel = function (s2) { var it = blindActions[s2 - 1]; return it ? it.label : 'unassigned'; };
      var _padSpeakSlots = function () {
        var list = []; for (var i2 = 1; i2 <= 9; i2++) list.push(i2 + ', ' + _padSlotLabel(i2));
        sayU('Pad manager — your numpad: ' + list.join('; ') + '. Press a number to choose what lives on that key; Tab steps through the keys, Enter re-maps the one you are on; Escape closes.');
      };
      var _padOpenAssign = function (s2) {
        _dunPadAssign = { slot: s2, idx: -1 };
        var list = _padChoices().map(function (c2, i2) { return (i2 + 1) + ' ' + c2.label; }).join('; ');
        sayU('Key ' + s2 + ' is ' + _padSlotLabel(s2) + '. Choose its new action: ' + list + '. Numbers pick; Tab steps through with descriptions and Enter picks; Escape backs out.');
      };
      var _padAssign = function (s2, c2) {
        _dunPadAssign = null; _dunPadIdx = s2 - 1;
        pickSend('padpick', { assign: { slot: s2, key: c2.id } }, function (m2) {
          _padMgrModel = m2;
          sayU('Key ' + s2 + ' is now ' + c2.label + '.' + (c2.id === 'none' ? '' : ' Anything it displaced shifts to the next open key.'));
        });
      };
      if (_dunPadAssign) {
        if (e.key === 'Escape') { e.preventDefault(); var sA = _dunPadAssign.slot; _dunPadAssign = null; sayU('Key ' + sA + ' unchanged.'); return; }
        if (e.key === 'Tab') {
          e.preventDefault();
          var chT = _padChoices(); var nP = chT.length;
          _dunPadAssign.idx = ((_dunPadAssign.idx + (e.shiftKey ? -1 : 1)) % nP + nP) % nP;
          var cT = chT[_dunPadAssign.idx];
          sayU((_dunPadAssign.idx + 1) + ', ' + cT.label + '. ' + (cT.desc ? cT.desc + ' ' : '') + 'Enter to put it on key ' + _dunPadAssign.slot + '.');
          return;
        }
        if (e.key === 'Enter' && _dunPadAssign.idx >= 0) { e.preventDefault(); var cE = _padChoices()[_dunPadAssign.idx]; if (cE) _padAssign(_dunPadAssign.slot, cE); return; }
        if (/^[1-9]$/.test(k)) {
          e.preventDefault();
          var cN = _padChoices()[parseInt(k, 10) - 1];
          if (!cN) { sayU('No choice ' + k + '.'); return; }
          _padAssign(_dunPadAssign.slot, cN);
          return;
        }
        return;   // swallow anything else while the assignment menu is open
      }
      if (_dunPad) {
        if (e.key === 'Escape') { e.preventDefault(); _dunPad = false; _dunPadIdx = -1; sayU('Pad manager closed.'); return; }
        if (e.key === 'Tab') {
          e.preventDefault();
          _dunPadIdx = ((_dunPadIdx + (e.shiftKey ? -1 : 1)) % 9 + 9) % 9;
          sayU('Key ' + (_dunPadIdx + 1) + ': ' + _padSlotLabel(_dunPadIdx + 1) + '. Enter to re-map it.');
          return;
        }
        if (e.key === 'Enter' && _dunPadIdx >= 0) { e.preventDefault(); _padOpenAssign(_dunPadIdx + 1); return; }
        if (/^[1-9]$/.test(k)) { e.preventDefault(); _padOpenAssign(parseInt(k, 10)); return; }
      }
      if (k === 'n') {
        e.preventDefault();
        if (_blindHelp) { sayU('N: pad manager. Press N, then Tab through your nine numpad keys to hear what each does; press a key\'s number to choose what lives on it — any of your actions, or Nothing to disable the key. Your layout is saved for this class and every key you leave alone fills in automatically.'); return; }
        if (_dunPad) { _dunPad = false; _dunPadIdx = -1; _dunPadAssign = null; sayU('Pad manager closed.'); return; }
        _dunPad = true; _dunPadIdx = -1; _dunPadAssign = null;
        pickSend('padpick', {}, function (m2) { _padMgrModel = m2; if (_dunPad) _padSpeakSlots(); });
        return;
      }

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
        // A TOGGLE (Power Attack, Deadly Aim, Rage, a stance — cost 'free', no enemy
        // target) just makes a SOUND to confirm it's on (Tobias): no spoken line, and
        // the toggle's log line is suppressed in the adapter. Everything else confirms
        // by voice as before.
        var isToggle = abN && abN.cost === 'free' && abN.target !== 'enemy' && abN.target !== 'aoe';
        if (isToggle) earcon('toggle'); else BM.speak(act.label + '.', 'urgent');
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
  function resetNarration() { _dun = { depth: -1, logT: 0, turnKey: '', status: '', lootKey: '', enemySig: '' }; }
  window.DungeonBlind = { setDungeonState: setDungeonState, readEnemies: readEnemies, resetNarration: resetNarration };
})();
