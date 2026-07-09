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
    el('start-delve').addEventListener('click', startDelve);
    el('create-form').addEventListener('submit', onCreate);
    el('skill-begin').addEventListener('click', confirmCharacter);
    el('skill-auto').addEventListener('click', resetSkills);
    el('lobby-start').addEventListener('click', startAdventure);
    window.addEventListener('beforeunload', function () {
      if (state.clientId && navigator.sendBeacon) navigator.sendBeacon('/api/session/leave', JSON.stringify({ clientId: state.clientId }));
    });
    connectSSE(null);
    setTimeout(function () {
      BM.speak('Welcome to Personal Game Master. Enter your name and pick an icon, then start a new delve, or join an active delve from the panel. Hold space or the microphone to speak.', 'event');
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
      b.type = 'button'; b.setAttribute('role', 'radio'); b.setAttribute('aria-checked', String(i === 0));
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
    if (state.you.phase === 'playing' && state.you.run) {
      if (state.mode !== 'game') enterGame();
      renderGame(state.you);
    } else if (state.mode === 'lobby') {
      renderLobby(state.you);
    }
  }

  // ---------- side window (all delves) ----------
  function renderSideWindow(sessions) {
    var box = el('delve-list'); box.innerHTML = '';
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
      var actions = canAct
        ? '<div class="dactions">' + (s.phase === 'lobby' ? '<button data-join="' + s.id + '">Join</button>' : '') + '<button data-watch="' + s.id + '">Watch</button></div>'
        : '';
      card.innerHTML = '<div class="dtitle"><span>' + esc(s.name) + '</span><span class="dphase">' + s.phase + '</span></div>'
        + '<div class="dmeta">' + meta + '</div>'
        + '<div class="delve-heroes">' + heroes + '</div>' + actions;
      box.appendChild(card);
    });
    if (!state.clientId) {
      box.querySelectorAll('[data-join]').forEach(function (b) { b.addEventListener('click', function () { joinDelveAs(b.getAttribute('data-join'), 'player'); }); });
      box.querySelectorAll('[data-watch]').forEach(function (b) { b.addEventListener('click', function () { joinDelveAs(b.getAttribute('data-watch'), 'spectator'); }); });
    }
  }

  function requireName() {
    var name = el('handle').value.trim();
    if (!name) { el('join-error').textContent = 'Enter a name first.'; BM.speak('Enter a name first.', 'urgent'); el('handle').focus(); return null; }
    return name;
  }

  // ---------- start / join a delve ----------
  function startDelve() {
    var name = requireName(); if (!name) return;
    api('/api/session/create', { name: name, icon: state.icon, delveName: el('delve-name').value.trim() }).then(function (r) {
      if (!r.ok) return BM.speak(r.error || 'Could not start.', 'urgent');
      afterJoin(r, 'player'); enterCreate();
    });
  }
  function joinDelveAs(sessionId, role) {
    var name = requireName(); if (!name) return;
    api('/api/session/join', { sessionId: sessionId, name: name, icon: state.icon, role: role }).then(function (r) {
      if (!r.ok) { el('join-error').textContent = r.error + (r.canSpectate ? ' (You can watch instead.)' : ''); BM.speak(r.error, 'urgent'); return; }
      afterJoin(r, r.role);
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
    showScreen('create');
    var nf = el('name').closest('.field'); if (nf) nf.hidden = true;
    BM.speak('Choose your race and class, then your skills.', 'event');
  }
  function onCreate(e) {
    e.preventDefault();
    state.charInput = { name: el('handle').value.trim(), race: el('race').value, cls: el('cls').value };
    api('/api/character/plan', state.charInput).then(function (plan) {
      state.plan = plan; state.selected = new Set(plan.smartDefault); showScreen('skills'); renderSkillStep();
    });
  }
  function confirmCharacter() {
    api('/api/session/character', Object.assign({}, state.charInput, { clientId: state.clientId, skills: Array.from(state.selected) })).then(function (r) {
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
    you.members.forEach(function (m) {
      var li = document.createElement('li');
      var meta = m.ready ? (cap(m.race || '') + ' ' + cap(m.cls || '')) : 'choosing…';
      li.innerHTML = '<span class="ricon">' + m.icon + '</span><span>' + esc(m.name) + (m.isYou ? ' (you)' : '') + (m.ai ? ' 🤖' : '') + '</span>'
        + '<span class="rmeta ' + (m.ready ? 'ready' : 'waiting') + '">' + (m.ready ? '✓ ' + esc(meta) : '…choosing') + '</span>';
      pl.appendChild(li);
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
    var box = el('companion-picker'); box.innerHTML = '';
    (state.meta.companions || []).forEach(function (c) {
      var b = document.createElement('button'); b.type = 'button';
      b.textContent = '+ ' + c.icon + ' ' + c.name + ' (' + cap(c.cls) + ')';
      b.addEventListener('click', function () { addCompanion(c.index, c.name); });
      box.appendChild(b);
    });
  }
  function addCompanion(index, name) {
    api('/api/session/companion', { clientId: state.clientId, index: index }).then(function (r) {
      if (!r.ok) BM.speak(r.error || 'Could not add companion.', 'urgent');
      else BM.speak(name + ' joins the party.', 'urgent');
    });
  }
  function startAdventure() {
    api('/api/session/start', { clientId: state.clientId }).then(function (r) { if (!r.ok) BM.speak(r.error || 'Cannot start yet.', 'urgent'); });
  }

  // ---------- game ----------
  function enterGame() { showScreen('game'); el('log').innerHTML = ''; state.lastSeq = 0; state.lastAnnouncedTurn = null;
    BM.speak(state.role === 'spectator' ? 'The adventure begins. You are watching.' : 'The adventure begins!', 'urgent'); }

  function renderGame(you) {
    var run = you.run;
    el('hud-hero').textContent = you.name + ' — Room ' + (run.roomsCleared + 1) + ' · Rd ' + run.round;
    el('hud-enemy').textContent = ''; el('hud-gold').textContent = 'Gold: ' + run.gold;
    var myTurn = !!(run.turn && run.turn.ownerClientId === state.clientId);
    var banner = el('turn-banner'); banner.className = 'turn-banner';
    if (run.phase === 'combat') {
      if (run.turn) { if (myTurn) { banner.textContent = '▶ Your turn — act now!'; banner.classList.add('mine'); } else banner.textContent = 'Waiting for ' + run.turn.name + '…'; }
      else banner.textContent = 'Resolving…';
    } else if (run.phase === 'cleared') { banner.textContent = '✔ Room cleared — descend when ready.'; banner.classList.add('cleared'); }
    else if (run.phase === 'defeated') { banner.textContent = '☠ The party has fallen.'; banner.classList.add('defeated'); }

    renderStrip('party-strip', run.combatants.filter(function (c) { return c.side === 'hero'; }));
    renderStrip('enemy-strip', run.combatants.filter(function (c) { return c.side === 'enemy'; }));
    renderInventory(run.inventory);

    (run.log || []).forEach(function (e) {
      if (e.seq > state.lastSeq) { state.lastSeq = e.seq; appendLog(e.text, e.priority); BM.speak(e.text, e.priority);
        if (e.priority === 'urgent') { var a = el('announce'); if (a) a.textContent = e.text; } }
    });
    renderGameChoices(run, myTurn);
  }
  function renderStrip(id, list) {
    var ul = el(id); ul.innerHTML = '';
    list.forEach(function (c) {
      var li = document.createElement('li');
      if (c.current) li.classList.add('current');
      if (c.down) li.classList.add('down');
      if (!c.down && c.hp <= c.maxHp / 3) li.classList.add('hurt');
      li.innerHTML = '<span>' + (c.icon || '') + '</span><span class="cn">' + esc(c.name) + (c.ownerClientId === state.clientId ? ' (you)' : '') + (c.ai ? ' 🤖' : '')
        + '</span><span class="hp">' + (c.down ? 'down' : c.hp + '/' + c.maxHp) + '</span>';
      ul.appendChild(li);
    });
  }
  function renderInventory(inv) {
    var box = el('inventory');
    if (!inv || !inv.length) { box.textContent = ''; return; }
    box.innerHTML = '<span class="bag">Party bag:</span> ' + inv.map(function (i) {
      return (i.icon || '') + ' ' + esc(i.short || i.name) + ' ×' + i.qty;
    }).join('  ·  ');
  }

  function renderGameChoices(run, myTurn) {
    var choices = [];
    if (run.phase === 'combat' && myTurn) {
      (run.enemies || []).forEach(function (e) { choices.push({ id: 'attack', target: e.id, label: 'Attack ' + e.name }); });
      (run.inventory || []).forEach(function (i) {
        var verb = i.verb === 'drink' ? 'Drink ' : (i.verb === 'throw' ? 'Throw ' : 'Use ');
        choices.push({ id: 'use', item: i.key, label: verb + (i.short || i.name) });
      });
      choices.push({ id: 'pass', label: 'Hold action' });
    } else if (run.phase === 'cleared') { choices.push({ id: 'descend', label: 'Descend deeper' }); }
    else if (run.phase === 'defeated') { choices.push({ id: 'leave', label: 'Return to start' }); }
    state.choices = choices;
    var nav = el('choices'); nav.innerHTML = '';
    choices.forEach(function (c, i) {
      var b = document.createElement('button'); b.type = 'button';
      b.innerHTML = '<span class="num">' + (i + 1) + '</span><span>' + esc(c.label) + '</span>';
      b.addEventListener('click', function () { doGameAction(c); });
      nav.appendChild(b);
    });
    if (myTurn && run.turn && run.turn.combatantId !== state.lastAnnouncedTurn) {
      state.lastAnnouncedTurn = run.turn.combatantId;
      BM.speak('Your turn. ' + choices.map(function (c, i) { return (i + 1) + ', ' + c.label; }).join('. ') + '.', 'event');
    }
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
    api('/api/session/action', body).then(function (r) { if (!r.ok) BM.speak(r.error || 'Cannot do that.', 'urgent'); });
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
    var NUM = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9 };
    var mk = t.match(/^#choice (\d)$/); if (mk) return selectGameIndex(parseInt(mk[1], 10) - 1);
    var w = t.match(/\b(one|two|three|four|five|six|seven|eight|nine)\b/); if (w) return selectGameIndex(NUM[w[1]] - 1);
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
    BM.speak('Say attack, pass, a number, or wait for your turn.', 'urgent');
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
