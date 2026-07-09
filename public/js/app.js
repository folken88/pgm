/**
 * PGM v0 client — drives character creation and the turn loop, renders the log +
 * numbered choices + HUD, and routes keyboard/voice commands to game actions via
 * BlindMode. The server is authoritative; this only sends actions and renders
 * the snapshot/events it gets back.
 */
(function () {
  'use strict';
  var BM = window.BlindMode;

  var state = { runId: null, choices: [] };

  var el = function (id) { return document.getElementById(id); };
  var api = function (url, body) {
    return fetch(url, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body || {}),
    }).then(function (r) { return r.json(); });
  };

  // ---------- setup ----------
  function boot() {
    BM.init({ onCommand: handleCommand });
    fetch('/api/meta').then(function (r) { return r.json(); }).then(function (meta) {
      fill('race', meta.races); fill('cls', meta.classes);
    }).catch(function () {});
    el('create-form').addEventListener('submit', onCreate);
    // Welcome, once voices are likely ready.
    setTimeout(function () {
      BM.speak('Welcome to Personal Game Master. Create your character: name, race, and class, then begin the descent. '
        + 'Hold the space bar or the microphone button to speak a command at any time.', 'event');
    }, 350);
  }

  function fill(id, items) {
    var sel = el(id);
    sel.innerHTML = '';
    items.forEach(function (v) {
      var o = document.createElement('option');
      o.value = v; o.textContent = cap(v);
      sel.appendChild(o);
    });
    if (id === 'cls') sel.value = 'fighter';
  }

  // ---------- create ----------
  function onCreate(e) {
    e.preventDefault();
    var body = { name: el('name').value, race: el('race').value, cls: el('cls').value };
    api('/api/run/start', body).then(function (res) {
      state.runId = res.runId;
      el('create').hidden = true;
      el('game').hidden = false;
      render(res.snapshot, res.events);
      // Move focus into the game for screen readers.
      el('game-h').setAttribute('tabindex', '-1'); el('game-h').focus();
    });
  }

  // ---------- turn loop ----------
  function doAction(action) {
    if (action === 'newrun') return resetToCreate();
    if (!state.runId) return;
    api('/api/run/' + state.runId + '/action', { action: action }).then(function (res) {
      render(res.snapshot, res.events);
    });
  }

  function render(snap, events) {
    // Narrate + append events.
    (events || []).forEach(function (ev) {
      appendLog(ev.text, ev.priority, classify(ev.text));
      BM.speak(ev.text, ev.priority);
      if (ev.priority === 'urgent') { var a = el('announce'); if (a) a.textContent = ev.text; }
    });
    // HUD
    if (snap.hero) {
      el('hud-hero').textContent = snap.hero.name + ' — HP ' + snap.hero.hp + '/' + snap.hero.maxHp + ' · AC ' + snap.hero.ac;
    }
    el('hud-enemy').textContent = snap.creature ? (snap.creature.name + ' HP ' + snap.creature.hp + '/' + snap.creature.maxHp) : '';
    el('hud-gold').textContent = 'Gold: ' + (snap.gold || 0);
    // Choices
    state.choices = snap.choices || [];
    renderChoices(state.choices);
  }

  function renderChoices(choices) {
    var nav = el('choices'); nav.innerHTML = '';
    choices.forEach(function (c, i) {
      var b = document.createElement('button');
      b.type = 'button';
      b.innerHTML = '<span class="num">' + (i + 1) + '</span><span>' + esc(c.label) + '</span>';
      b.addEventListener('click', function () { doAction(c.id); });
      nav.appendChild(b);
    });
    // Speak the menu (ambient so it never stomps combat lines).
    if (choices.length) {
      var menu = 'Choices: ' + choices.map(function (c, i) { return (i + 1) + ', ' + c.label; }).join('. ') + '.';
      BM.speak(menu, 'ambient');
    }
  }

  function appendLog(text, prio, cls) {
    var log = el('log');
    var p = document.createElement('p');
    p.textContent = text;
    if (prio === 'urgent') p.classList.add('urgent');
    if (cls) p.classList.add(cls);
    log.appendChild(p);
    log.scrollTop = log.scrollHeight;
  }

  function classify(t) {
    if (/^You (strike|swing|grip)|Your /.test(t)) return 'you';
    if (/^The .+ (hits|lunges|falls|blow)/.test(t)) return 'foe';
    return '';
  }

  function resetToCreate() {
    state.runId = null; state.choices = [];
    el('log').innerHTML = ''; el('choices').innerHTML = '';
    el('game').hidden = true; el('create').hidden = false;
    el('name').focus();
    BM.speak('New run. Create your character.', 'event');
  }

  // ---------- command routing (voice + number keys) ----------
  var NUM_WORDS = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9 };

  function handleCommand(raw) {
    var t = raw.trim();

    // Number-key selection: "#choice N"
    var mk = t.match(/^#choice (\d)$/);
    if (mk) return selectIndex(parseInt(mk[1], 10) - 1);

    // Global speech controls
    if (/\b(repeat|again|say that)\b/.test(t)) return BM.repeat();
    if (/\bfaster\b/.test(t)) return BM.faster();
    if (/\bslower\b/.test(t)) return BM.slower();
    if (/\b(mute|quiet|silence|stop talking)\b/.test(t)) return BM.toggleMute();

    // Spoken number → choice index
    var w = t.match(/\b(one|two|three|four|five|six|seven|eight|nine)\b/);
    if (w) return selectIndex(NUM_WORDS[w[1]] - 1);
    var d = t.match(/\bchoice (\d)\b/) || t.match(/^(\d)$/);
    if (d) return selectIndex(parseInt(d[1], 10) - 1);

    // Keyword → action id, then only dispatch if it's an available choice
    var id = keywordToId(t);
    if (id) {
      if (hasChoice(id)) return doAction(id);
      return BM.speak("You can't do that right now.", 'urgent');
    }
    BM.speak("I didn't catch a command. Try attack, look, status, or a number.", 'urgent');
  }

  function keywordToId(t) {
    if (/\b(attack|hit|strike|swing|fight|kill)\b/.test(t)) return 'attack';
    if (/\b(look|around|here|examine|where)\b/.test(t)) return 'look';
    if (/\b(status|character|health|stats|check|me|myself)\b/.test(t)) return 'status';
    if (/\b(flee|run|leave|escape|exit|retreat)\b/.test(t)) return 'flee';
    if (/\b(continue|descend|deeper|next|onward|proceed|go)\b/.test(t)) return 'continue';
    if (/\b(new|again|restart|start over|new run)\b/.test(t)) return 'newrun';
    return null;
  }

  function hasChoice(id) { return state.choices.some(function (c) { return c.id === id; }); }
  function selectIndex(i) {
    var c = state.choices[i];
    if (c) doAction(c.id);
    else BM.speak('No choice ' + (i + 1) + '.', 'urgent');
  }

  // ---------- utils ----------
  function cap(s) { return s ? s[0].toUpperCase() + s.slice(1) : s; }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]; }); }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
