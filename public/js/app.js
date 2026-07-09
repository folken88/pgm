/**
 * PGM v0 client — drives creation (name/race/class → skill allocation → run) and
 * the turn loop, renders the log + numbered choices + HUD + skill allocator, and
 * routes keyboard/voice commands to actions via BlindMode. The server is
 * authoritative; this only sends actions and renders what comes back.
 */
(function () {
  'use strict';
  var BM = window.BlindMode;

  var state = {
    mode: 'create',            // 'create' | 'skills' | 'game'
    charInput: null,
    plan: null,                // { points, skills:[...], smartDefault:[keys] }
    selected: new Set(),
    runId: null,
    choices: [],
  };

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
    el('skill-begin').addEventListener('click', beginRun);
    el('skill-auto').addEventListener('click', resetSkills);
    setTimeout(function () {
      BM.speak('Welcome to Personal Game Master. Create your character: name, race, and class, then choose skills. '
        + 'Hold the space bar or the microphone button to speak a command at any time.', 'event');
    }, 350);
  }

  function fill(id, items) {
    var sel = el(id); sel.innerHTML = '';
    items.forEach(function (v) {
      var o = document.createElement('option');
      o.value = v; o.textContent = cap(v); sel.appendChild(o);
    });
    if (id === 'cls') sel.value = 'fighter';
  }

  // ---------- step 1: identity -> skill plan ----------
  function onCreate(e) {
    e.preventDefault();
    state.charInput = { name: el('name').value, race: el('race').value, cls: el('cls').value };
    api('/api/character/plan', state.charInput).then(function (plan) {
      state.plan = plan;
      state.selected = new Set(plan.smartDefault);
      state.mode = 'skills';
      el('create').hidden = true;
      el('skills').hidden = false;
      renderSkillStep();
      el('skills-h').setAttribute('tabindex', '-1'); el('skills-h').focus();
    });
  }

  // ---------- step 2: skill allocation ----------
  function renderSkillStep() {
    renderSkillList();
    updatePoints();
    var pts = state.plan.points;
    BM.speak('You have ' + pts + ' skill ' + plural(pts, 'point') + '. '
      + 'Suggested skills are selected, including Perception. '
      + 'Say begin, or toggle a skill by name or number. Class skills gain a plus 3 bonus.', 'event');
  }

  function renderSkillList() {
    var list = el('skill-list'); list.innerHTML = '';
    state.plan.skills.forEach(function (s, i) {
      var on = state.selected.has(s.key);
      var b = document.createElement('button');
      b.type = 'button';
      b.setAttribute('aria-pressed', String(on));
      b.dataset.key = s.key;
      var mod = (s.trainedMod >= 0 ? '+' : '') + s.trainedMod;
      b.innerHTML =
        '<span class="chk">' + (on ? '✓' : '○') + '</span>' +
        '<span>' + (i + 1) + '. ' + esc(s.name) + (s.classSkill ? ' <span class="star">★</span>' : '') +
        (s.trainedOnly ? ' <span class="locked">(trained)</span>' : '') + '</span>' +
        '<span class="smod">' + mod + '</span>';
      b.setAttribute('aria-label',
        s.name + (s.classSkill ? ', class skill' : '') + ', bonus if trained ' + mod + (on ? ', selected' : ', not selected'));
      b.addEventListener('click', function () { toggleSkill(s.key); });
      list.appendChild(b);
    });
  }

  function toggleSkill(key, silent) {
    var s = state.plan.skills.find(function (x) { return x.key === key; });
    if (!s) return;
    if (state.selected.has(key)) {
      state.selected.delete(key);
      if (!silent) BM.speak(s.name + ' deselected.', 'urgent');
    } else {
      if (state.selected.size >= state.plan.points) {
        return BM.speak('No skill points left. Deselect one first.', 'urgent');
      }
      state.selected.add(key);
      if (!silent) BM.speak(s.name + ' selected. Bonus ' + (s.trainedMod >= 0 ? 'plus ' : '') + s.trainedMod + '.', 'urgent');
    }
    reflectButton(key);
    updatePoints();
  }

  function reflectButton(key) {
    var b = el('skill-list').querySelector('button[data-key="' + key + '"]');
    if (!b) return;
    var on = state.selected.has(key);
    b.setAttribute('aria-pressed', String(on));
    b.querySelector('.chk').textContent = on ? '✓' : '○';
  }

  function updatePoints() {
    var left = state.plan.points - state.selected.size;
    el('skill-points').textContent = 'Points remaining: ' + left + ' of ' + state.plan.points;
  }

  function resetSkills() {
    state.selected = new Set(state.plan.smartDefault);
    renderSkillList(); updatePoints();
    BM.speak('Reset to suggested skills.', 'urgent');
  }

  function beginRun() {
    api('/api/run/start', Object.assign({}, state.charInput, { skills: Array.from(state.selected) }))
      .then(function (res) {
        state.runId = res.runId; state.mode = 'game';
        el('skills').hidden = true; el('game').hidden = false;
        render(res.snapshot, res.events);
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
    (events || []).forEach(function (ev) {
      appendLog(ev.text, ev.priority, classify(ev.text));
      BM.speak(ev.text, ev.priority);
      if (ev.priority === 'urgent') { var a = el('announce'); if (a) a.textContent = ev.text; }
    });
    if (snap.hero) {
      el('hud-hero').textContent = snap.hero.name + ' — HP ' + snap.hero.hp + '/' + snap.hero.maxHp + ' · AC ' + snap.hero.ac;
    }
    el('hud-enemy').textContent = snap.creature ? (snap.creature.name + ' HP ' + snap.creature.hp + '/' + snap.creature.maxHp) : '';
    el('hud-gold').textContent = 'Gold: ' + (snap.gold || 0);
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
    log.appendChild(p); log.scrollTop = log.scrollHeight;
  }
  function classify(t) {
    if (/^You (strike|swing|grip)|Your /.test(t)) return 'you';
    if (/^The .+ (hits|lunges|falls|blow)/.test(t)) return 'foe';
    return '';
  }

  function resetToCreate() {
    state.mode = 'create'; state.runId = null; state.choices = []; state.selected = new Set();
    el('log').innerHTML = ''; el('choices').innerHTML = '';
    el('game').hidden = true; el('skills').hidden = true; el('create').hidden = false;
    el('name').focus();
    BM.speak('New run. Create your character.', 'event');
  }

  // ---------- command routing (voice + number keys), branches by mode ----------
  var NUM_WORDS = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9 };

  function handleCommand(raw) {
    var t = raw.trim();

    // Global speech controls (all modes)
    if (/\b(repeat|again|say that)\b/.test(t)) return BM.repeat();
    if (/\bfaster\b/.test(t)) return BM.faster();
    if (/\bslower\b/.test(t)) return BM.slower();
    if (/\b(mute|quiet|silence|stop talking)\b/.test(t)) return BM.toggleMute();

    if (state.mode === 'skills') return skillsCommand(t);
    if (state.mode === 'game') return gameCommand(t);
    // create mode: allow "next"/"skills" to submit the form
    if (/\b(next|skills|continue|proceed)\b/.test(t)) { el('create-form').requestSubmit(); return; }
    BM.speak('Fill in your character, then say next.', 'urgent');
  }

  function skillsCommand(t) {
    var mk = t.match(/^#choice (\d)$/); if (mk) return toggleByIndex(parseInt(mk[1], 10) - 1);
    if (/\b(begin|start|descend|go|done|ready)\b/.test(t)) return beginRun();
    if (/\b(reset|auto|suggest|suggested|default)\b/.test(t)) return resetSkills();
    var w = t.match(/\b(one|two|three|four|five|six|seven|eight|nine)\b/);
    if (w) return toggleByIndex(NUM_WORDS[w[1]] - 1);
    var d = t.match(/\b(\d+)\b/); if (d) return toggleByIndex(parseInt(d[1], 10) - 1);
    // "toggle/add/remove <skill name>" or just the skill name
    var name = t.replace(/\b(toggle|add|remove|pick|choose|select|deselect|drop|take)\b/g, '').trim();
    var hit = matchSkill(name);
    if (hit) return toggleSkill(hit.key);
    BM.speak("Say a skill name, a number, reset, or begin.", 'urgent');
  }

  function matchSkill(name) {
    if (!name) return null;
    name = name.toLowerCase();
    var skills = state.plan.skills;
    return skills.find(function (s) { return s.name.toLowerCase() === name; })
        || skills.find(function (s) { return s.name.toLowerCase().indexOf(name) >= 0; })
        || skills.find(function (s) { return name.indexOf(s.name.toLowerCase()) >= 0; });
  }
  function toggleByIndex(i) {
    var s = state.plan.skills[i];
    if (s) toggleSkill(s.key);
    else BM.speak('No skill number ' + (i + 1) + '.', 'urgent');
  }

  function gameCommand(t) {
    var mk = t.match(/^#choice (\d)$/); if (mk) return selectIndex(parseInt(mk[1], 10) - 1);
    var w = t.match(/\b(one|two|three|four|five|six|seven|eight|nine)\b/);
    if (w) return selectIndex(NUM_WORDS[w[1]] - 1);
    var d = t.match(/\bchoice (\d)\b/) || t.match(/^(\d)$/); if (d) return selectIndex(parseInt(d[1], 10) - 1);
    var id = keywordToId(t);
    if (id) { if (hasChoice(id)) return doAction(id); return BM.speak("You can't do that right now.", 'urgent'); }
    BM.speak("I didn't catch a command. Try attack, look, status, or a number.", 'urgent');
  }
  function keywordToId(t) {
    if (/\b(attack|hit|strike|swing|fight|kill)\b/.test(t)) return 'attack';
    if (/\b(look|around|here|examine|where)\b/.test(t)) return 'look';
    if (/\b(status|character|health|stats|check|skills|me|myself)\b/.test(t)) return 'status';
    if (/\b(flee|run|leave|escape|exit|retreat)\b/.test(t)) return 'flee';
    if (/\b(continue|descend|deeper|next|onward|proceed|go)\b/.test(t)) return 'continue';
    if (/\b(new|again|restart|start over|new run)\b/.test(t)) return 'newrun';
    return null;
  }
  function hasChoice(id) { return state.choices.some(function (c) { return c.id === id; }); }
  function selectIndex(i) {
    var c = state.choices[i];
    if (c) doAction(c.id); else BM.speak('No choice ' + (i + 1) + '.', 'urgent');
  }

  // ---------- utils ----------
  function cap(s) { return s ? s[0].toUpperCase() + s.slice(1) : s; }
  function plural(n, w) { return n === 1 ? w : w + 's'; }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]; }); }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
