/**
 * PGM client — multiplayer flow: landing (join as player/spectator with name +
 * icon) → character creation (players) → live lobby → shared run. State is pushed
 * from the server over SSE, so every client's roster stays in sync. The server is
 * authoritative; this renders snapshots and sends actions.
 *
 * Screens: landing | create | skills | lobby | game.
 */
(function () {
  'use strict';
  var BM = window.BlindMode;

  var state = {
    mode: 'landing',
    role: null,               // 'player' | 'spectator'
    clientId: null,
    icon: null,
    meta: null,
    session: null,            // latest server snapshot
    plan: null, selected: new Set(), charInput: null,
    // run/combat state reserved for the combat increment
    runId: null, choices: [],
  };

  var el = function (id) { return document.getElementById(id); };
  var api = function (url, body) {
    return fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}) })
      .then(function (r) { return r.json(); });
  };

  var SCREENS = ['landing', 'create', 'skills', 'lobby', 'game'];
  function showScreen(id) {
    SCREENS.forEach(function (s) { el(s).hidden = (s !== id); });
    state.mode = id;
    var h = el(id + '-h') || el(id).querySelector('h2');
    if (h) { h.setAttribute('tabindex', '-1'); h.focus(); }
  }

  // ---------- setup ----------
  function boot() {
    BM.init({ onCommand: handleCommand });
    fetch('/api/meta').then(function (r) { return r.json(); }).then(function (meta) {
      state.meta = meta;
      fill('race', meta.races); fill('cls', meta.classes);
      buildIconPicker(meta.icons);
    });
    el('join-play').addEventListener('click', function () { joinAs('player'); });
    el('join-spectate').addEventListener('click', function () { joinAs('spectator'); });
    el('create-form').addEventListener('submit', onCreate);
    el('skill-begin').addEventListener('click', confirmCharacter);
    el('skill-auto').addEventListener('click', resetSkills);
    el('lobby-start').addEventListener('click', startAdventure);
    window.addEventListener('beforeunload', function () {
      if (state.clientId && navigator.sendBeacon) {
        navigator.sendBeacon('/api/session/leave', JSON.stringify({ clientId: state.clientId }));
      }
    });
    connectSSE();
    setTimeout(function () {
      BM.speak('Welcome to Personal Game Master. Enter your name, pick an icon, then choose Play or Spectate. '
        + 'Hold space or the microphone to speak a command.', 'event');
    }, 350);
  }

  function fill(id, items) {
    var sel = el(id); sel.innerHTML = '';
    items.forEach(function (v) { var o = document.createElement('option'); o.value = v; o.textContent = cap(v); sel.appendChild(o); });
    if (id === 'cls') sel.value = 'fighter';
  }

  function buildIconPicker(icons) {
    var box = el('icon-picker'); box.innerHTML = '';
    (icons || []).forEach(function (ic, i) {
      var b = document.createElement('button');
      b.type = 'button'; b.setAttribute('role', 'radio');
      b.setAttribute('aria-checked', String(i === 0));
      b.setAttribute('aria-label', 'Icon ' + (i + 1)); b.textContent = ic;
      b.addEventListener('click', function () { selectIcon(ic, b); });
      box.appendChild(b);
      if (i === 0) state.icon = ic;
    });
  }
  function selectIcon(ic, btn) {
    state.icon = ic;
    [].forEach.call(el('icon-picker').children, function (b) { b.setAttribute('aria-checked', String(b === btn)); });
  }

  // ---------- SSE live sync ----------
  function connectSSE() {
    try {
      var es = new EventSource('/api/session/stream');
      es.addEventListener('state', function (e) {
        try { onState(JSON.parse(e.data)); } catch (err) {}
      });
      es.onerror = function () { /* browser auto-reconnects */ };
    } catch (e) { BM.toast('Live updates unavailable in this browser.'); }
  }

  function onState(snap) {
    var prev = state.session;
    state.session = snap;
    if (state.mode === 'landing') updateLandingOccupancy(snap);
    if (state.mode === 'lobby') renderLobby(snap);
    // Everyone jumps to the game when the host starts.
    if (snap.phase === 'playing' && (state.mode === 'lobby')) enterGame(snap);
    // Announce meaningful roster changes while in the lobby.
    if (state.mode === 'lobby' && prev) announceRosterDelta(prev, snap);
  }

  function updateLandingOccupancy(snap) {
    var p = snap.counts.players, s = snap.counts.spectators;
    var txt = (p || s)
      ? (p + ' ' + plural(p, 'adventurer') + ' and ' + s + ' ' + plural(s, 'onlooker') + ' here in "' + snap.name + '".')
      : 'No one here yet — start the party.';
    el('session-here').textContent = txt;
  }

  // ---------- join ----------
  function joinAs(role) {
    var name = el('handle').value.trim();
    if (!name) { el('join-error').textContent = 'Enter a name first.'; BM.speak('Enter a name first.', 'urgent'); el('handle').focus(); return; }
    api('/api/session/join', { name: name, icon: state.icon, role: role }).then(function (r) {
      if (!r.ok) {
        el('join-error').textContent = r.error + (r.canSpectate ? ' You can spectate instead.' : '');
        BM.speak(r.error, 'urgent');
        return;
      }
      state.clientId = r.clientId; state.role = r.role; state.session = r.snapshot;
      el('join-error').textContent = '';
      if (r.role === 'player') { enterCreate(); }
      else { showScreen('lobby'); renderLobby(r.snapshot); BM.speak('You are spectating ' + r.snapshot.name + '.', 'event'); }
    });
  }

  // ---------- create (players) ----------
  function enterCreate() {
    showScreen('create');
    var nameField = el('name').closest('.field'); if (nameField) nameField.hidden = true;   // name comes from landing
    BM.speak('Choose your race and class, then your skills.', 'event');
  }

  function onCreate(e) {
    e.preventDefault();
    state.charInput = { name: el('handle').value.trim(), race: el('race').value, cls: el('cls').value };
    api('/api/character/plan', state.charInput).then(function (plan) {
      state.plan = plan; state.selected = new Set(plan.smartDefault);
      showScreen('skills'); renderSkillStep();
    });
  }

  // ---------- skills ----------
  function renderSkillStep() {
    renderSkillList(); updatePoints();
    var pts = state.plan.points;
    BM.speak('You have ' + pts + ' skill ' + plural(pts, 'point') + '. Suggested skills are selected, including Perception. '
      + 'Say confirm when ready, or toggle a skill by name or number.', 'event');
  }
  function renderSkillList() {
    var list = el('skill-list'); list.innerHTML = '';
    state.plan.skills.forEach(function (s, i) {
      var on = state.selected.has(s.key);
      var b = document.createElement('button');
      b.type = 'button'; b.setAttribute('aria-pressed', String(on)); b.dataset.key = s.key;
      var mod = (s.trainedMod >= 0 ? '+' : '') + s.trainedMod;
      b.innerHTML = '<span class="chk">' + (on ? '✓' : '○') + '</span>' +
        '<span>' + (i + 1) + '. ' + esc(s.name) + (s.classSkill ? ' <span class="star">★</span>' : '') +
        (s.trainedOnly ? ' <span class="locked">(trained)</span>' : '') + '</span>' +
        '<span class="smod">' + mod + '</span>';
      b.setAttribute('aria-label', s.name + (s.classSkill ? ', class skill' : '') + ', bonus if trained ' + mod + (on ? ', selected' : ', not selected'));
      b.addEventListener('click', function () { toggleSkill(s.key); });
      list.appendChild(b);
    });
  }
  function toggleSkill(key, silent) {
    var s = state.plan.skills.find(function (x) { return x.key === key; });
    if (!s) return;
    if (state.selected.has(key)) { state.selected.delete(key); if (!silent) BM.speak(s.name + ' deselected.', 'urgent'); }
    else {
      if (state.selected.size >= state.plan.points) return BM.speak('No skill points left. Deselect one first.', 'urgent');
      state.selected.add(key); if (!silent) BM.speak(s.name + ' selected. Bonus ' + (s.trainedMod >= 0 ? 'plus ' : '') + s.trainedMod + '.', 'urgent');
    }
    reflectButton(key); updatePoints();
  }
  function reflectButton(key) {
    var b = el('skill-list').querySelector('button[data-key="' + key + '"]'); if (!b) return;
    var on = state.selected.has(key); b.setAttribute('aria-pressed', String(on)); b.querySelector('.chk').textContent = on ? '✓' : '○';
  }
  function updatePoints() { el('skill-points').textContent = 'Points remaining: ' + (state.plan.points - state.selected.size) + ' of ' + state.plan.points; }
  function resetSkills() { state.selected = new Set(state.plan.smartDefault); renderSkillList(); updatePoints(); BM.speak('Reset to suggested skills.', 'urgent'); }

  // ---------- confirm character -> lobby ----------
  function confirmCharacter() {
    api('/api/session/character', Object.assign({}, state.charInput, { clientId: state.clientId, skills: Array.from(state.selected) }))
      .then(function (r) {
        if (!r.ok) return BM.speak(r.error || 'Could not confirm character.', 'urgent');
        showScreen('lobby'); renderLobby(r.snapshot);
        BM.speak('Character confirmed. You are in the lobby.', 'event');
      });
  }

  // ---------- lobby ----------
  function renderLobby(snap) {
    el('lobby-name').textContent = snap.name;
    el('players-count').textContent = snap.counts.players;
    el('spectators-count').textContent = snap.counts.spectators;

    var me = snap.players.find(function (p) { return p.clientId === state.clientId; })
          || snap.spectators.find(function (s) { return s.clientId === state.clientId; });
    el('lobby-you').textContent = state.role === 'spectator'
      ? 'You are watching as ' + (me ? me.icon + ' ' + me.name : 'a spectator') + '.'
      : 'You are ' + (me ? me.icon + ' ' + me.name : 'an adventurer') + '.';

    var pl = el('players-list'); pl.innerHTML = '';
    snap.players.forEach(function (p) {
      var li = document.createElement('li');
      var meta = p.character || p.cls ? (cap(p.race || '') + ' ' + cap(p.cls || '')) : 'choosing…';
      li.innerHTML = '<span class="ricon">' + p.icon + '</span><span>' + esc(p.name) + (p.clientId === state.clientId ? ' (you)' : '') + '</span>'
        + '<span class="rmeta ' + (p.ready ? 'ready' : 'waiting') + '">' + (p.ready ? '✓ ' + esc(meta) : '…choosing') + '</span>';
      pl.appendChild(li);
    });
    var sl = el('spectators-list'); sl.innerHTML = '';
    snap.spectators.forEach(function (s) {
      var li = document.createElement('li');
      li.innerHTML = '<span class="ricon">' + s.icon + '</span><span>' + esc(s.name) + (s.clientId === state.clientId ? ' (you)' : '') + '</span>';
      sl.appendChild(li);
    });

    var readyCount = snap.players.filter(function (p) { return p.ready; }).length;
    var canStart = state.role === 'player' && snap.phase === 'lobby' && readyCount >= 1;
    el('lobby-start').hidden = !canStart;
    el('lobby-wait').textContent = snap.phase !== 'lobby' ? 'The adventure has begun.'
      : (readyCount === 0 ? 'Waiting for at least one ready adventurer…'
        : (state.role === 'spectator' ? 'Waiting for the party to begin…' : ''));
  }

  function announceRosterDelta(prev, snap) {
    var was = prev.counts.players + prev.counts.spectators;
    var now = snap.counts.players + snap.counts.spectators;
    if (now > was) BM.speak('Someone joined. ' + snap.counts.players + ' adventurers, ' + snap.counts.spectators + ' onlookers.', 'ambient');
  }

  function startAdventure() {
    api('/api/session/start', { clientId: state.clientId }).then(function (r) {
      if (!r.ok) BM.speak(r.error || 'Cannot start yet.', 'urgent');
      // success arrives via the SSE 'playing' broadcast -> enterGame
    });
  }

  // ---------- game (placeholder until the combat increment) ----------
  function enterGame(snap) {
    showScreen('game');
    el('log').innerHTML = '';
    var party = snap.players.filter(function (p) { return p.ready; }).map(function (p) { return p.icon + ' ' + p.name; }).join(', ');
    var line = 'The party descends together: ' + party + '. '
      + (state.role === 'spectator' ? 'You watch from the shadows.' : 'Ready yourselves.')
      + ' (Turn-based multiplayer combat is the next build.)';
    var p = document.createElement('p'); p.className = 'urgent'; p.textContent = line; el('log').appendChild(p);
    el('hud-hero').textContent = snap.name + ' — ' + snap.counts.players + ' adventurers';
    el('hud-enemy').textContent = ''; el('hud-gold').textContent = 'Spectators: ' + snap.counts.spectators;
    el('choices').innerHTML = '';
    BM.speak(line, 'urgent');
  }

  // ---------- command routing ----------
  function handleCommand(raw) {
    var t = raw.trim();
    if (/\b(repeat|again|say that)\b/.test(t)) return BM.repeat();
    if (/\bfaster\b/.test(t)) return BM.faster();
    if (/\bslower\b/.test(t)) return BM.slower();
    if (/\b(mute|quiet|silence|stop talking)\b/.test(t)) return BM.toggleMute();

    if (state.mode === 'landing') {
      if (/\b(play|player|join|adventure)\b/.test(t)) return joinAs('player');
      if (/\b(spectate|watch|onlooker|observe)\b/.test(t)) return joinAs('spectator');
      return BM.speak('Say play or spectate, after entering your name.', 'urgent');
    }
    if (state.mode === 'skills') return skillsCommand(t);
    if (state.mode === 'lobby') {
      if (/\b(start|begin|go|descend)\b/.test(t)) return startAdventure();
      return BM.speak('Waiting in the lobby. Say start to begin.', 'urgent');
    }
    if (state.mode === 'create') {
      if (/\b(next|skills|continue|proceed)\b/.test(t)) { el('create-form').requestSubmit(); return; }
    }
    BM.speak('No command for this screen yet.', 'urgent');
  }

  function skillsCommand(t) {
    if (/\b(confirm|begin|start|done|ready|descend)\b/.test(t)) return confirmCharacter();
    if (/\b(reset|auto|suggest|suggested|default)\b/.test(t)) return resetSkills();
    var w = t.match(/\b(one|two|three|four|five|six|seven|eight|nine)\b/);
    var NUM = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9 };
    if (w) return toggleByIndex(NUM[w[1]] - 1);
    var d = t.match(/\b(\d+)\b/); if (d) return toggleByIndex(parseInt(d[1], 10) - 1);
    var name = t.replace(/\b(toggle|add|remove|pick|choose|select|deselect|drop|take)\b/g, '').trim();
    var hit = matchSkill(name); if (hit) return toggleSkill(hit.key);
    BM.speak('Say a skill name, a number, reset, or confirm.', 'urgent');
  }
  function matchSkill(name) {
    if (!name) return null; name = name.toLowerCase(); var s = state.plan.skills;
    return s.find(function (x) { return x.name.toLowerCase() === name; })
        || s.find(function (x) { return x.name.toLowerCase().indexOf(name) >= 0; })
        || s.find(function (x) { return name.indexOf(x.name.toLowerCase()) >= 0; });
  }
  function toggleByIndex(i) { var s = state.plan.skills[i]; if (s) toggleSkill(s.key); else BM.speak('No skill number ' + (i + 1) + '.', 'urgent'); }

  // ---------- utils ----------
  function cap(s) { return s ? s[0].toUpperCase() + s.slice(1) : s; }
  function plural(n, w) { return n === 1 ? w : w + 's'; }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]; }); }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
