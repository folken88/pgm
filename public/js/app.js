/**
 * PGM client — concurrent delves. The landing lets you start a new delve or
 * join/watch an active one (side window). Each SSE payload = { you: your delve's
 * detail, sessions: summaries of ALL delves }. Players build a character (with
 * skills), a host adds AI companions, then the party delves in shared PF1
 * initiative combat. Blind-first with voice control throughout.
 */
(function () {
  'use strict';
  var BM = window.BlindMode;

  var state = {
    mode: 'landing',           // landing | create | skills | lobby | game
    role: null, clientId: null, sessionId: null, icon: null, meta: null,
    you: null, sessions: [],
    plan: null, selected: new Set(), charInput: null,
    choices: [], lastSeq: 0, lastAnnouncedTurn: null, es: null,
  };

  var el = function (id) { return document.getElementById(id); };
  var api = function (url, body) {
    return fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}) })
      .then(function (r) { return r.json(); });
  };
  var SCREENS = ['landing', 'create', 'skills', 'lobby', 'game'];
  function showScreen(id) {
    SCREENS.forEach(function (s) { el(s).hidden = (s !== id); });
    document.body.classList.toggle('in-game', id === 'game');
    // CSS drives the delve panels off these body classes (see .side-window-left /
    // body.on-landing): left panel on the landing, right panel elsewhere.
    document.body.classList.toggle('on-landing', id === 'landing');
    // The concurrent-delves window docks into the right column during play.
    var sw = el('side-window');
    if (sw) {
      if (!sw._home) sw._home = sw.parentNode;
      if (id === 'game' && el('loot-panel')) el('loot-panel').appendChild(sw);
      else if (sw._home && sw.parentNode !== sw._home) sw._home.appendChild(sw);
    }
    var changed = state.mode !== id;
    state.mode = id;
    var h = el(id + '-h') || el(id).querySelector('h2');
    if (h) { h.setAttribute('tabindex', '-1'); h.focus(); }
    // On entering a NEW screen, speak the short "what can I do here" guide (Josh
    // 2026-07-14: "it only read my options once… couldn't repeat it"). It becomes
    // lastText, so the A key re-reads it any time. Silent when speech is off.
    if (changed) setTimeout(function () { blindGuide(); }, 120);
  }

  // ── "Through the floor" audio (poker parity, client.js playUrl) ───────────
  // While you're in the SHOP you've only stepped aside — the fight is still
  // happening a few yards away, and you can hear it. A LOW-PASS biquad passes
  // the bass and cuts the highs, so combat sounds DISTANT rather than merely
  // quiet (poker uses the same filter both directions: the table hearing the
  // dungeon below, and the dungeon hearing the table above). Falls back to a
  // plain <audio> if Web Audio is unavailable.
  var _ac = null;
  function audioCtx() {
    if (_ac === null) { try { _ac = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { _ac = false; } }
    if (_ac && _ac.state === 'suspended') { try { _ac.resume(); } catch (e) {} }
    return _ac || null;
  }
  function playSfx(url, volume, muffle, cutoff) {
    if (!url || BM.isMuted()) return;
    volume = Math.max(0, Math.min(1, volume));
    if (volume <= 0) return;
    if (muffle) {
      var ctx = audioCtx();
      if (ctx) {
        try {
          var a = new Audio(url);
          var src = ctx.createMediaElementSource(a);
          var lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = cutoff || 378; lp.Q.value = 0.7;
          var g = ctx.createGain(); g.gain.value = volume;
          src.connect(lp); lp.connect(g); g.connect(ctx.destination);
          a.addEventListener('ended', function () { try { src.disconnect(); lp.disconnect(); g.disconnect(); } catch (e) {} });
          a.play().catch(function () {});
          return;
        } catch (e) { /* fall through to plain playback */ }
      }
    }
    try { var p = new Audio(url); p.volume = volume; p.play().catch(function () {}); } catch (e) {}
  }
  /** True while THIS player is browsing the shop — their combat SFX get muffled. */
  function amShopping() {
    var you = state.you;
    if (!you || !Array.isArray(you.members)) return !!state.shopOpen;
    var me = you.members.find(function (m) { return m.clientId === state.clientId; });
    return !!(me && me.shopping) || !!state.shopOpen;
  }

  // The running build, shown in the topbar. It goes in the subject line of every
  // patch-note email, so a tester can always read back which version they played.
  function showVersion(v) {
    var box = el('app-version');
    if (!box || !v) return;
    box.textContent = 'v' + v;
    box.setAttribute('aria-label', 'Version ' + v.split('.').join(' point '));
  }

  // ---------- setup ----------
  function boot() {
    BM.init({ onCommand: handleCommand, onBlindOn: blindGuide });
    registerBlindInfo();
    document.body.classList.add('on-landing');   // landing is the initial screen (CSS shows the left delve list)
    fetch('/api/meta').then(function (r) { return r.json(); }).then(function (meta) {
      state.meta = meta;
      fill('race', meta.races); fill('cls', meta.classes);
      buildIconPicker(meta.icons);
      if (meta.voice) BM.setGMVoice(meta.voice.enabled);   // ElevenLabs GM voice ("Ultron") when configured
      showVersion(meta.version);
    });
    loadTokens();   // character-art token gallery (manifest.json)
    var tsearch = el('token-search');
    if (tsearch) {
      tsearch.addEventListener('input', function () { buildTokenPicker(this.value); });
      // Enter in the token filter must NOT submit the create form (Josh: "hit
      // enter to search the avatar list and it moved past to skills"). It filters.
      tsearch.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') { e.preventDefault(); buildTokenPicker(this.value); if (BM.isOn()) BM.speak('Tokens filtered. Tab into the list to choose one.', 'urgent'); }
      });
    }
    // Speak race/class selections so a screen reader confirms the choice (Josh:
    // the select button still read "Human"/"Fighter" after he'd chosen otherwise).
    var raceSel = el('race'); if (raceSel) raceSel.addEventListener('change', function () { BM.speak('Race: ' + (this.options[this.selectedIndex] ? this.options[this.selectedIndex].text : this.value) + '.', 'urgent'); });
    var clsSel = el('cls'); if (clsSel) clsSel.addEventListener('change', function () { BM.speak('Class: ' + (this.options[this.selectedIndex] ? this.options[this.selectedIndex].text : this.value) + '.', 'urgent'); });
    el('start-delve').addEventListener('click', startDelve);
    el('create-form').addEventListener('submit', onCreate);
    el('skill-begin').addEventListener('click', confirmCharacter);
    el('skill-auto').addEventListener('click', resetSkills);
    el('lobby-start').addEventListener('click', startAdventure);
    // Consistent navigation: a Main-menu button on the lobby/pub, a cancel on
    // create, a back on skills (Tobias 2026-07-13: no way back from the pub).
    el('lobby-menu').addEventListener('click', function () { leaveToMenu('lobby-menu'); });
    var ccl = el('create-cancel'); if (ccl) ccl.addEventListener('click', function () { leaveToMenu('create'); });
    var skb = el('skills-back'); if (skb) skb.addEventListener('click', function () { showScreen('create'); BM.speak('Back to race and class.', 'event'); });
    // Two-press arm instead of native confirm() — confirm() isn't narrated and
    // traps VoiceOver focus (poker replaced it for the same reason).
    var retreatArm = 0;
    el('retreat-btn').addEventListener('click', function () {
      var b = el('retreat-btn'), now = Date.now();
      if (now - retreatArm < 5000) { retreatArm = 0; b.textContent = '🏳️ Retreat'; doRetreat(); return; }
      retreatArm = now;
      b.textContent = '🏳️ Press again to confirm';
      BM.speak('Retreat? The run ends for the whole party; you keep the gold. Press again to confirm.', 'urgent');
      setTimeout(function () { if (Date.now() - retreatArm >= 5000) b.textContent = '🏳️ Retreat'; }, 5200);
    });
    el('shop-btn').addEventListener('click', openShop);
    el('shop-close').addEventListener('click', closeShop);
    var ssearch = el('shop-search');
    if (ssearch) {
      ssearch.addEventListener('input', function () { state.shopQuery = this.value; renderShop(); });
      // Enter FILTERS — it must never submit anything or jump the player elsewhere
      // (the same trap Josh hit in the avatar search).
      ssearch.addEventListener('keydown', function (e) {
        if (e.key !== 'Enter') return;
        e.preventDefault();
        state.shopQuery = this.value; renderShop();
        var n = shopFiltered().length;
        BM.speak(n + ' ware' + (n === 1 ? '' : 's') + ' match. Press Escape for the shop menu to hear them.', 'urgent');
      });
    }
    // Chat prompt: play via typed commands (same grammar as voice); questions
    // route to the LLM GM when that layer lands.
    function sendChat() {
      var inp = el('chat-input'); var t = (inp.value || '').trim();
      if (!t) return;
      inp.value = '';
      appendLog('› ' + t, 'event');
      handleCommand(t.toLowerCase());
    }
    el('chat-send').addEventListener('click', sendChat);
    el('chat-input').addEventListener('keydown', function (e) {
      if (e.key === 'Enter') { e.preventDefault(); sendChat(); if (BM.isOn()) { e.target.blur(); BM.speak('Sent. Back to combat keys.', 'urgent'); } }
      if (e.key === 'Escape') { e.preventDefault(); e.target.value = ''; e.target.blur(); if (BM.isOn()) BM.speak('Chat cancelled.', 'urgent'); }
    });
    // Push-to-talk for EVERYONE (not just blind mode): hold the mic, speak a command.
    var pm = el('ptt-main');
    pm.addEventListener('pointerdown', function (e) { e.preventDefault(); BM.ptt.start(); });
    pm.addEventListener('pointerup', function (e) { e.preventDefault(); BM.ptt.stop(); });
    pm.addEventListener('pointerleave', function () { BM.ptt.stop(); });
    window.addEventListener('beforeunload', function () {
      if (state.clientId && navigator.sendBeacon) navigator.sendBeacon('/api/session/leave', JSON.stringify({ clientId: state.clientId }));
    });
    // Accounts: sign in / auto-resume + one-click "previous player" buttons.
    el('signin-btn').addEventListener('click', doSignIn);
    el('pw').addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); doSignIn(); } });
    renderAccountPicker();   // show remembered players immediately
    // Auto-restore the most-recent remembered player so Resume/Rejoin work right
    // away after a reload — no manual sign-in click first (fills name + token).
    try {
      var _accts = JSON.parse(localStorage.getItem('pgmAccounts') || '[]');
      if (_accts.length && _accts[0].token) signInWithToken(_accts[0].token);
    } catch (e) {}
    connectSSE(null);
    setTimeout(function () { blindGuide(); }, 400);   // context-aware onboarding for blind users (no-op with speech off)
  }

  // Blind onboarding: a SHORT, context-aware nudge toward the next step — spoken
  // when blind mode turns on and on first load in blind mode. NOT a wall of keys
  // (Tobias 2026-07-13). Question mark teaches keys on demand; each screen
  // narrates itself as you go. (BM.speak is silent when blind mode is off.)
  function blindGuide() {
    var mode = state.mode || 'landing';
    // Every screen points to Escape — the one stable, key-driven action hub, so a
    // blind player never has to Tab around to find a button (Josh 2026-07-14).
    if (mode === 'game') { BM.speak('You are in the dungeon. I narrate every turn — just listen, and act on your turn with the number keys. Press Escape for the menu: descend, shop, retreat. Press A to repeat, question mark to learn the keys.', 'event'); return; }
    if (mode === 'lobby') { BM.speak('You are in the lobby. Press Escape for the menu — Start the adventure, add a companion, or the main menu. Press H to hear your party. Press A to repeat.', 'event'); return; }
    if (mode === 'create' || mode === 'skills') { BM.speak('Building your character. Tab through the fields; the last button moves you on. Press A to repeat.', 'event'); return; }
    // landing
    var accts = [];
    try { accts = JSON.parse(localStorage.getItem('pgmAccounts') || '[]'); } catch (e) {}
    var who = accts.length ? ('Welcome back, ' + accts[0].name + '. ') : 'Welcome to Personal Game Master. ';
    BM.speak(who + 'Press Escape for the menu — start your own delve, or join an active one. Or type your name in the field to begin. Press A to repeat, question mark for the keys.', 'event');
  }

  function fill(id, items) {
    var sel = el(id); sel.innerHTML = '';
    items.forEach(function (v) { var o = document.createElement('option'); o.value = v; o.textContent = cap(v); sel.appendChild(o); });
    if (id === 'cls') sel.value = 'fighter';
  }
  // Real names for the icon emoji so a screen reader announces what each is
  // (Josh 2026-07-13: "icons are unlabeled, just choosing a random one").
  var ICON_LABELS = {
    '🧙': 'wizard', '🧝': 'elf', '🛡️': 'shield', '⚔️': 'crossed swords', '🏹': 'bow and arrow',
    '🗡️': 'dagger', '🪓': 'axe', '🔮': 'crystal ball', '🐉': 'dragon', '🐺': 'wolf',
    '🦅': 'eagle', '💀': 'skull', '👑': 'crown', '🎭': 'theater masks', '🕯️': 'candle', '⚗️': 'alembic',
  };
  function iconLabelOf(ic, i) { return ICON_LABELS[ic] || ('icon ' + (i + 1)); }
  function buildIconPicker(icons) {
    var box = el('icon-picker'); box.innerHTML = '';
    (icons || []).forEach(function (ic, i) {
      var b = document.createElement('button');
      var label = iconLabelOf(ic, i);
      b.type = 'button'; b.setAttribute('role', 'radio'); b.setAttribute('aria-checked', String(i === 0));
      // include the selection state in the label too — some screen readers don't
      // reliably speak aria-checked on custom radios (Josh feedback).
      b.setAttribute('aria-label', label + (i === 0 ? ', selected' : '')); b.title = label; b.dataset.label = label;
      b.textContent = ic;
      b.addEventListener('click', function () { selectIcon(ic, b); });
      box.appendChild(b);
      if (i === 0) state.icon = ic;
    });
  }
  function selectIcon(ic, btn) {
    state.icon = ic;
    [].forEach.call(el('icon-picker').children, function (b) {
      var on = b === btn; b.setAttribute('aria-checked', String(on));
      b.setAttribute('aria-label', b.dataset.label + (on ? ', selected' : ''));
    });
    BM.speak('Icon: ' + (btn.dataset.label || ic) + ', selected.', 'event');
  }

  // ── Character TOKEN picker (player art, Tobias 2026-07-13) ──
  function loadTokens() {
    fetch('/tokens/manifest.json').then(function (r) { return r.json(); }).then(function (list) {
      state.tokens = Array.isArray(list) ? list : [];
      if (!state.charToken && state.tokens.length) state.charToken = state.tokens[Math.floor(Math.random() * state.tokens.length)].file;  // default art so heroes always have a token
    }).catch(function () { state.tokens = []; });
  }
  function buildTokenPicker(filter) {
    var box = el('token-picker'); if (!box) return;
    var toks = state.tokens || [];
    var f = (filter || '').trim().toLowerCase();
    if (f) toks = toks.filter(function (t) { return t.label.toLowerCase().indexOf(f) >= 0 || t.file.toLowerCase().indexOf(f) >= 0; });
    var shown = toks.slice(0, 240);
    box.innerHTML = '';
    if (!shown.length) { box.innerHTML = '<p class="delve-empty">No tokens match — clear the filter.</p>'; return; }
    shown.forEach(function (t) {
      var b = document.createElement('button');
      b.type = 'button'; b.className = 'token-opt' + (state.charToken === t.file ? ' sel' : '');
      b.setAttribute('role', 'radio'); b.setAttribute('aria-checked', String(state.charToken === t.file));
      b.setAttribute('aria-label', t.label); b.title = t.label; b.dataset.tok = t.file;
      b.innerHTML = '<img src="/tokens/' + t.file + '" alt="" loading="lazy" />';
      b.addEventListener('click', function () { selectToken(t.file); });
      box.appendChild(b);
    });
  }
  function selectToken(file) {
    state.charToken = file;
    [].forEach.call(el('token-picker').querySelectorAll('.token-opt'), function (b) {
      var on = b.dataset.tok === file; b.classList.toggle('sel', on); b.setAttribute('aria-checked', String(on));
    });
    var t = (state.tokens || []).find(function (x) { return x.file === file; });
    BM.speak('Token: ' + (t ? t.label : file) + '.', 'event');
  }

  // ---------- SSE ----------
  function connectSSE(clientId) {
    if (state.es) { try { state.es.close(); } catch (e) {} }
    try {
      var url = '/api/session/stream' + (clientId ? '?clientId=' + encodeURIComponent(clientId) : '');
      var es = new EventSource(url); state.es = es;
      es.addEventListener('state', function (e) { try { onState(JSON.parse(e.data)); } catch (err) {} });
    } catch (e) { BM.toast('Live updates unavailable in this browser.'); }
  }

  function onState(payload) {
    state.sessions = payload.sessions || [];
    renderSideWindow(state.sessions);
    state.you = payload.you;
    if (!state.you) return;
    state.myId = state.you.yourMemberId || state.clientId;
    if (state.you.phase === 'playing' && state.you.run) {
      if (state.mode !== 'game') enterGame();
      renderGame(state.you);
    } else if (state.you.phase === 'pub') {
      if (state.mode !== 'lobby') { showScreen('lobby'); BM.speakGM('Welcome back to the Swashgoblin. Rest, resupply, and raise your dead.'); }
      renderLobby(state.you);
      renderPub(state.you);
    } else if (state.mode === 'lobby') {
      renderLobby(state.you);
    }
  }

  // ---------- side window (all delves) ----------
  // Rendered into BOTH the right dock and the left landing panel (Tobias
  // 2026-07-13: use the empty left margin to join/spectate from the landing).
  function renderSideWindow(sessions) {
    fillDelveList(el('delve-list'), sessions);
    var left = el('delve-list-left'); if (left) fillDelveList(left, sessions);
  }
  function fillDelveList(box, sessions) {
    box.innerHTML = '';
    if (!sessions.length) { box.innerHTML = '<p class="delve-empty">No active delves. Start one!</p>'; return; }
    sessions.forEach(function (s) {
      var card = document.createElement('div'); card.className = 'delve-card';
      var heroes = (s.heroes || []).map(function (h) {
        var hp = (h.hp != null) ? ' ' + h.hp + '/' + h.maxHp : '';
        return '<span class="dh' + (h.down ? ' down' : '') + '">' + h.icon + ' ' + esc(h.name) + hp + '</span>';
      }).join('');
      var mins = Math.floor(s.elapsedSec / 60), secs = s.elapsedSec % 60;
      var time = mins + 'm ' + (secs < 10 ? '0' : '') + secs + 's';
      var meta = s.phase === 'playing'
        ? ('Depth ' + s.depth + ' · Rd ' + s.round + ' · ' + s.partySize + ' in party · ' + time)
        : ('Forming · ' + s.partySize + ' joined · ' + time);
      var canAct = !state.clientId;
      // You may delete a delve you OWN (its host is your account).
      var mine = !!(s.hostAccount && state.account && state.account.trim().toLowerCase() === s.hostAccount);
      var nm = esc(s.name);
      var joinWord = s.phase === 'lobby' ? 'Join' : 'Rejoin';
      var actions = canAct
        ? '<div class="dactions">'
          + '<button data-join="' + s.id + '" aria-label="' + joinWord + ' the delve ' + nm + '">' + joinWord + '</button>'
          + '<button data-watch="' + s.id + '" aria-label="Watch the delve ' + nm + '">Watch</button>'
          + (mine ? '<button class="del-btn ghost-btn" data-del="' + s.id + '" aria-label="Delete the delve ' + nm + '">🗑 Delete</button>' : '') + '</div>'
        : '';
      card.innerHTML = '<div class="dtitle"><span>' + esc(s.name) + '</span><span class="dphase">' + s.phase + '</span></div>'
        + '<div class="dmeta">' + meta + '</div>'
        + '<div class="delve-heroes">' + heroes + '</div>' + actions;
      box.appendChild(card);
    });
    if (!state.clientId) {
      box.querySelectorAll('[data-join]').forEach(function (b) { b.addEventListener('click', function () { joinDelveAs(b.getAttribute('data-join'), 'player'); }); });
      box.querySelectorAll('[data-watch]').forEach(function (b) { b.addEventListener('click', function () { joinDelveAs(b.getAttribute('data-watch'), 'spectator'); }); });
      box.querySelectorAll('[data-del]').forEach(function (b) {
        var armed = 0;
        b.addEventListener('click', function () {
          var now = Date.now();
          if (now - armed < 5000) { deleteDelveById(b.getAttribute('data-del')); return; }
          armed = now; b.textContent = '🗑 Confirm delete?';
          BM.speak('Delete this delve permanently? Press again to confirm.', 'urgent');
          setTimeout(function () { if (Date.now() - armed >= 5000) b.textContent = '🗑 Delete'; }, 5200);
        });
      });
    }
  }
  function deleteDelveById(id) {
    api('/api/session/delete', { clientId: state.clientId, sessionId: id, token: state.token }).then(function (r) {
      BM.speak(r.ok ? 'Delve deleted.' : (r.error || 'Could not delete that delve.'), 'urgent');
      BM.toast(r.ok ? 'Delve deleted.' : (r.error || 'Could not delete.'));
    });
  }

  function requireName() {
    var name = el('handle').value.trim();
    if (!name) { el('join-error').textContent = 'Enter a name first.'; BM.speak('Enter a name first.', 'urgent'); el('handle').focus(); return null; }
    return name;
  }

  // ---------- start / join a delve ----------
  // ── Your characters: 1-click back into the game (Tobias 2026-07-11) ──
  function renderCharList(me) {
    var box = el('char-list'); if (!box) return;
    var chars = me.characters || [];
    var delves = me.delves || [];
    if (!chars.length && !delves.length) { box.hidden = true; return; }
    box.hidden = false;
    box.innerHTML = '<h3>Your characters</h3>';
    chars.forEach(function (c) {
      var live = delves.find(function (d) { return d.phase !== 'lobby' && d.heroName.toLowerCase() === c.charName.toLowerCase(); });
      var b = document.createElement('button');
      b.type = 'button'; b.className = 'char-card';
      b.textContent = (live ? '\u25B6 Resume ' : '\u2694\uFE0F Play ') + c.charName + ' \u2014 ' + cap(c.race) + ' ' + cap(c.cls)
        + (live ? ' (in "' + live.delveName + '")' : '');
      b.addEventListener('click', function () { quickPlay(c, live); });
      box.appendChild(b);
    });
    var nb = document.createElement('button');
    nb.type = 'button'; nb.className = 'char-card new';
    nb.textContent = '\u2795 Create a new character';
    nb.addEventListener('click', function () { startDelve(); });
    box.appendChild(nb);
  }
  function quickPlay(c, live) {
    if (live) {   // reclaim the live seat
      state.icon = state.icon || null;
      joinDelveAs(live.sessionId, 'player');
      return;
    }
    // Fresh delve with this character, default skills — straight to the lobby.
    api('/api/session/create', { name: c.charName, icon: state.icon, delveName: el('delve-name').value.trim(), token: state.token }).then(function (r) {
      if (!r.ok) return BM.speak(r.error || 'Could not start.', 'urgent');
      afterJoin(r, 'player');
      api('/api/session/character', { clientId: state.clientId, race: c.race, cls: c.cls, token: c.token || null }).then(function (r2) {
        if (!r2.ok) return BM.speak(r2.error || 'Could not ready the character.', 'urgent');
        state.you = r2.snapshot; showScreen('lobby'); renderLobby(r2.snapshot);
        BM.speak(c.charName + ' the ' + c.race + ' ' + c.cls + ' is ready. Add companions, then start the adventure.', 'event');
      });
    });
  }
  // ── Remembered players (one-click login, Tobias 2026-07-12) ──
  function remembered() {
    var list = [];
    try { list = JSON.parse(localStorage.getItem('pgmAccounts') || '[]'); } catch (e) {}
    // migrate the legacy single-token key
    try {
      var old = localStorage.getItem('pgmToken');
      if (old && !list.some(function (a) { return a.token === old; })) { list.unshift({ name: state.account || '', token: old }); }
      localStorage.removeItem('pgmToken');
    } catch (e) {}
    return list.filter(function (a) { return a && a.token; });
  }
  function rememberAccount(name, token) {
    var list = remembered().filter(function (a) { return a.name.toLowerCase() !== String(name).toLowerCase() && a.token !== token; });
    list.unshift({ name: name, token: token });
    try { localStorage.setItem('pgmAccounts', JSON.stringify(list.slice(0, 8))); } catch (e) {}
  }
  function forgetAccount(token) {
    var list = remembered().filter(function (a) { return a.token !== token; });
    try { localStorage.setItem('pgmAccounts', JSON.stringify(list)); } catch (e) {}
  }
  function renderAccountPicker() {
    var box = el('account-picker'); if (!box) return;
    var list = remembered();
    if (!list.length) { box.hidden = true; return; }
    box.hidden = false;
    box.innerHTML = '<h3>Welcome back — pick your player</h3>';
    list.forEach(function (a) {
      var b = document.createElement('button');
      b.type = 'button'; b.className = 'account-btn';
      b.innerHTML = '<span>' + String.fromCodePoint(0x25B6) + ' ' + esc(a.name || 'Player') + '</span>';
      b.addEventListener('click', function () { signInWithToken(a.token); });
      var x = document.createElement('button');
      x.type = 'button'; x.className = 'account-forget'; x.title = 'Forget this player on this device';
      x.textContent = String.fromCharCode(215);
      x.addEventListener('click', function (e) { e.stopPropagation(); forgetAccount(a.token); renderAccountPicker(); });
      var row = document.createElement('div'); row.className = 'account-row';
      row.appendChild(b); row.appendChild(x); box.appendChild(row);
    });
  }
  function signInWithToken(token) {
    api('/api/auth/me', { token: token }).then(function (r) {
      if (!r.ok) { forgetAccount(token); renderAccountPicker(); BM.toast('That player is no longer recognized — sign in again.'); return; }
      state.token = token; state.account = r.name;
      el('handle').value = r.name;
      el('signin-status').textContent = 'Playing as ' + r.name;
      if (r.character) state.rememberedBuild = r.character;
      rememberAccount(r.name, token);   // refresh position + name
      renderCharList(r);
      var live = (r.delves || []).filter(function (d) { return d.phase !== 'lobby'; });
      var msg = 'Welcome back, ' + r.name + '.'
        + ((r.characters || []).length ? ' Pick a character to play.' : ' Create a character to begin.')
        + (live.length ? ' ' + live.length + ' delve' + (live.length === 1 ? '' : 's') + ' waiting.' : '');
      BM.speak(msg, 'urgent'); BM.toast(msg);
      el('char-list').scrollIntoView && el('char-list').scrollIntoView({ block: 'nearest' });
    });
  }
  function doSignIn() {
    var name = el('handle').value.trim(); var pw = el('pw').value;
    if (!name) { BM.speak('Enter your name first.', 'urgent'); el('handle').focus(); return; }
    api('/api/auth/signin', { name: name, password: pw }).then(function (r) {
      if (!r.ok) { el('signin-status').textContent = r.error; BM.speak(r.error, 'urgent'); return; }
      state.token = r.token; state.account = r.name;
      rememberAccount(r.name, r.token);   // one-click button next time
      renderAccountPicker();
      if (r.character) state.rememberedBuild = r.character;
      var msg = (r.created ? 'Player created. ' : '') + 'Signed in as ' + r.name + ' — one click to return next time.';
      el('signin-status').textContent = 'Playing as ' + r.name;
      el('pw').value = '';
      api('/api/auth/me', { token: r.token }).then(function (me) { if (me.ok) renderCharList(me); });
      BM.speak(msg, 'urgent'); BM.toast(msg);
    });
  }
  function startDelve() {
    var name = requireName(); if (!name) return;
    api('/api/session/create', { name: name, icon: state.icon, delveName: el('delve-name').value.trim(), token: state.token }).then(function (r) {
      if (!r.ok) return BM.speak(r.error || 'Could not start.', 'urgent');
      afterJoin(r, 'player'); enterCreate();
    });
  }
  function joinDelveAs(sessionId, role) {
    // A signed-in player rejoins under their account even if the name field is
    // blank (Tobias 2026-07-13: rejoin failed with "enter a name" after a reload,
    // since the seat is reclaimed by account token anyway).
    var name = el('handle').value.trim() || state.account || '';
    if (!name) { el('join-error').textContent = 'Enter a name first.'; BM.speak('Enter a name first.', 'urgent'); el('handle').focus(); return; }
    api('/api/session/join', { sessionId: sessionId, name: name, icon: state.icon, role: role, token: state.token }).then(function (r) {
      if (!r.ok) { el('join-error').textContent = r.error + (r.canSpectate ? ' (You can watch instead.)' : ''); BM.speak(r.error, 'urgent'); return; }
      afterJoin(r, r.role);
      if (r.reclaimed) { BM.speak('Welcome back — resuming your seat.', 'event'); return; }   // SSE routes to the live game/pub
      if (r.role === 'player') enterCreate();
      else { showScreen('lobby'); state.you = r.snapshot; renderLobby(r.snapshot); BM.speak('You are watching ' + r.snapshot.name + '.', 'event'); }
    });
  }
  function afterJoin(r, role) {
    state.clientId = r.clientId; state.sessionId = r.sessionId; state.role = role; state.you = r.snapshot;
    connectSSE(r.clientId);         // reconnect SSE so we receive our delve detail
  }

  // ---------- create character ----------
  function enterCreate() {
    if (state.rememberedBuild) {
      try {
        el('race').value = state.rememberedBuild.race;
        el('cls').value = state.rememberedBuild.cls;
        BM.speak('Your last build is prefilled: ' + state.rememberedBuild.race + ' ' + state.rememberedBuild.cls + '. Change it or continue.', 'event');
      } catch (e) {}
    }
    showScreen('create');
    var nf = el('name').closest('.field'); if (nf) nf.hidden = true;
    if (state.rememberedBuild && state.rememberedBuild.token) state.charToken = state.rememberedBuild.token;
    buildTokenPicker(el('token-search') ? el('token-search').value : '');   // render the token gallery
    BM.speak('Choose your race and class, pick your token, then your skills.', 'event');
  }
  function onCreate(e) {
    e.preventDefault();
    state.charInput = { name: el('handle').value.trim(), race: el('race').value, cls: el('cls').value };
    api('/api/character/plan', state.charInput).then(function (plan) {
      state.plan = plan; state.selected = new Set(plan.smartDefault); showScreen('skills'); renderSkillStep();
    });
  }
  function confirmCharacter() {
    api('/api/session/character', Object.assign({}, state.charInput, { clientId: state.clientId, skills: Array.from(state.selected), token: state.charToken || null })).then(function (r) {
      if (!r.ok) return BM.speak(r.error || 'Could not confirm.', 'urgent');
      state.you = r.snapshot; showScreen('lobby'); renderLobby(r.snapshot);
      BM.speak('Character confirmed. You are in the lobby' + (r.snapshot.youAreHost ? ' as host. Add AI companions or start.' : '.'), 'event');
    });
  }

  // ---------- skills (unchanged logic) ----------
  function renderSkillStep() {
    renderSkillList(); updatePoints();
    var pts = state.plan.points;
    BM.speak('You have ' + pts + ' skill ' + plural(pts, 'point') + '. Suggested skills are selected, including Perception. Say confirm when ready, or toggle a skill.', 'event');
  }
  function renderSkillList() {
    var list = el('skill-list'); list.innerHTML = '';
    state.plan.skills.forEach(function (s, i) {
      var on = state.selected.has(s.key);
      var b = document.createElement('button'); b.type = 'button'; b.setAttribute('aria-pressed', String(on)); b.dataset.key = s.key;
      var mod = (s.trainedMod >= 0 ? '+' : '') + s.trainedMod;
      b.innerHTML = '<span class="chk">' + (on ? '✓' : '○') + '</span><span>' + (i + 1) + '. ' + esc(s.name)
        + (s.classSkill ? ' <span class="star">★</span>' : '') + (s.trainedOnly ? ' <span class="locked">(trained)</span>' : '')
        + '</span><span class="smod">' + mod + '</span>';
      b.setAttribute('aria-label', s.name + (s.classSkill ? ', class skill' : '') + ', bonus if trained ' + mod + (on ? ', selected' : ', not selected'));
      b.addEventListener('click', function () { toggleSkill(s.key); });
      list.appendChild(b);
    });
  }
  function toggleSkill(key, silent) {
    var s = state.plan.skills.find(function (x) { return x.key === key; }); if (!s) return;
    if (state.selected.has(key)) { state.selected.delete(key); if (!silent) BM.speak(s.name + ' deselected.', 'urgent'); }
    else { if (state.selected.size >= state.plan.points) return BM.speak('No skill points left. Deselect one first.', 'urgent');
      state.selected.add(key); if (!silent) BM.speak(s.name + ' selected.', 'urgent'); }
    var b = el('skill-list').querySelector('button[data-key="' + key + '"]');
    if (b) { var on = state.selected.has(key); b.setAttribute('aria-pressed', String(on)); b.querySelector('.chk').textContent = on ? '✓' : '○'; }
    updatePoints();
  }
  function updatePoints() { el('skill-points').textContent = 'Points remaining: ' + (state.plan.points - state.selected.size) + ' of ' + state.plan.points; }
  function resetSkills() { state.selected = new Set(state.plan.smartDefault); renderSkillList(); updatePoints(); BM.speak('Reset to suggested.', 'urgent'); }

  // ---------- lobby ----------
  function renderLobby(you) {
    el('lobby-name').textContent = you.name;
    el('players-count').textContent = you.counts.party;
    el('spectators-count').textContent = you.counts.spectators;
    var me = you.members.find(function (m) { return m.isYou; }) || you.spectators.find(function (s) { return s.isYou; });
    el('lobby-you').textContent = (you.role === 'spectator' ? 'Watching as ' : 'You are ') + (me ? me.icon + ' ' + me.name : '') + (you.youAreHost ? ' (host)' : '') + '.';

    var pl = el('players-list'); pl.innerHTML = '';
    var raiseSvc = ((you.pub && you.pub.services) || []).find(function (s) { return s.kind === 'raise'; });
    you.members.forEach(function (m) {
      var li = document.createElement('li');
      var meta = m.ready ? (cap(m.race || '') + ' ' + cap(m.cls || '')) : 'choosing…';
      // A DEAD member shows a Raise button — with the cost — right on their card
      // (only at the pub, only when actually dead; Tobias 2026-07-13).
      var raiseBtn = '';
      if (you.phase === 'pub' && m.dead && you.role === 'player' && raiseSvc) {
        raiseBtn = '<button class="raise-btn" data-raise="' + esc(m.name) + '" title="Hire a cleric to Raise Dead — +2 negative levels (PF1)">⚰️ Raise — ' + raiseSvc.gp + 'g</button>';
      }
      var status = m.dead ? '<span class="rmeta dead">💀 DEAD</span>' : ('<span class="rmeta ' + (m.ready ? 'ready' : 'waiting') + '">' + (m.ready ? '✓ ' + esc(meta) + (m.negLevels ? ' · ' + m.negLevels + ' neg' : '') : '…choosing') + '</span>');
      // Decorative icon hidden from the screen reader so it reads the NAME, not
      // "alembic" (Josh 2026-07-14: "⚗️ Josh… it aint my name").
      li.innerHTML = '<span class="ricon" aria-hidden="true">' + m.icon + '</span><span>' + esc(m.name) + (m.isYou ? ' (you)' : '') + (m.ai ? ' (AI)' : '') + '</span>' + status + raiseBtn;
      pl.appendChild(li);
    });
    pl.querySelectorAll('[data-raise]').forEach(function (b) {
      b.addEventListener('click', function () { pubBuyService('raisedead', b.getAttribute('data-raise')); });
    });
    var sl = el('spectators-list'); sl.innerHTML = '';
    you.spectators.forEach(function (s) {
      var li = document.createElement('li');
      li.innerHTML = '<span class="ricon">' + s.icon + '</span><span>' + esc(s.name) + (s.isYou ? ' (you)' : '') + '</span>';
      sl.appendChild(li);
    });

    // Companion picker (host only, lobby only, room in party)
    var ca = el('companions-area');
    var canAdd = you.youAreHost && you.phase === 'lobby' && you.counts.party < you.counts.maxParty;
    ca.hidden = !canAdd;
    if (canAdd) buildCompanionPicker();

    var readyCount = you.members.filter(function (m) { return m.ready; }).length;
    el('lobby-start').hidden = !(you.role === 'player' && you.phase === 'lobby' && readyCount >= 1);
    el('lobby-wait').textContent = you.phase !== 'lobby' ? 'The adventure has begun.'
      : (readyCount === 0 ? 'Waiting for a ready adventurer…' : (you.role === 'spectator' ? 'Waiting for the party…' : ''));
  }

  function buildCompanionPicker() {
    var box = el('companion-picker');
    if (box.dataset.built) return;                     // build once
    box.dataset.built = '1';
    box.innerHTML = '';
    var sel = document.createElement('select');
    sel.id = 'companion-select';
    sel.setAttribute('aria-label', 'Choose an AI companion from the cast');
    (state.meta.companions || []).forEach(function (c) {
      var o = document.createElement('option');
      o.value = c.name;
      o.textContent = c.icon + ' ' + c.name + ' — ' + cap(c.race).replace(/_/g, ' ') + ' ' + cap(c.cls);
      sel.appendChild(o);
    });
    var add = document.createElement('button'); add.type = 'button'; add.textContent = '+ Add to party';
    add.addEventListener('click', function () { addCompanion(sel.value); });
    box.appendChild(sel); box.appendChild(add);
  }
  function addCompanion(name) {
    api('/api/session/companion', { clientId: state.clientId, name: name }).then(function (r) {
      if (!r.ok) BM.speak(r.error || 'Could not add companion.', 'urgent');
      else BM.speak(name + ' joins the party.', 'urgent');
    });
  }
  // --- THE SWASHGOBLIN: the adventurers' pub between delves ---
  function renderPub(you) {
    el('lobby-name').textContent = '🍺 The Swashgoblin: ' + you.name;
    var box = el('pub-panel');
    if (!box) {
      box = document.createElement('div');
      box.id = 'pub-panel';
      box.setAttribute('aria-label', 'The Swashgoblin');
      // Insert ABOVE the actions row. #lobby-start lives inside .lobby-actions, so
      // it is NOT a direct child of #lobby — inserting before it threw NotFoundError
      // and aborted the whole pub render (no services, no "Set out again" button).
      var actions = el('lobby').querySelector('.lobby-actions');
      if (actions) el('lobby').insertBefore(box, actions); else el('lobby').appendChild(box);
    }
    var pub = you.pub || { gold: 0, services: [], dead: [], hurt: [], stash: {}, corpses: [] };
    var html = '<h3>🍺 The Swashgoblin</h3>'
      + '<p id="pub-gold" aria-live="polite">Party purse: <strong>' + pub.gold + ' gold</strong>.'
      + (pub.dead.length ? ' Hauled in like luggage: ' + pub.dead.map(esc).join(', ') + '.' : '')
      + ((pub.corpses || []).length ? ' Recovered from the deep: ' + pub.corpses.map(function (c2) { return esc(c2.name) + ' of “' + esc(c2.delve) + '”'; }).join(', ') + '.' : '')
      + (pub.hurt.length ? ' Weakened: ' + pub.hurt.map(function (h) { return esc(h.name) + ' (' + h.negLevels + ' neg)'; }).join(', ') + '.' : '') + '</p>';
    html += '<div class="pub-services">';
    pub.services.forEach(function (svc) {
      if (svc.kind === 'stash') {
        html += '<button data-svc="' + svc.key + '">' + esc(svc.label) + ' - ' + svc.gp + 'g</button>';
      } else if (svc.kind === 'restoration') {
        pub.hurt.forEach(function (h) { html += '<button data-svc="' + svc.key + '" data-target="' + esc(h.name) + '">Restoration: ' + esc(h.name) + ' - ' + svc.gp + 'g</button>'; });
      } else if (svc.kind === 'raise') {
        // Party dead get their Raise button ON THEIR CARD (see renderLobby). Here
        // only recovered CORPSES from other delves (not roster members) are offered.
        var tag = svc.usingComponent ? ' (using your diamond)' : '';
        (pub.corpses || []).forEach(function (c2) { html += '<button data-svc="' + svc.key + '" data-target="' + esc(c2.name) + '">Raise ' + esc(c2.name) + ' of “' + esc(c2.delve) + '” - ' + svc.gp + 'g' + tag + '</button>'; });
      }
    });
    html += '</div>';
    var sv = pub.stashView || [];
    if (sv.length) {
      html += '<h4>Party stash</h4><div class="pub-stash">';
      sv.forEach(function (it) {
        html += '<span class="stash-item">' + esc(it.name) + ' ×' + it.qty
          + (it.sellGp ? ' <button data-sell="' + it.key + '">Sell ' + it.sellGp + 'g</button>' : '') + '</span> ';
      });
      html += '</div>';
    }
    box.innerHTML = html;
    box.querySelectorAll('[data-sell]').forEach(function (b) {
      b.addEventListener('click', function () {
        api('/api/pub/sell', { clientId: state.clientId, item: b.getAttribute('data-sell') })
          .then(function (r) {
            BM.speak(r.ok ? (r.text || 'Sold.') : (r.error || 'No sale.'), 'urgent');
            if (r.ok && r.snapshot) { state.you = r.snapshot; renderLobby(r.snapshot); renderPub(r.snapshot); }
          });
      });
    });
    box.querySelectorAll('[data-svc]').forEach(function (b) {
      b.addEventListener('click', function () { pubBuyService(b.getAttribute('data-svc'), b.getAttribute('data-target') || undefined); });
    });
    el('lobby-start').hidden = false;
    el('lobby-start').textContent = '⚔️ Set out again';
    el('lobby-wait').textContent = '';   // clear the "adventure has begun" clutter renderLobby left
  }

  // Buy a Swashgoblin service (restoration / raise / stash). Plays the returned
  // SFX — e.g. the Breath of Life clip when a dead adventurer is raised.
  function pubBuyService(service, target) {
    api('/api/pub/buy', { clientId: state.clientId, service: service, target: target || undefined }).then(function (r) {
      if (r.ok && r.sound) playSfx(r.sound, 0.7, false);
      BM.speak(r.ok ? (r.text || 'Done.') : (r.error || 'The barkeep shrugs.'), 'urgent');
      if (r.ok && r.snapshot) { state.you = r.snapshot; renderLobby(r.snapshot); renderPub(r.snapshot); }
    });
  }

  function startAdventure() {
    api('/api/session/start', { clientId: state.clientId }).then(function (r) { if (!r.ok) BM.speak(r.error || 'Cannot start yet.', 'urgent'); });
  }
  // Leave the current delve and return to the landing/main menu. The delve is
  // SAVED (resumable from the delve list), so this just detaches you.
  function leaveToMenu() {
    BM.speak('Returning to the main menu. This delve is saved — you can rejoin it from the list.', 'event');
    if (state.clientId) { try { api('/api/session/leave', { clientId: state.clientId }); } catch (e) {} }
    setTimeout(function () { location.reload(); }, 80);
  }

  // ---------- game ----------
  function enterGame() { showScreen('game'); document.body.classList.add('in-game'); el('log').innerHTML = ''; state.lastSeq = 0; state.speakFloor = null; state.lastAnnouncedTurn = null;
    BM.speak(state.role === 'spectator' ? 'The adventure begins. You are watching.' : 'The adventure begins!', 'urgent'); }

  function renderGame(you) {
    var run = you.run;
    el('hud-hero').textContent = you.name + ' — Room ' + (run.roomsCleared + 1) + ' · Rd ' + run.round;
    el('hud-enemy').textContent = ''; el('hud-gold').textContent = 'Gold: ' + run.gold;
    var myTurn = !!(run.turn && run.turn.ownerClientId === state.myId);
    var banner = el('turn-banner'); banner.className = 'turn-banner';
    if (run.phase === 'initiative') {
      banner.textContent = '🎲 Roll for initiative!'; banner.classList.add('mine');
    } else if (run.phase === 'combat') {
      if (run.turn) { if (myTurn) { banner.textContent = '▶ Your turn — act now!'; banner.classList.add('mine'); } else banner.textContent = 'Waiting for ' + run.turn.name + '…'; }
      else banner.textContent = 'Resolving…';
    } else if (run.phase === 'cleared') { banner.textContent = '✔ Room cleared — descend when ready.'; banner.classList.add('cleared'); }
    else if (run.phase === 'defeated') { banner.textContent = '☠ The party has fallen.'; banner.classList.add('defeated'); }
    else if (run.phase === 'retreated') { banner.textContent = '🏳️ The party has retreated — gold in hand.'; banner.classList.add('retreated'); }
    var rb = el('retreat-btn');
    if (rb) rb.hidden = !(state.role === 'player' && (run.phase === 'combat' || run.phase === 'cleared' || run.phase === 'initiative'));

    renderBattlefield(run);
    renderActionBar(run, myTurn);
    renderPartyPanel(run);
    renderLootPanel(run);
    // Keep the open shop's gold/affordability live as the party earns — but only
    // rebuild when gold actually changed, so a blind user's focus in the list is
    // not reset on every SSE tick.
    if (!el('shop-panel').hidden && ('Party gold: ' + (run.gold || 0)) !== el('shop-gold').textContent) renderShop();

    // On the FIRST snapshot after (re)joining, display the backlog but only
    // SPEAK the last few lines — replaying whole prior rooms aloud described
    // creatures that were no longer there (Tobias's accuracy bug).
    var log = run.log || [];
    if (state.speakFloor === null) {
      var maxSeq = log.length ? log[log.length - 1].seq : 0;
      state.speakFloor = Math.max(0, maxSeq - 3);
    }
    log.forEach(function (e) {
      if (e.seq > state.lastSeq) {
        state.lastSeq = e.seq; appendLog(e.text, e.priority);
        // A NEW ROOM begins → drop any stale narration still queued from the
        // last room so the GM speaks THIS room promptly (Tobias: cancel his
        // announcement when the party moves on).
        if (/^You enter /.test(e.text) && e.seq > state.speakFloor) BM.flushSpeech();
        if (e.sound === 'earcon:dice' && e.seq > state.speakFloor) diceEarcon();
        if (e.seq <= state.speakFloor) return;         // backlog: show, don't speak/play
        if (e.sound && e.sound.indexOf('earcon:') !== 0) {   // combat/spell SFX (poker's SND pools)
          // In the shop you've only stepped aside — the fight carries on and you
          // HEAR it, muffled through the wall (poker's dungeon:echo treatment).
          if (amShopping()) playSfx(e.sound, 0.55 * 0.5, true, 378);
          else playSfx(e.sound, 0.55, false);
        }
        if (e.priority === 'banter') {                 // companion quip -> their own voice
          BM.speakAs(e.text.replace(/^[^ ]+ /, ''), e.voiceId);
        } else if (e.priority === 'urgent') {          // GM narration -> Ultron voice (serialized queue)
          BM.speakGM(e.text);
          var a = el('announce'); if (a) a.textContent = e.text;
        } else { BM.speak(e.text, e.priority); }
      }
    });
    renderGameChoices(run, myTurn);
    if (run.phase === 'initiative') {
      var initKey = 'init-' + run.roomsCleared;
      if (state.lastAnnouncedTurn !== initKey) {
        state.lastAnnouncedTurn = initKey;
        BM.speak('The GM calls for initiative. Press 1 to roll.', 'urgent');
      }
    }
  }
  // Battlefield: enemies across the top, allies just under — INITIATIVE order
  // left→right (run.combatants is already initiative-sorted server-side).
  function renderBattlefield(run) {
    var rows = { enemy: el('enemy-row'), hero: el('ally-row') };
    rows.enemy.innerHTML = ''; rows.hero.innerHTML = '';
    run.combatants.forEach(function (c) {
      var d = document.createElement('div');
      var pct = (c.hpPct != null) ? c.hpPct : (c.maxHp ? Math.round(100 * c.hp / c.maxHp) : 0);
      // Enemies: bar only, quantized to 25% (no numbers). Heroes: bar + exact HP.
      var hpText = (c.side === 'enemy') ? '' : (c.down ? 'down' : c.hp + '/' + c.maxHp + ' HP');
      d.className = 'unit unit-' + c.side + (c.current ? ' current' : '') + (c.down ? ' down' : '') + (!c.down && pct <= 33 ? ' hurt' : '');
      d.innerHTML = (c.art ? '<img class="u-art" src="' + c.art + '" alt="" loading="lazy" />'
                          : '<div class="u-icon">' + (c.icon || (c.side === 'enemy' ? '👹' : '🛡️')) + '</div>')
        + '<div class="u-name">' + esc(c.name) + (c.ownerClientId === state.myId ? ' ✦' : '') + '</div>'
        + '<div class="u-hpbar" role="img" aria-label="' + (c.down ? 'down' : 'health ' + pct + ' percent') + '"><div style="width:' + pct + '%"></div></div>'
        + (hpText ? '<div class="u-hp">' + hpText + '</div>' : '')
        + '<div class="u-conds">' + esc((c.conditions || []).join(', ')) + '</div>';
      if (c.side === 'enemy' && !c.down) { d.style.cursor = 'pointer'; d.title = 'Click to attack / target'; d.addEventListener('click', function () {
        var atk = state.choices.find(function (x) { return x.id === 'attack' && x.target === c.id; });
        if (atk) doGameAction(atk);
        else { state.queuedTarget = c.id; BM.speak('Targeting ' + c.name + '.', 'urgent'); }
      }); }
      rows[c.summoned ? 'hero' : c.side].appendChild(d);   // summons fight for the party — show them with the allies
    });
  }

  // LEFT: party status panel (blind players browse it with P).
  function renderPartyPanel(run) {
    var box = el('party-status'); box.innerHTML = '';
    run.combatants.filter(function (c) { return c.side === 'hero'; }).forEach(function (c) {
      var pct = Math.max(0, Math.min(100, Math.round(100 * c.hp / c.maxHp)));
      var card = document.createElement('div');
      card.className = 'hero-card' + (c.current ? ' current' : '') + (c.down ? ' down' : '')
        + (pct <= 33 ? ' critical' : pct <= 66 ? ' hurt' : '');
      var slots = c.slots ? Object.entries(c.slots).map(function (kv) { return 'L' + kv[0] + '×' + kv[1]; }).join(' ') : '';
      card.innerHTML = '<div class="hc-name">' + (c.art ? '<img class="hc-art" src="' + c.art + '" alt="" loading="lazy" />' : (c.icon || '')) + ' ' + esc(c.name)
        + (c.ownerClientId === state.myId ? ' <span class="you">(you)</span>' : '') + (c.ai ? ' 🤖' : '') + '</div>'
        + '<div class="hpbar" role="img" aria-label="health ' + pct + ' percent"><div style="width:' + pct + '%"></div></div>'
        + (function () {
            if (c.xpInto == null || !c.xpSpan) return '';
            var xpP = Math.max(0, Math.min(100, Math.round(100 * c.xpInto / c.xpSpan)));
            return '<div class="xpbar" role="img" aria-label="experience ' + xpP + ' percent to next level" title="' + c.xpInto + ' / ' + c.xpSpan + ' XP to level ' + ((c.level || 1) + 1) + '"><div style="width:' + xpP + '%"></div></div>';
          })()
        + '<div class="hc-meta">' + (c.level ? 'L' + c.level + ' · ' : '') + (c.down ? 'DOWN' : c.hp + '/' + c.maxHp + ' HP') + ' · AC ' + c.ac + (slots ? ' · ' + slots : '') + '</div>'
        + ((c.conditions || []).length ? '<div class="hc-conds">' + esc(c.conditions.join(', ')) + '</div>' : '')
        + (c.shopping ? '<div class="hc-shopping">🛒 Shopping — turns passing</div>' : '')
        + (c.queued ? '<div class="hc-queued">⏳ queued: ' + esc(c.queued) + '</div>' : '');
      box.appendChild(card);
    });
  }

  // RIGHT: the PARTY LOOT PILE (leader sends / flags party property; flagged
  // items are take-at-will) + YOUR PACK (your own usable items).
  function lootAction(type, item, target) {
    api('/api/session/action', { clientId: state.clientId, action: type, item: item, target: target })
      .then(function (r) { if (!r.ok) BM.speak(r.error || 'Cannot.', 'urgent'); });
  }
  function myPack() { var h = myHero(); return (h && h.pack) || []; }
  function renderLootPanel(run) {
    el('gold-line').textContent = 'Gold: ' + (run.gold || 0);
    var box = el('bag-list'); box.innerHTML = '';
    var inv = run.inventory || [];
    var pack = myPack();
    var isHost = state.you && state.you.youAreHost;
    var myTurn = !!(run.turn && run.turn.ownerClientId === state.myId);
    var isPlayer = state.role === 'player';
    if (!inv.length && !pack.length) { box.innerHTML = '<p class="delve-empty">No loot yet.</p>'; return; }

    if (inv.length) {
      var ph = document.createElement('h4'); ph.textContent = 'Party pile'; box.appendChild(ph);
      var heroes = run.combatants.filter(function (c) { return c.side === 'hero' && !c.summoned; });
      inv.forEach(function (i) {
        var row = document.createElement('div'); row.className = 'bag-item' + (i.party ? ' is-party' : '');
        var btns = '';
        if (i.party && isPlayer) btns += '<button data-act="loot_take">Take</button>';
        if ((i.party || isHost) && isPlayer && i.sellGp) btns += '<button data-act="loot_sell" title="Sell for 50% of value into the party purse">Sell ' + i.sellGp + 'g</button>';
        if (isHost) {
          btns += '<button data-act="loot_party">' + (i.party ? 'Unmark' : 'Party') + '</button>';
          btns += '<button data-act="send-open">Send</button>';
        }
        row.innerHTML = '<span>' + (i.icon || '') + '</span><span class="bi-name">' + esc(i.short || i.name) + ' ×' + i.qty
          + (i.party ? ' <em>(party property)</em>' : '') + '</span>' + btns;
        row.querySelectorAll('button').forEach(function (b) {
          b.addEventListener('click', function () {
            if (b.dataset.act === 'send-open') {
              var pick = row.querySelector('.send-pick');
              if (pick) { pick.remove(); return; }
              pick = document.createElement('div'); pick.className = 'send-pick';
              heroes.forEach(function (h) {
                var hb = document.createElement('button');
                hb.textContent = String.fromCodePoint(0x2192) + ' ' + h.name;
                hb.addEventListener('click', function () { lootAction('loot_send', i.key, h.id); });
                pick.appendChild(hb);
              });
              row.appendChild(pick);
            } else lootAction(b.dataset.act, i.key);
          });
        });
        box.appendChild(row);
      });
    }

    if (pack.length) {
      var kh = document.createElement('h4'); kh.textContent = 'Your pack'; box.appendChild(kh);
      pack.forEach(function (i) {
        var row = document.createElement('div'); row.className = 'bag-item pack-item';
        // Click the ITEM to activate it (Tobias 2026-07-13). Consumables → use
        // (drink/throw); gear → equip. Off-turn a use QUEUES (doGameAction shows
        // "fires when your turn comes"); the server gates equip timing.
        var primary = i.type === 'consumable' ? 'use' : (i.type === 'gear' ? 'equip' : null);
        var verb = i.type === 'consumable' ? (i.verb === 'drink' ? 'Drink' : 'Throw') : (i.type === 'gear' ? 'Equip' : '');
        var main = '<button class="bi-main"' + (primary ? '' : ' disabled') + ' aria-label="' + (verb ? verb + ' ' : '') + esc(i.name) + '">'
          + '<span class="bi-icon">' + (i.icon || '') + '</span><span class="bi-name">' + esc(i.name) + ' ×' + i.qty + '</span>'
          + (verb ? '<span class="bi-verb">' + verb + '</span>' : '') + '</button>';
        var sell = (i.sellGp && isPlayer) ? '<button class="bi-sell" title="Sell for 50% of value into the party purse">Sell ' + i.sellGp + 'g</button>' : '';
        row.innerHTML = main + sell;
        var mb = row.querySelector('.bi-main');
        if (mb && primary) mb.addEventListener('click', function () { doGameAction({ id: primary, item: i.key, label: i.name }); });
        var sb = row.querySelector('.bi-sell');
        if (sb) sb.addEventListener('click', function () { lootAction('loot_sell', i.key); });
        box.appendChild(row);
      });
    }
  }
  // ── IN-DUNGEON SHOP ──────────────────────────────────────────────────────
  // Opening it marks you "Shopping" server-side: your turns auto-skip and the
  // dungeon keeps going. The wares are a static vetted pool; gold is the party
  // purse. Native buttons keep it screen-reader friendly (Josh).
  // ── THE STOREFRONT ───────────────────────────────────────────────────────
  // A shopfront, not a table of rows: a FEATURED rail of the three rare pieces
  // that rotate every 10 minutes, then the staples with search + category
  // filters. Every control is a native button/input, so the whole thing is
  // keyboard- and screen-reader-navigable by construction (Josh) — and the
  // blind path never depends on the layout: the shop registers its own Escape
  // menu entries and speaks the stock on request.
  var SHOP_CATS = [
    { key: 'all', label: 'Everything', match: function () { return true; } },
    { key: 'heal', label: 'Potions', match: function (i) { return i.type === 'consumable' && /heal/.test(i.desc); } },
    { key: 'throw', label: 'Throwables', match: function (i) { return i.type === 'consumable' && /thrown/.test(i.desc); } },
    { key: 'weapon', label: 'Weapons', match: function (i) { return i.gearType === 'weapon'; } },
    { key: 'armor', label: 'Armor', match: function (i) { return i.gearType === 'armor'; } },
    { key: 'component', label: 'Components', match: function (i) { return i.type === 'component'; } },
  ];
  function shopGold() {
    var g = (myRun() || {}).gold;                          // live party purse (SSE keeps it fresh)
    return g == null ? (state.shopGold != null ? state.shopGold : 0) : g;
  }
  /** The stat line, said out loud. The card shows "2d10 · crit 19-20/×2" because
   *  that's what a sighted player wants to scan; a screen reader trips over the
   *  glyphs, so the SPOKEN form spells them out. Same data, two audiences. */
  function sayDesc(d) {
    return String(d || '')
      .replace(/·/g, ',')
      .replace(/×/g, 'times ')
      .replace(/(\d+)d(\d+)/g, '$1 d $2')          // 2d10 -> "2 d 10"
      .replace(/crit (\d+)-(\d+)/g, 'crit $1 to $2')
      .replace(/\s+/g, ' ').trim();
  }
  function shopFiltered() {
    var cat = SHOP_CATS.find(function (c) { return c.key === (state.shopCat || 'all'); }) || SHOP_CATS[0];
    var q = (state.shopQuery || '').trim().toLowerCase();
    return (state.shopStock || []).filter(function (i) {
      if (!cat.match(i)) return false;
      if (!q) return true;
      return i.name.toLowerCase().indexOf(q) >= 0 || (i.desc || '').toLowerCase().indexOf(q) >= 0;
    });
  }
  /** One product card. `featured` cards get the lore and a rarity flag. */
  function shopCard(it, gold, featured) {
    var afford = gold >= it.price;
    var card = document.createElement('div');
    card.className = 'shop-card' + (featured ? ' is-featured' : '') + (afford ? '' : ' is-broke');
    card.setAttribute('role', 'listitem');
    var short = it.price - gold;
    card.innerHTML =
      '<span class="sc-icon" aria-hidden="true">' + (it.icon || '') + '</span>'
      + '<div class="sc-body">'
      +   '<div class="sc-name">' + esc(it.name) + (it.signature ? ' <span class="sc-tag">signature</span>' : '') + '</div>'
      +   '<div class="sc-desc">' + esc(it.desc || '') + '</div>'
      +   (featured && it.lore ? '<div class="sc-lore">' + esc(it.lore) + '</div>' : '')
      + '</div>'
      + '<div class="sc-buy">'
      +   '<div class="sc-price">' + it.price.toLocaleString() + 'g</div>'
      +   '<button class="sc-btn"' + (afford ? '' : ' disabled') + '>' + (afford ? 'Buy' : 'Short ' + short.toLocaleString() + 'g') + '</button>'
      + '</div>';
    // The button's accessible name carries everything a sighted player reads off
    // the card — name, what it does, price, and whether you can afford it. The
    // stat line is SPOKEN, not shown, so the compact glyphs get spelled out.
    var b = card.querySelector('button');
    b.setAttribute('aria-label', 'Buy ' + it.name + (it.desc ? ', ' + sayDesc(it.desc) : '')
      + ', ' + it.price + ' gold' + (afford ? '' : ' — you are ' + short + ' gold short'));
    b.addEventListener('click', function () { buyItem(it.key, it.name); });
    return card;
  }
  function renderShop() {
    var list = el('shop-list'); if (!list) return;
    var gold = shopGold();
    el('shop-gold').textContent = 'Party gold: ' + gold.toLocaleString();

    // Featured rail — the three that rotate.
    var frail = el('shop-featured-list');
    if (frail) {
      frail.innerHTML = '';
      (state.shopFeatured || []).forEach(function (it) { frail.appendChild(shopCard(it, gold, true)); });
    }
    // Category chips.
    var cats = el('shop-cats');
    if (cats && !cats.childElementCount) {
      SHOP_CATS.forEach(function (c) {
        var b = document.createElement('button');
        b.type = 'button'; b.className = 'shop-cat'; b.textContent = c.label;
        b.setAttribute('aria-pressed', String((state.shopCat || 'all') === c.key));
        b.addEventListener('click', function () {
          state.shopCat = c.key;
          Array.prototype.forEach.call(cats.children, function (x) { x.setAttribute('aria-pressed', String(x === b)); });
          renderShop();
          var n = shopFiltered().length;
          BM.speak(c.label + '. ' + n + ' item' + (n === 1 ? '' : 's') + '.', 'urgent');
        });
        cats.appendChild(b);
      });
    }
    // Staples.
    var rows = shopFiltered();
    list.innerHTML = '';
    rows.forEach(function (it) { list.appendChild(shopCard(it, gold, false)); });
    var empty = el('shop-empty');
    if (empty) empty.hidden = rows.length > 0;
    shopTick();
  }
  /** Countdown to the next rotation — the merchant's stock is on a clock. */
  function shopTick() {
    var box = el('shop-rotate');
    if (!box || !state.shopRotatesAt) return;
    var left = Math.max(0, state.shopRotatesAt - Date.now());
    var m = Math.floor(left / 60000), s = Math.floor((left % 60000) / 1000);
    box.textContent = 'new stock in ' + m + ':' + (s < 10 ? '0' : '') + s;
    if (left <= 0 && state.shopOpen) refreshShop();   // the stall changed over while we stood here
  }
  function refreshShop() {
    api('/api/session/action', { clientId: state.clientId, action: 'shop_open' }).then(function (r) {
      if (!r.ok) return;
      applyShopPayload(r);
      renderShop();
      BM.speak('The merchant swaps out his rare stock. ' + featuredNames() + '.', 'event');
    });
  }
  function applyShopPayload(r) {
    state.shopStock = r.stock || [];
    state.shopFeatured = r.featured || [];
    state.shopRotatesAt = r.rotatesAt || 0;
    state.shopGold = r.gold;
  }
  function featuredNames() {
    return (state.shopFeatured || []).map(function (f) { return f.name + ', ' + f.price + ' gold'; }).join('; ');
  }
  /** Read the staples aloud, cheapest first, flagging what the purse can't reach. */
  function speakStaples() {
    var gold = shopGold();
    var rows = shopFiltered();
    if (!rows.length) { BM.speak('Nothing in the stock matches that.', 'urgent'); return; }
    BM.speak(rows.length + ' wares, cheapest first. ' + rows.map(function (i) {
      return i.name + ', ' + i.price + ' gold' + (gold >= i.price ? '' : ' — too dear');
    }).join('. ') + '.', 'urgent');
  }
  function openShop() {
    if (state.role !== 'player') { BM.speak('Only a player can shop.', 'urgent'); return; }
    api('/api/session/action', { clientId: state.clientId, action: 'shop_open' }).then(function (r) {
      if (!r.ok) { BM.speak(r.error || 'Cannot shop right now.', 'urgent'); return; }
      applyShopPayload(r);
      state.shopOpen = true;              // muffles the combat you can still hear next door
      state.shopCat = 'all'; state.shopQuery = '';
      var sb = el('shop-search'); if (sb) sb.value = '';
      el('shop-panel').hidden = false;
      renderShop();
      if (state.shopTimer) clearInterval(state.shopTimer);
      state.shopTimer = setInterval(shopTick, 1000);
      BM.speak('The merchant. Party gold ' + r.gold + '. On the good cloth: ' + featuredNames()
        + '. Plus ' + state.shopStock.length + ' usual wares. Your turns pass while you shop — you can hear the fight through the wall. '
        + 'Press Escape for the shop menu.', 'urgent');
      el('shop-close').focus();          // a known, stable landing spot
    });
  }
  function closeShop() {
    state.shopOpen = false;
    if (state.shopTimer) { clearInterval(state.shopTimer); state.shopTimer = null; }
    el('shop-panel').hidden = true;
    api('/api/session/action', { clientId: state.clientId, action: 'shop_close' }).then(function (r) {
      if (r && r.ok) BM.speak('Done shopping — back to the delve.', 'urgent');
    });
    var back = el('shop-btn'); if (back) back.focus();
  }
  function buyItem(key, name) {
    api('/api/session/action', { clientId: state.clientId, action: 'shop_buy', item: key }).then(function (r) {
      if (!r.ok) { BM.speak(r.error || 'No sale.', 'urgent'); return; }
      applyShopPayload(r);
      BM.speak(r.text || ('Bought ' + name + '.'), 'urgent');
      renderShop();
    });
  }

  // What THIS hero may consume right now: their pack + party-flagged pile
  // items (+ the whole pile for the leader — dividing to yourself is implied).
  function matchLoot(name) {
    var run = myRun(); if (!run) return null;
    name = name.replace(/\b(the|a|an|of)\b/g, '').trim().toLowerCase();
    return (run.inventory || []).find(function (i) {
      return i.name.toLowerCase().indexOf(name) >= 0 || (i.short || '').toLowerCase().indexOf(name) >= 0 || i.key.indexOf(name.replace(/\s+/g, '_')) >= 0;
    }) || null;
  }
  function usableItems(run) {
    var isHost = state.you && state.you.youAreHost;
    var pile = (run.inventory || []).filter(function (i) { return i.party || isHost; });
    var seen = {};
    return myPack().concat(pile).filter(function (i) { if (seen[i.key]) return false; seen[i.key] = true; return true; });
  }

  // ── POKER ACTION BAR (ported from poker client.js ~1596-1745) ──
  var _sbOpen = false;
  function abilBtn(ab) {
    var esc2 = esc;
    if (!ab.available) {
      return '<button class="ab-btn is-locked" disabled title="' + esc2(ab.desc) + ' (unlocks at level ' + ab.minLevel + ')">' +
        String.fromCodePoint(0x1F512) + ' ' + (ab.icon || '') + ' ' + esc2(ab.name) + ' <span class="ab-uses">Lv' + ab.minLevel + '</span></button>';
    }
    var ok = ab.cost === 'free' ? true : (ab.remaining === null || ab.remaining > 0);
    var count = (ab.cost === 'room' || ab.cost === 'run')
      ? ' <span class="ab-uses" title="' + (ab.cost === 'run' ? 'once per dungeon' : 'per room') + '">' + ab.remaining + '/' + ab.max + '</span>' : '';
    return '<button class="ab-btn" data-abkey="' + esc2(ab.key) + '"' + (ok ? '' : ' disabled') +
      ' title="' + esc2(ab.desc) + '">' + (ab.icon || '') + ' ' + esc2(ab.name) + count + '</button>';
  }
  function spellTile(ab) {
    var ok = ab.available && (ab.remaining === null || ab.remaining > 0);
    var badge = !ab.available ? '<span class="sb-badge sb-lock">' + String.fromCodePoint(0x1F512) + '</span>'
      : ((ab.cost === 'room' || ab.cost === 'run') ? '<span class="sb-badge">' + ab.remaining + '/' + ab.max + '</span>' : '');
    var title = ab.name + (!ab.available ? ' - unlocks at level ' + ab.minLevel : '') + (ab.desc ? ' - ' + ab.desc : '');
    return '<button class="sb-spell' + (ab.available ? '' : ' is-locked') + '" data-abkey="' + esc(ab.key) + '"' + (ok ? '' : ' disabled') +
      ' title="' + esc(title) + '" aria-label="' + esc(ab.name) + '">' + (ab.icon || String.fromCodePoint(0x2728)) + badge + '</button>';
  }
  function renderActionBar(run, myTurn) {
    var bar = el('action-bar'); if (!bar) return;
    var spectating = state.role === 'spectator';
    if (spectating) { bar.innerHTML = ''; return; }
    var kit = (run.turn && run.turn.ownerClientId === state.myId) ? run.turn.kit : null;

    if (run.phase === 'initiative') {
      bar.innerHTML = '<button class="ab-btn ab-primary ab-roll" data-dact="initiative">' + String.fromCodePoint(0x1F3B2) + ' Roll for initiative!</button>';
    } else if (run.phase === 'cleared') {
      bar.innerHTML = '<span class="ab-status">' + String.fromCodePoint(0x1F6AA) + ' The room is yours.</span>' +
        '<button class="ab-btn ab-primary" data-dact="descend">' + String.fromCodePoint(0x1F6AA) + ' Open the next door</button>';
    } else if (run.phase !== 'combat') {
      bar.innerHTML = '<button class="ab-btn" data-dact="leave">' + String.fromCodePoint(0x21A9) + ' Return to start</button>';
    } else if (!kit) {
      // OFF-TURN: another combatant is acting. You may PRE-LOAD a swing/hold —
      // it fires the instant your turn arrives (poker action queue). Abilities
      // queue on your own turn only (kit not sent off-turn yet).
      var actor = run.turn ? run.turn.name : 'The enemy';
      var mine2 = run.combatants.filter(function (c) { return c.side === 'hero' && c.ownerClientId === state.myId; })[0];
      var canQueue = mine2 && !mine2.down && !mine2.dead;
      var qhtml = '<span class="ab-status">' + esc(actor) + ' is acting' + String.fromCharCode(8230) +
        (canQueue ? ' <span class="ab-uses" title="Pick a move now — it fires the moment your turn begins.">' + String.fromCodePoint(0x23F3) + ' clicks queue</span>' : '') + '</span>';
      if (canQueue) {
        qhtml += '<button class="ab-btn ab-primary" data-dact="attack">' + String.fromCodePoint(0x2694, 0xFE0F) + ' Queue attack</button>';
        qhtml += '<button class="ab-btn ab-ghost" data-dact="pass">' + String.fromCodePoint(0x23F8, 0xFE0F) + ' Queue hold</button>';
        if (mine2.queued) qhtml += '<span class="ab-queued">' + String.fromCodePoint(0x23F3) + ' queued: ' + esc(mine2.queued) + '</span>';
      }
      bar.innerHTML = qhtml;
    } else {
      var slotSummary = Object.keys(kit.slots || {}).sort().map(function (L) { return L + ':' + kit.slots[L].remaining; }).join(' ');
      var html = '<span class="ab-status">' + String.fromCodePoint(0x2694, 0xFE0F) + ' Your turn' + (slotSummary ? ' <span class="ab-uses">' + String.fromCodePoint(0x2728) + slotSummary + '</span>' : '') + '</span>';
      // primary swing (melee or ranged by weapon)
      html += '<button class="ab-btn ab-primary" data-dact="attack">' +
        (kit.ranged ? String.fromCodePoint(0x1F3F9) + ' Ranged' : String.fromCodePoint(0x2694, 0xFE0F) + ' Melee') + '</button>';
      // at-will cantrip + element cycler
      if (kit.atwill && kit.atwill.effect === 'bolt') {
        html += '<button class="ab-btn" data-abkey="' + esc(kit.atwill.key) + '">' + (kit.atwill.icon || '') + ' ' + esc(kit.atwill.name) + '</button>';
        if (kit.cantrip) html += '<button class="ab-btn ab-cycle" data-dact="cantrip" title="Cycle cantrip element (' + esc((kit.cantrip.choices || []).join(', ')) + ')">' + String.fromCodePoint(0x1F504) + '</button>';
      }
      // class FEATURES inline; SPELLS collapse into the Spellbook popover
      var features = kit.abilities.filter(function (a) { return !a.isSpell; });
      var spells = kit.abilities.filter(function (a) { return a.isSpell; });
      html += features.map(abilBtn).join('');
      if (kit.caster && spells.length) {
        var byLvl = {};
        spells.forEach(function (a) { var L = a.slvl || 1; (byLvl[L] = byLvl[L] || []).push(a); });
        var sections = Object.keys(byLvl).sort().map(function (L) {
          var sl = kit.slots && kit.slots[L];
          var slotTxt = sl ? ' <span class="sb-slots">' + sl.remaining + '/' + sl.max + ' slots</span>' : '';
          return '<div class="sb-lvl"><div class="sb-lvlhead">Level ' + L + slotTxt + '</div><div class="sb-row">' +
            byLvl[L].map(spellTile).join('') + '</div></div>';
        }).join('');
        html += '<span class="sb-wrap">' +
          '<button class="ab-btn' + (_sbOpen ? ' ab-primary' : '') + '" data-sb-toggle aria-expanded="' + _sbOpen + '">' + String.fromCodePoint(0x1F4D6) + ' Spellbook ' + String.fromCharCode(9662) + '</button>' +
          '<div class="spellbook' + (_sbOpen ? ' is-open' : '') + '">' + sections + '</div></span>';
      }
      html += '<button class="ab-btn ab-ghost" data-dact="pass">' + String.fromCodePoint(0x23F8, 0xFE0F) + ' Hold</button>';
      bar.innerHTML = html;
    }

    bar.querySelectorAll('[data-dact]').forEach(function (b) {
      b.addEventListener('click', function () {
        var act = b.getAttribute('data-dact');
        if (act === 'cantrip') {
          api('/api/session/action', { clientId: state.clientId, action: 'cantrip' }).then(function (r) {
            BM.toast(r.ok ? 'Cantrip: ' + r.cantripName : (r.error || 'No.'));
            if (r.ok && r.snapshot) onState({ you: r.snapshot, sessions: state.sessions });
          });
          return;
        }
        if (act === 'attack') { doGameAction({ id: 'attack', target: state.queuedTarget }); return; }
        doGameAction({ id: act });
      });
    });
    bar.querySelectorAll('[data-abkey]').forEach(function (b) {
      b.addEventListener('click', function () {
        _sbOpen = false;
        doGameAction({ id: 'cast', spell: b.getAttribute('data-abkey'), target: state.queuedTarget });
      });
    });
    var tog = bar.querySelector('[data-sb-toggle]');
    if (tog) tog.addEventListener('click', function (e) { e.stopPropagation(); _sbOpen = !_sbOpen; renderActionBar(run, myTurn); });
  }
  document.addEventListener('click', function (e) {
    if (_sbOpen && !e.target.closest('.sb-wrap')) { _sbOpen = false; var r = myRun(); if (r) renderActionBar(r, true); }
  });

  function renderGameChoices(run, myTurn) {
    var choices = [];
    var spectating = state.role === 'spectator';
    if (spectating) { state.choices = []; el('choices').innerHTML = ''; return; }
    if (run.phase === 'initiative') {
      choices.push({ id: 'initiative', label: '🎲 Roll for initiative!', big: true });
    } else if (run.phase === 'combat' && myTurn) {
      (run.enemies || []).forEach(function (e) { if (e.name) choices.push({ id: 'attack', target: e.id, label: 'Attack ' + e.name }); });
      choices.push({ id: 'pass', label: 'Hold action' });
      ((run.turn && run.turn.spells) || []).forEach(function (s) {
        // Poker semantics: only SPELLS are "cast" — class abilities (Power
        // Attack, Rage, stances) are simply used/toggled by name.
        var label = (s.isSpell ? 'Cast ' + s.name : s.name) + (s.uses != null ? ' (' + s.uses + ')' : '');
        choices.push({ id: 'cast', spell: s.key, label: label });
      });
      usableItems(run).filter(function (i) { return i.type === 'consumable'; }).forEach(function (i) {
        choices.push({ id: 'use', item: i.key, label: (i.verb === 'drink' ? 'Drink ' : 'Throw ') + (i.short || i.name) });
      });
    } else if (run.phase === 'cleared') {
      usableItems(run).filter(function (i) { return i.type === 'gear'; }).forEach(function (i) {
        choices.push({ id: 'equip', item: i.key, label: 'Equip ' + (i.short || i.name) });
      });
      choices.push({ id: 'descend', label: 'Descend deeper' });
    } else if (run.phase === 'defeated' || run.phase === 'retreated') { choices.push({ id: 'leave', label: 'Return to start' }); }
    state.choices = choices;
    var nav = el('choices'); nav.innerHTML = '';
    choices.forEach(function (c, i) {
      var b = document.createElement('button'); b.type = 'button';
      if (c.big) b.className = 'big-roll';
      b.innerHTML = '<span class="num">' + (i + 1) + '</span><span>' + esc(c.label) + '</span>';
      b.addEventListener('click', function () { doGameAction(c); });
      nav.appendChild(b);
    });
    if (myTurn && run.turn && run.turn.combatantId !== state.lastAnnouncedTurn) {
      state.lastAnnouncedTurn = run.turn.combatantId;
      BM.speak('Your turn. ' + choices.map(function (c, i) { return (i + 1) + ', ' + c.label; }).join('. ') + '.', 'event');
    }
  }
  // A d20 clattering across the table — WebAudio, no asset needed.
  function diceEarcon() {
    try {
      var AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
      var ctx = diceEarcon._ctx || (diceEarcon._ctx = new AC());
      var t = ctx.currentTime + 0.02;
      for (var i = 0; i < 7; i++) {
        var osc = ctx.createOscillator(), g = ctx.createGain();
        osc.type = 'square';
        osc.frequency.value = 1800 + Math.random() * 1400;
        var dur = 0.015 + Math.random() * 0.02;
        g.gain.setValueAtTime(0.12 * (1 - i / 9), t);
        g.gain.exponentialRampToValueAtTime(0.001, t + dur);
        osc.connect(g); g.connect(ctx.destination);
        osc.start(t); osc.stop(t + dur + 0.01);
        t += 0.05 + Math.random() * 0.09 + i * 0.012;
      }
    } catch (e) {}
  }
  function appendLog(text, prio) {
    var log = el('log'); var p = document.createElement('p'); p.textContent = text;
    if (prio === 'urgent') p.classList.add('urgent');
    log.appendChild(p); log.scrollTop = log.scrollHeight;
  }
  function doGameAction(choice) {
    if (!choice) return BM.speak('Nothing to do right now.', 'urgent');
    if (choice.id === 'leave') { location.reload(); return; }
    var body = { clientId: state.clientId, action: choice.id };
    if (choice.target) body.target = choice.target;
    if (choice.item) body.item = choice.item;
    if (choice.spell) body.spell = choice.spell;
    api('/api/session/action', body).then(function (r) {
      if (!r.ok) { BM.speak(r.error || 'Cannot do that.', 'urgent'); BM.toast(r.error || 'Cannot do that.'); return; }
      if (r.queued) { BM.speak('Queued: ' + (r.label || 'action') + '. It fires when your turn comes.', 'urgent'); BM.toast('⏳ Queued: ' + (r.label || 'action')); }
      // Render from the response NOW — never sit waiting on the SSE push
      // (a severed stream after a deploy left the screen frozen for Tobias).
      if (r.snapshot) onState({ you: r.snapshot, sessions: state.sessions });
    }).catch(function () { BM.toast('Connection hiccup — try again.'); });
  }

  // ---------- blind-mode info providers (poker keymap: A/E/K/C/H/X/B) ----------
  function myRun() { return state.you && state.you.run; }
  function myHero() {
    var run = myRun(); if (!run) return null;
    return run.combatants.find(function (c) { return c.ownerClientId === state.myId; }) || null;
  }
  function registerBlindInfo() {
    BM.registerInfo({
      foes: function () {
        var run = myRun(); if (!run) return [];
        return (run.enemies || []).map(function (e) { return { id: e.id, key: e.id, label: e.name + ', ' + (e.hpWord || 'unknown') }; });
      },
      spells: function () {
        var run = myRun(); if (!run || !run.turn || run.turn.ownerClientId !== state.myId) return [];
        return (run.turn.spells || []).map(function (s) { return { key: s.key, label: s.name + (s.uses != null ? ', ' + s.uses + ' left' : ', at will') }; });
      },
      targetFoe: function (id) {
        var run = myRun();
        state.queuedTarget = id;
        var e = run && (run.enemies || []).find(function (x) { return x.id === id; });
        // Enter on a foe attacks it if it's your turn (select-and-strike, like the
        // poker dungeon); otherwise it just marks the target.
        var atk = (state.choices || []).find(function (c) { return c.id === 'attack' && c.target === id; });
        if (atk) { BM.speak('Attacking ' + (e ? e.name : 'the enemy') + '.', 'urgent'); doGameAction(atk); }
        else BM.speak('Targeting ' + (e ? e.name : 'the enemy') + '. Not your turn yet.', 'urgent');
      },
      attack: function () {
        var atk = state.choices.filter(function (c) { return c.id === 'attack'; });
        if (!atk.length) return BM.speak('You cannot attack right now.', 'urgent');
        var byTarget = state.queuedTarget && atk.find(function (c) { return c.target === state.queuedTarget; });
        doGameAction(byTarget || atk[0]);
      },
      castSpell: function (key) {
        var c = state.choices.find(function (x) { return x.id === 'cast' && x.spell === key; });
        if (!c) return BM.speak('You cannot cast that right now.', 'urgent');
        if (state.queuedTarget) c = Object.assign({}, c, { target: state.queuedTarget });
        doGameAction(c);
      },
      status: function () {   // L key — poker's "Life": your own standing
        var h = myHero();
        if (!h) return 'No character in play.';
        var conds = (h.debuffs || []).length ? '. Conditions: ' + h.debuffs.join(', ') : '';
        return h.name + ', level ' + (h.level || 1) + ' ' + (h.cls || '') + '. Health ' + h.hp + ' of ' + h.maxHp + '. Armor class ' + h.ac + conds + '.';
      },
      health: function () {
        var run = myRun();
        if (run) {
          return run.combatants.filter(function (c) { return c.side === 'hero'; })
            .map(function (c) { return c.name + ' ' + (c.down ? 'DOWN' : c.hp + ' of ' + c.maxHp); }).join('. ') + '.';
        }
        // Lobby/pub: H reports the recruited roster (Josh 2026-07-14: "H does not
        // report the party in the lobby").
        var you = state.you;
        if (you && you.members && you.members.length) {
          return 'Party of ' + you.members.length + ': ' + you.members.map(function (m) {
            return m.name + (m.isYou ? ' (you)' : (m.ai ? ' the ' + (m.race ? cap(m.race) + ' ' : '') + cap(m.cls || 'companion') : ''));
          }).join(', ') + '.';
        }
        return 'No party yet.';
      },
      money: function () {   // M key — gold + depth
        var run = myRun(); if (!run) return 'No delve yet.';
        return run.gold + ' gold. Depth ' + (run.roomsCleared + 1) + '.';
      },
      buffs: function () {   // B key — poker's party BUFFS (bail is in the Escape menu)
        var run = myRun(); if (!run) return 'No party yet.';
        var lines = run.combatants.filter(function (c) { return c.side === 'hero' && (c.buffs || []).length; })
          .map(function (c) { return c.name + ': ' + c.buffs.join(', '); });
        return lines.length ? lines.join('. ') + '.' : 'No buffs running.';
      },
      debuffs: function () {   // D key
        var run = myRun(); if (!run) return 'No party yet.';
        var lines = run.combatants.filter(function (c) { return c.side === 'hero' && (c.debuffs || []).length; })
          .map(function (c) { return c.name + ': ' + c.debuffs.join(', '); });
        return lines.length ? lines.join('. ') + '.' : 'Nobody is debuffed.';
      },
      cantrip: function () {   // C key — cycle at-will element (free, engine-backed)
        api('/api/session/action', { clientId: state.clientId, action: 'cantrip' }).then(function (r) {
          BM.speak(r.ok ? 'Cantrip: ' + r.cantripName + '.' : (r.error || 'No cantrip to cycle.'), 'urgent');
        });
      },
      descend: function () {   // 0 key — poker's "open the next door"
        var run = myRun();
        if (!run) return BM.speak('No delve yet.', 'urgent');
        if (run.phase !== 'cleared') return BM.speak('The door only opens once the room is clear.', 'urgent');
        api('/api/session/action', { clientId: state.clientId, action: 'descend' })
          .then(function (r) { if (!r.ok) BM.speak(r.error || 'Cannot descend.', 'urgent'); });
      },
      chatFocus: function () {   // Backslash — jump into chat, Enter sends, Escape cancels
        var inp = el('chat-input');
        if (!inp || el('game').hidden) return BM.speak('No chat here.', 'urgent');
        inp.focus();
        BM.speak('Chat. Type, then Enter to send, Escape to cancel.', 'urgent');
      },
      // Escape — the blind player's ACTION HUB. Context-aware, so the major
      // action of every screen is always one key away (Josh 2026-07-14: couldn't
      // find the Start button, focus kept jumping). Key-driven, so DOM re-renders
      // never lose it. This IS the "persistent navigation" Josh asked for.
      sessionMenu: function () {
        var items = [];
        var mode = state.mode || 'landing';
        var run = myRun();
        var you = state.you;
        // IN THE SHOP, Escape is the shop's menu — a blind player never has to
        // find a card on screen. Every purchase is reachable as a numbered item:
        // the three rare pieces by name and price, then the staples.
        if (state.shopOpen) {
          (state.shopFeatured || []).forEach(function (it) {
            var afford = shopGold() >= it.price;
            items.push({
              label: (afford ? 'Buy ' : 'Cannot afford ') + it.name + ' — ' + sayDesc(it.desc) + ' — ' + it.price + ' gold'
                + (afford ? '' : ' (short ' + (it.price - shopGold()) + ')'),
              run: function () { if (afford) buyItem(it.key, it.name); else BM.speak('The purse is ' + (it.price - shopGold()) + ' gold short.', 'urgent'); },
            });
          });
          items.push({ label: 'Read out the usual stock', run: function () { speakStaples(); } });
          items.push({ label: 'How long until the rare stock changes', run: function () {
            var left = Math.max(0, (state.shopRotatesAt || 0) - Date.now());
            BM.speak('New rare stock in ' + Math.floor(left / 60000) + ' minutes ' + Math.floor((left % 60000) / 1000) + ' seconds.', 'urgent');
          } });
          items.push({ label: 'Party gold', run: function () { BM.speak('The party purse holds ' + shopGold() + ' gold.', 'urgent'); } });
          items.push({ label: 'Leave the shop and rejoin the fight', run: function () { closeShop(); } });
          return items;
        }
        if (mode === 'game') {
          if (run && run.phase === 'cleared') items.push({ label: 'Open the next door — descend deeper', run: function () { if (info.descend) info.descend(); } });
          items.push({ label: 'Shop — buy potions and gear', run: function () { openShop(); } });
          if (run && (run.phase === 'combat' || run.phase === 'cleared' || run.phase === 'initiative')) items.push({ label: 'Retreat — end the run for the party, keep the gold', run: doRetreat });
          items.push({ label: 'Main menu — leave; your delve is saved', run: leaveToMenu });
        } else if (mode === 'lobby') {
          if (you && you.phase === 'pub') {
            items.push({ label: 'Set out again — begin a new delve', run: startAdventure });
          } else {
            items.push({ label: 'Start the adventure', run: startAdventure });
            var cast = (state.meta && state.meta.companions) || [];
            if (cast.length) items.push({ label: 'Add a random AI companion', run: function () { addCompanion(cast[Math.floor(Math.random() * cast.length)].name); } });
          }
          items.push({ label: 'Main menu — leave; your delve is saved', run: leaveToMenu });
        } else {   // landing / create / skills
          items.push({ label: 'Start a new delve of your own', run: function () { startDelve(); } });
          (state.sessions || []).slice(0, 8).forEach(function (s) {
            items.push({ label: (s.phase === 'lobby' ? 'Join' : 'Rejoin') + ' the delve ' + s.name + ', ' + s.partySize + ' in the party', run: function () { joinDelveAs(s.id, 'player'); } });
          });
        }
        items.push({ label: 'Close this menu', run: function () {} });
        return items;
      },
      party: function () {   // P-key: the left status panel, piece by piece
        var run = myRun(); if (!run) return [];
        return run.combatants.filter(function (c) { return c.side === 'hero'; }).map(function (c) {
          var conds = (c.conditions || []).length ? ', ' + c.conditions.join(', ') : '';
          var slots = c.slots ? ', slots ' + Object.entries(c.slots).map(function (kv) { return 'level ' + kv[0] + ' times ' + kv[1]; }).join(', ') : '';
          return { key: c.id, label: c.name + (c.ai ? ', AI companion' : '') + ': ' + (c.down ? 'DOWN' : c.hp + ' of ' + c.maxHp + ' health') + ', armor class ' + c.ac + conds + slots };
        });
      },
      progression: function () {
        var run = myRun(); var h = myHero();
        var lvl = h ? 'Level ' + (h.level || 1) + '. Experience ' + (h.xp || 0) + (h.xpNext ? ' of ' + h.xpNext + ' for the next level' : '') + '. ' : '';
        return lvl + 'Gold ' + (run ? run.gold : 0) + '. Rooms cleared ' + (run ? run.roomsCleared : 0) + '.';
      },
      flee: function () { doRetreat(); },
    });
  }
  function doRetreat() {
    api('/api/session/action', { clientId: state.clientId, action: 'retreat' })
      .then(function (r) { if (!r.ok) BM.speak(r.error || 'Cannot retreat right now.', 'urgent'); });
  }

  // ---------- command routing ----------
  function handleCommand(raw) {
    var t = raw.trim();
    if (/\b(repeat|again|say that)\b/.test(t)) return BM.repeat();
    if (/\bfaster\b/.test(t)) return BM.faster();
    if (/\bslower\b/.test(t)) return BM.slower();
    if (/\b(mute|quiet|silence|stop talking)\b/.test(t)) return BM.toggleMute();
    if (state.mode === 'landing') {
      if (/\b(start|new delve|create|begin)\b/.test(t)) return startDelve();
      return BM.speak('Say start to begin a new delve, after entering your name.', 'urgent');
    }
    if (state.mode === 'skills') return skillsCommand(t);
    if (state.mode === 'game') return gameCommand(t);
    if (state.mode === 'lobby') {
      if (/\b(start|begin|go|descend)\b/.test(t)) return startAdventure();
      return BM.speak('Waiting in the lobby. Say start to begin.', 'urgent');
    }
    if (state.mode === 'create' && /\b(next|skills|continue|proceed)\b/.test(t)) { el('create-form').requestSubmit(); return; }
    BM.speak('No command for this screen.', 'urgent');
  }
  function skillsCommand(t) {
    if (/\b(confirm|begin|start|done|ready|descend)\b/.test(t)) return confirmCharacter();
    if (/\b(reset|auto|suggest|suggested|default)\b/.test(t)) return resetSkills();
    var NUM = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9 };
    var w = t.match(/\b(one|two|three|four|five|six|seven|eight|nine)\b/); if (w) return toggleByIndex(NUM[w[1]] - 1);
    var d = t.match(/\b(\d+)\b/); if (d) return toggleByIndex(parseInt(d[1], 10) - 1);
    var name = t.replace(/\b(toggle|add|remove|pick|choose|select|deselect|drop|take)\b/g, '').trim();
    var hit = matchSkill(name); if (hit) return toggleSkill(hit.key);
    BM.speak('Say a skill name, a number, reset, or confirm.', 'urgent');
  }
  function matchSkill(name) {
    if (!name) return null; name = name.toLowerCase(); var s = state.plan.skills;
    return s.find(function (x) { return x.name.toLowerCase() === name; }) || s.find(function (x) { return x.name.toLowerCase().indexOf(name) >= 0; });
  }
  function toggleByIndex(i) { var s = state.plan.skills[i]; if (s) toggleSkill(s.key); else BM.speak('No skill number ' + (i + 1) + '.', 'urgent'); }
  function gameCommand(t) {
    // "Gaspar, should we fall back?" is SPEECH to a companion, not a retreat
    // order — name-addressed messages route to the companion before any
    // command words inside them can fire.
    var comp = companionAddressed(t);
    if (comp) return askCompanion(comp.name, comp.msg);
    var NUM = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9 };
    var mk = t.match(/^#choice (\d)$/); if (mk) return selectGameIndex(parseInt(mk[1], 10) - 1);
    var w = t.match(/\b(one|two|three|four|five|six|seven|eight|nine)\b/); if (w) return selectGameIndex(NUM[w[1]] - 1);
    if (/\b(cast|spell)\b/.test(t)) {
      var casts = state.choices.filter(function (c) { return c.id === 'cast'; });
      if (!casts.length) return BM.speak('You have no spells to cast right now.', 'urgent');
      var sname = t.replace(/\b(cast|spell|the|a|an|at|on)\b/g, '').trim();
      var bySpell = sname && casts.find(function (c) { return c.label.toLowerCase().indexOf(sname) >= 0; });
      return doGameAction(bySpell || casts[0]);
    }
    if (/\b(equip|wield|wear|don)\b/.test(t)) {
      var eqs = state.choices.filter(function (c) { return c.id === 'equip'; });
      if (!eqs.length) return BM.speak('Nothing to equip right now.', 'urgent');
      var gname = t.replace(/\b(equip|wield|wear|don|the|a|an)\b/g, '').trim();
      var eq = gname && eqs.find(function (c) { return c.label.toLowerCase().indexOf(gname) >= 0; });
      return doGameAction(eq || eqs[0]);
    }
    // PARTY LOOT by voice/chat (blind-first): "loot" reads the pile+pack,
    // "take flask", "send potion to gaspar", "mark greatsword party".
    if (/^(loot|pile|inventory|items)$/.test(t)) {
      var run2 = myRun(); var inv2 = (run2 && run2.inventory) || []; var pk2 = myPack();
      var pileTxt = inv2.length ? 'Pile: ' + inv2.map(function (i) { return i.name + ' times ' + i.qty + (i.party ? ', party property' : ''); }).join('; ') : 'The pile is empty';
      var packTxt = pk2.length ? '. Your pack: ' + pk2.map(function (i) { return i.name + ' times ' + i.qty; }).join('; ') + '.' : '. Your pack is empty.';
      return BM.speak(pileTxt + packTxt, 'urgent');
    }
    var mSend = t.match(/^(?:send|give)\s+(.+?)\s+to\s+([a-z' ]+)$/);
    if (mSend) {
      var it1 = matchLoot(mSend[1]); if (!it1) return BM.speak('No ' + mSend[1] + ' in the pile.', 'urgent');
      return lootAction('loot_send', it1.key, mSend[2].trim());
    }
    var mMark = t.match(/^(?:mark|flag)\s+(.+?)(?:\s+(?:as\s+)?party(?:\s+property)?)?$/);
    if (/^(?:mark|flag)\s/.test(t) && mMark) {
      var it2 = matchLoot(mMark[1]); if (!it2) return BM.speak('No ' + mMark[1] + ' in the pile.', 'urgent');
      return lootAction('loot_party', it2.key);
    }
    var mTake = t.match(/^(?:take|grab|claim)\s+(.+)$/);
    if (mTake) {
      var it3 = matchLoot(mTake[1]); if (!it3) return BM.speak('No ' + mTake[1] + ' in the pile.', 'urgent');
      return lootAction('loot_take', it3.key);
    }
    if (/\b(retreat|withdraw|fall back)\b/.test(t)) return doRetreat();
    if (/\b(descend|deeper|continue|next|onward)\b/.test(t)) return chooseById('descend');
    if (/\b(pass|hold|wait|skip)\b/.test(t)) return chooseById('pass');
    if (/\b(leave|return|quit|exit)\b/.test(t)) return chooseById('leave');
    if (/\b(use|drink|throw|quaff)\b/.test(t)) {
      var uses = state.choices.filter(function (c) { return c.id === 'use'; });
      if (!uses.length) return BM.speak('You have nothing to use.', 'urgent');
      var name = t.replace(/\b(use|drink|throw|quaff|the|a|an|potion|of)\b/g, '').trim();
      var byName = name && uses.find(function (c) { return c.label.toLowerCase().indexOf(name) >= 0; });
      return doGameAction(byName || uses[0]);
    }
    if (/\b(attack|hit|strike|kill|fight)\b/.test(t)) {
      var atk = state.choices.filter(function (c) { return c.id === 'attack'; });
      if (!atk.length) return BM.speak('You cannot attack right now.', 'urgent');
      var target = t.replace(/\b(attack|hit|strike|kill|fight|the)\b/g, '').trim();
      var byName = target && atk.find(function (c) { return c.label.toLowerCase().indexOf(target) >= 0; });
      return doGameAction(byName || atk[0]);
    }
    askGM(t);   // not a command — the Game Master answers (chat + PTT questions)
  }
  function companionAddressed(t) {
    var run = myRun(); if (!run) return null;
    var low = t.toLowerCase().replace(/^(?:hey|ok)\s+/, '');
    var ais = run.combatants.filter(function (c) { return c.side === 'hero' && c.ai; });
    for (var i = 0; i < ais.length; i++) {
      var full = ais[i].name.toLowerCase();
      var first = full.split(' ')[0];
      var lead = low.indexOf(full) === 0 ? full : (low.indexOf(first) === 0 ? first : null);
      if (!lead) continue;
      var m = low.slice(lead.length).match(/^[,:.!?]?\s+(.+)$/);   // "gaspar, press on?" / "gaspar what now"
      if (m) return { name: ais[i].name, msg: m[1] };
    }
    return null;
  }
  function askCompanion(name, msg) {
    appendLog('💬 You, to ' + name + ': ' + msg, 'event');
    api('/api/companion', { clientId: state.clientId, name: name, question: msg }).then(function (r) {
      if (!r.ok && r.error) { BM.speak(r.error, 'urgent'); return; }
      appendLog('💬 ' + r.name + ': ' + r.text, 'event');
      BM.speakAs(r.text, r.voiceId);       // their own 11labs voice (queued, never overlapping)
    }).catch(function () { BM.speak(name + ' says nothing.', 'urgent'); });
  }
  function askGM(question) {
    appendLog('🎲 You ask: ' + question, 'event');
    BM.speak('The Game Master considers…', 'ambient');
    api('/api/gm', { clientId: state.clientId, question: question }).then(function (r) {
      appendLog('🎲 GM: ' + r.text, 'event');
      BM.speakGM(r.text);              // Ultron voice, serialized behind blind TTS
    }).catch(function () { BM.speak('The GM is silent.', 'urgent'); });
  }
  function selectGameIndex(i) { var c = state.choices[i]; if (c) doGameAction(c); else BM.speak('No choice ' + (i + 1) + '.', 'urgent'); }
  function chooseById(id) { var c = state.choices.find(function (x) { return x.id === id; }); if (c) doGameAction(c); else BM.speak('Not available right now.', 'urgent'); }

  // ---------- utils ----------
  function cap(s) { return s ? s[0].toUpperCase() + s.slice(1) : s; }
  function plural(n, w) { return n === 1 ? w : w + 's'; }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]; }); }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
