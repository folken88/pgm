/**
 * PGM blind-mode engine — mirrors poker-dungeon's blindMode keymap exactly
 * where possible (2026-07-11 realignment; see docs/PARITY-AUDIT-2026-07-11.md):
 *
 *   `        toggle blind mode on/off (announced; sessionStorage, like poker)
 *   ?        help / learn mode — keys are SPOKEN, not fired
 *   1-9      pick a numbered choice/action
 *   0        open the next door (descend) — poker's 0
 *   A        attack (queued target if you picked one in E-mode, else first foe)
 *   E        inspect-enemies mode: Tab cycles foes, Enter targets, Escape closes
 *   K        spellbook: Tab cycles castable spells, Enter casts, Escape closes
 *   C        cycle at-will cantrip element (casters) — poker's C
 *   L        Life: your own status (level, class, HP, AC) — poker's L
 *   M        Money: gold + depth — poker's M
 *   H        party health summary
 *   B        party BUFFS — poker's B (bail is NOT on a key; see Escape)
 *   D        party debuffs — poker's D
 *   P        browse the party status panel piece by piece (PGM addition)
 *   X        level and experience progression
 *   S        stop speaking (skips what's playing, keeps the rest queued)
 *   \        jump into the chat field (Enter sends, Escape cancels)
 *   Escape   session menu: Tab cycles Retreat / Return to start, Enter fires.
 *            Numbers deliberately NOT mapped here (poker: stray digit bailed a
 *            run). Single-key bail was removed for the same fat-finger reason.
 *   Space    hold to talk (push-to-talk voice), release to send
 *   [ / ]    reading speed slower / faster (persisted)
 *   - / =    narration volume down / up (persisted)
 *
 * OFF by default (sighted players see a normal UI, no TTS). The 👁 button at
 * top-left and the backtick both toggle. GM narration audio (Ultron) plays for
 * EVERYONE — blind mode governs the access-tier TTS (menus, statuses, events).
 *
 * Diagnostics ring buffer: window.BlindMode.getLogs().
 */
(function () {
  'use strict';

  var TTS = window.speechSynthesis || null;
  var SR = window.SpeechRecognition || window.webkitSpeechRecognition || null;
  var supportsTTS = !!TTS, supportsSR = !!SR;

  var PRIO = { ambient: 0, event: 1, urgent: 2 };
  var on = false;                  // blind mode — OFF by default (poker convention)
  var queue = [], speaking = false, muted = false, lastText = '';
  var rate = 1.35, volume = 1;     // persisted localStorage (poker: blindRate/blindVolume)
  try {
    var r0 = parseFloat(localStorage.getItem('blindRate')); if (r0 >= 0.6 && r0 <= 2.4) rate = r0;
    var v0 = parseFloat(localStorage.getItem('blindVolume')); if (v0 >= 0.1 && v0 <= 1) volume = v0;
  } catch (e) {}
  var commandHandler = null, voice = null;
  var blindOnHook = null;   // app-provided: speaks context-aware guidance when blind mode turns on
  var info = {};                   // app-registered providers: foes/spells/status/health/buffs/debuffs/money/descend/cantrip/chatFocus/…
  var helpMode = false;            // '?' learn mode
  var pttActive = false;           // did WE capture this Space for push-to-talk? (see isActionable)
  var browse = null;               // {kind:'foes'|'spells'|'party'|'session', list, idx}

  var logs = [];
  function blog() { var m = '[BlindMode] ' + Array.prototype.join.call(arguments, ' '); logs.push(m); if (logs.length > 300) logs.shift(); try { console.log(m); } catch (e) {} }

  // ---- speech (3-tier priority queue) ----
  function pickVoice() {
    if (!supportsTTS) return;
    var vs = TTS.getVoices();
    voice = vs.find(function (v) { return /en[-_]/i.test(v.lang) && /female|zira|jenny|samantha/i.test(v.name); })
         || vs.find(function (v) { return /en[-_]/i.test(v.lang); }) || vs[0] || null;
  }
  // ONE pump for ALL audio — browser TTS *and* GM (Ultron) MP3 lines share the
  // queue, so the GM can never talk over blind-mode announcements (Tobias:
  // overlap = word salad for a blind player).
  //
  // HARDENING (poker's blindMode learned these the hard way — see its comments):
  // Chrome DROPS utterance onend sometimes, and auto-pauses long speech at
  // ~15s. Relying on onend alone can wedge this pump forever. So: `cur` tracks
  // the in-flight item (onstart/onboundary refresh lastAlive), a 3s watchdog
  // force-advances anything silent too long, and resume() fires every 8s.
  var pumpGen = 0;   // bumped by stop/mute so a skipped in-flight GM fetch can't resurrect
  var cur = null;    // { text, isAudio, started, startedAt, lastAlive, retried }
  function itemDone(gen) {
    if (gen !== undefined && gen !== pumpGen) return;   // stale callback from a skipped item
    cur = null; speaking = false; pump();
  }
  function pump() {
    if (muted || speaking || queue.length === 0) return;
    var item = queue.shift();
    if (item.audioPromise) {                   // GM line (ElevenLabs)
      speaking = true;
      var gen = pumpGen;
      cur = { text: item.text, isAudio: true, started: false, startedAt: Date.now(), lastAlive: Date.now() };
      item.audioPromise.then(function (b64) {
        if (gen !== pumpGen) return;           // skipped/muted while fetching
        if (muted) { itemDone(gen); return; }
        if (b64) {
          gmAudio = new Audio('data:audio/mpeg;base64,' + b64);
          gmAudio.volume = volume;
          gmAudio.ontimeupdate = function () { if (cur) { cur.started = true; cur.lastAlive = Date.now(); } };
          gmAudio.onended = gmAudio.onerror = function () { itemDone(gen); };
          gmAudio.play().catch(function () { if (gen === pumpGen) { cur = null; speaking = false; fallbackTts(item.text); } });
        } else { cur = null; speaking = false; fallbackTts(item.text); }
      }).catch(function () { if (gen === pumpGen) { cur = null; speaking = false; fallbackTts(item.text); } });
      return;
    }
    if (!supportsTTS) { pump(); return; }
    speakUtterance(item.text, false);
  }
  // Ear-fixes (poker's WORD_FIXES): applied ONLY at speech time — the visible
  // text keeps its notation. "vs" reads as "versus", not "v s".
  var WORD_FIXES = [
    [/\bvs\.?\b/gi, 'versus'],
  ];
  function earFix(text) {
    WORD_FIXES.forEach(function (f) { text = text.replace(f[0], f[1]); });
    // Strip emoji / pictographs / symbols so the screen reader doesn't announce
    // "sparkles", "skull", "drop of blood" mid-narration (Josh 2026-07-14: "every
    // action had a visual descriptor"). The VISIBLE text keeps its glyphs.
    text = text.replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2190}-\u{21FF}\u{2B00}-\u{2BFF}\u{2300}-\u{23FF}\u{FE00}-\u{FE0F}\u{200D}\u{20E3}]/gu, ' ');
    // "65/80" → "65 of 80" (poker parity — the voice wastes time on every slash).
    text = text.replace(/(\d+)\s*\/\s*(\d+)/g, '$1 of $2');
    return text.replace(/\s{2,}/g, ' ').trim();
  }
  function speakUtterance(text, isRetry) {
    var gen = pumpGen;
    var u = new SpeechSynthesisUtterance(earFix(text));
    u.rate = rate; u.volume = volume; if (voice) u.voice = voice;
    cur = { text: text, isAudio: false, started: false, startedAt: Date.now(), lastAlive: Date.now(), retried: !!isRetry };
    u.onstart = function () { if (cur) { cur.started = true; cur.lastAlive = Date.now(); } };
    u.onboundary = function () { if (cur) cur.lastAlive = Date.now(); };
    u.onend = u.onerror = function () { itemDone(gen); };
    speaking = true;
    try { TTS.speak(u); } catch (e) { cur = null; speaking = false; }
  }
  // Watchdog: never let a wedged engine hold the queue hostage.
  setInterval(function () {
    if (!speaking || !cur) return;
    var now = Date.now();
    if (cur.isAudio) {
      // A GM clip that has produced no timeupdate for 12s (or never started
      // within 15s of the fetch beginning) is stuck — skip it.
      if (now - cur.lastAlive > 12000 || (!cur.started && now - cur.startedAt > 15000)) {
        blog('watchdog: GM clip stuck — skipping');
        pumpGen++;
        if (gmAudio) { try { gmAudio.pause(); } catch (e) {} gmAudio = null; }
        cur = null; speaking = false; pump();
      }
      return;
    }
    if (!cur.started && now - cur.startedAt > 5000) {
      // Utterance queued but never started: engine wedged. Retry the line once,
      // then give up on it and move on.
      blog('watchdog: utterance never started —', cur.retried ? 'skipping' : 'retrying');
      var text = cur.text, retried = cur.retried;
      pumpGen++;
      try { TTS.cancel(); } catch (e) {}
      cur = null; speaking = false;
      if (!retried) speakUtterance(text, true); else pump();
      return;
    }
    if (cur.started && now - cur.lastAlive > 10000) {
      // Engine claims busy but has been silent 10s (onend was dropped) — advance.
      blog('watchdog: utterance silent too long — advancing');
      pumpGen++;
      try { TTS.cancel(); } catch (e) {}
      cur = null; speaking = false; pump();
    }
  }, 3000);
  // Chrome auto-pauses speechSynthesis around the 15s mark; an unconditional
  // resume() defeats it (poker does exactly this).
  if (supportsTTS) setInterval(function () { try { TTS.resume(); } catch (e) {} }, 8000);
  // A GM/companion CLIP failed to fetch. GM narration is meant for EVERYONE, so
  // degrade to browser TTS for all players (not just blind mode) — otherwise a
  // dropped clip means a sighted player misses the room's narration entirely
  // (Tobias: "the GM didn't announce what we see in room 2").
  function fallbackTts(text) {
    if (text) rawSpeak(text, 'urgent'); else pump();
  }
  function rawSpeak(text, prio) {   // internal: ignores the on/off gate (toggle announcements)
    if (!supportsTTS || !text) return;
    var weight = PRIO[prio] != null ? PRIO[prio] : 1;
    if (weight >= PRIO.urgent) {
      queue = queue.filter(function (q) { return PRIO[q.prio] >= PRIO.urgent; });
      pumpGen++;                                     // an in-flight GM fetch must not resurrect
      try { TTS.cancel(); } catch (e) {}
      if (gmAudio) { try { gmAudio.pause(); } catch (e) {} gmAudio = null; }   // never talk over: the access tier wins
      cur = null; speaking = false;
      queue.unshift({ text: text, prio: prio });
    } else if (weight === PRIO.ambient && queue.length) return;
    else queue.push({ text: text, prio: prio });
    pump();
  }
  function speak(text, prio) {
    if (!text) return;
    lastText = text; setStatus(text);
    if (!on) return;                       // blind mode off: visible text only
    rawSpeak(text, prio || 'event');
  }
  function repeat() { if (lastText) speak(lastText, 'urgent'); }
  function clampRate(r) { return Math.max(0.6, Math.min(2.4, r)); }
  function saveRate() { try { localStorage.setItem('blindRate', String(rate)); } catch (e) {} }
  function faster() { rate = clampRate(rate + 0.15); saveRate(); speak('Faster.', 'urgent'); }
  function slower() { rate = clampRate(rate - 0.15); saveRate(); speak('Slower.', 'urgent'); }
  function nudgeVolume(d) {
    volume = Math.max(0.1, Math.min(1, volume + d));
    try { localStorage.setItem('blindVolume', String(volume)); } catch (e) {}
    speak('Volume ' + Math.round(volume * 100) + ' percent.', 'urgent');
  }
  // S key — poker's "sacred stop": skip what's playing NOW, keep the queue.
  function stopSpeaking() {
    pumpGen++;
    try { TTS && TTS.cancel(); } catch (e) {}
    if (gmAudio) { try { gmAudio.pause(); } catch (e) {} gmAudio = null; }
    cur = null; speaking = false;
    pump();
  }
  // Drop everything pending AND stop the current clip — used when the party
  // moves to a new room so the GM can't narrate a room behind (Tobias: "cancel
  // his announcement if the players move onto the next room").
  function flushSpeech() {
    pumpGen++;
    queue = [];
    try { TTS && TTS.cancel(); } catch (e) {}
    if (gmAudio) { try { gmAudio.pause(); } catch (e) {} gmAudio = null; }
    cur = null; speaking = false;
  }
  function toggleMute() {
    muted = !muted;
    if (muted) { pumpGen++; try { TTS && TTS.cancel(); } catch (e) {} queue = []; cur = null; speaking = false; if (gmAudio) { try { gmAudio.pause(); } catch (e) {} gmAudio = null; } }
    var btn = document.getElementById('mute');
    if (btn) { btn.setAttribute('aria-pressed', String(muted)); btn.textContent = muted ? '🔇 Speech: off' : '🔊 Speech: on'; }
    toast(muted ? 'Speech off' : 'Speech on');
  }

  // ---- blind-mode toggle (poker: backtick, announced, sessionStorage) ----
  function toggle() {
    setOn(!on);
  }
  function setOn(next) {
    on = !!next;
    try { sessionStorage.setItem('blindMode', on ? '1' : '0'); } catch (e) {}
    var btn = document.getElementById('blind-toggle');
    if (btn) { btn.setAttribute('aria-pressed', String(on)); btn.textContent = on ? '👁 Blind mode: ON' : '👁 Blind mode: off'; }
    document.body.classList.toggle('blind-on', on);
    // A SHORT announcement — never a wall of keys (Tobias 2026-07-13: "don't spam
    // keys they won't remember"). The app's onBlindOn hook then guides them
    // through the next step for wherever they are; question mark teaches keys on
    // demand.
    rawSpeak(on ? 'Blind mode on. Press question mark any time to learn the keys.' : 'Blind mode off.', 'urgent');
    if (on && typeof blindOnHook === 'function') { try { blindOnHook(); } catch (e) {} }
    blog('blind mode', on ? 'ON' : 'off');
  }

  // ---- GM voice (ElevenLabs "Ultron") — plays for EVERYONE ----
  var gmVoiceOn = false, gmAudio = null;
  function setGMVoice(v) { gmVoiceOn = !!v; blog('GM voice', gmVoiceOn ? 'ON (ElevenLabs)' : 'off (browser TTS fallback)'); }
  function speakGM(text) {
    if (!text) return;
    lastText = text; setStatus(text);
    if (muted) return;
    if (!gmVoiceOn) { if (on) rawSpeak(text, 'urgent'); return; }
    // Prefetch the audio NOW, but play it only when the queue reaches it —
    // GM lines wait their turn behind in-flight blind-TTS and vice versa.
    var audioPromise = fetch('/api/tts', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: text }) })
      .then(function (r) { return r.json(); })
      .then(function (d) { return (d && d.ok && d.audio) ? d.audio : null; })
      .catch(function () { return null; });
    queue.push({ text: text, prio: 'urgent', audioPromise: audioPromise });
    pump();
  }
  /** Speak as a specific character (their 11labs voiceId) — same queue. */
  function speakAs(text, voiceId) {
    if (!text) return;
    lastText = text; setStatus(text);
    if (muted) return;
    if (!gmVoiceOn || !voiceId) { if (on) rawSpeak(text, 'urgent'); return; }
    var audioPromise = fetch('/api/tts', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: text, voiceId: voiceId }) })
      .then(function (r) { return r.json(); })
      .then(function (d) { return (d && d.ok && d.audio) ? d.audio : null; })
      .catch(function () { return null; });
    queue.push({ text: text, prio: 'urgent', audioPromise: audioPromise });
    pump();
  }

  // ---- push-to-talk (blind mode only) ----
  var recog = null, listening = false;
  function buildRecog() {
    if (!supportsSR) return null;
    var r = new SR();
    r.lang = 'en-US'; r.interimResults = false; r.maxAlternatives = 1; r.continuous = false;
    r.onresult = function (e) {
      var t = (e.results[0] && e.results[0][0] && e.results[0][0].transcript || '').trim();
      blog('heard:', JSON.stringify(t));
      if (!t) return;
      if (/^blind\s+off$/i.test(t)) return toggle();     // poker voice command
      if (commandHandler) commandHandler(t.toLowerCase());
    };
    r.onerror = function (e) { blog('SR error:', e.error); if (e.error === 'not-allowed') toast('Microphone blocked — keyboard still works.'); };
    r.onend = function () { listening = false; setPTT(false); };
    return r;
  }
  function startListen() {
    // Voice control works for EVERYONE via the mic buttons; the Space-hold
    // shortcut stays blind-mode-only (see onKeydown).
    if (!supportsSR) { toast('Voice control needs Chrome/Edge — keyboard works everywhere.'); return; }
    if (listening) return;
    if (!recog) recog = buildRecog();
    try { recog.start(); listening = true; setPTT(true); speak('Listening.', 'urgent'); } catch (e) {}
  }
  function stopListen() { if (recog && listening) { try { recog.stop(); } catch (e) {} } listening = false; setPTT(false); }
  function setPTT(v) {
    var b = document.getElementById('ptt');
    if (b) { b.setAttribute('aria-pressed', String(v)); b.textContent = v ? '🔴 Listening…' : '🎤 Hold to speak'; }
    var m = document.getElementById('ptt-main');
    if (m) { m.setAttribute('aria-pressed', String(v)); m.textContent = v ? '🔴' : '🎤'; }
  }

  // ---- browse modes (E foes / K spells / P party / Esc session menu) ----
  // Tab cycles (Shift-Tab back), Enter acts, Escape closes. The session menu is
  // poker's Esc menu: bail lives HERE behind an explicit Enter, never on a
  // single key, and numbers are deliberately not mapped inside it (a stray
  // digit once bailed a poker run).
  function openBrowse(kind) {
    var list;
    if (kind === 'session') {
      list = (info.sessionMenu && info.sessionMenu()) || [];
    } else {
      var src = kind === 'foes' ? info.foes : kind === 'spells' ? info.spells : info.party;
      list = (src && src()) || [];
    }
    var empty = { foes: 'No visible enemies.', spells: 'No spells available.', party: 'No party yet.', session: 'No session options here.' };
    if (!list.length) { speak(empty[kind], 'urgent'); return; }
    browse = { kind: kind, list: list, idx: 0 };
    speakBrowse();
  }
  function speakBrowse() {
    var it = browse.list[browse.idx];
    var pos = (browse.idx + 1) + ' of ' + browse.list.length;
    var head = { foes: 'Enemy ', spells: 'Spell ', party: 'Party member ', session: 'Session menu ' }[browse.kind];
    var enter = { foes: ', Enter to target', spells: ', Enter to cast', party: '', session: ', Enter to choose' }[browse.kind];
    speak(head + pos + ': ' + it.label + '. Tab for next' + enter + ', Escape to close.', 'urgent');
  }
  function browseKeydown(e) {
    if (e.key === 'Tab') {
      e.preventDefault();
      var n = browse.list.length;
      browse.idx = (browse.idx + (e.shiftKey ? n - 1 : 1)) % n;
      speakBrowse(); return true;
    }
    if (e.key === 'Enter' || e.code === 'NumpadEnter') {
      e.preventDefault();
      var it = browse.list[browse.idx]; var kind = browse.kind; browse = null;
      if (kind === 'foes') { if (info.targetFoe) info.targetFoe(it.id); }
      else if (kind === 'spells') { if (info.castSpell) info.castSpell(it.key); }
      else if (kind === 'session') { if (it.run) it.run(); }
      else speak(it.label + '.', 'urgent');   // party browse: Enter re-reads
      return true;
    }
    if (e.key === 'Escape') { e.preventDefault(); browse = null; speak('Menu closed.', 'urgent'); return true; }
    return false;
  }

  // ---- the keymap (mirrors poker's dungeon blind keys — see header) ----
  var HELP = {
    a: 'A. Repeat the last thing said (like the poker dungeon).', e: 'E. Inspect enemies. Tab cycles, Enter targets.',
    k: 'K. Spellbook. Tab cycles, Enter casts.', c: 'C. Cycle your at-will cantrip element.',
    l: 'L. Your own status — level, class, health, armor.', m: 'M. Money and depth.',
    h: 'H. Health of the party.', x: 'X. Level and experience.',
    b: 'B. Party buffs.', d: 'D. Party debuffs.',
    p: 'P. Browse the party status panel piece by piece.',
    s: 'S. Stop speaking.', '0': 'Zero. Open the next door when the room is clear.',
    '\\': 'Backslash. Jump into the chat field.',
    escape: 'Escape. Session menu — retreat lives there, behind Enter.',
    '[': 'Left bracket. Read slower.', ']': 'Right bracket. Read faster.',
    '-': 'Minus. Volume down.', '=': 'Equals. Volume up.',
    '?': 'Question mark. Toggles help mode.',
  };
  function isTyping(el) { return el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT'); }

  function onKeydown(e) {
    if (isTyping(document.activeElement)) return;
    if (e.key === '`') { e.preventDefault(); toggle(); return; }   // toggle works even when off
    if (/^[1-9]$/.test(e.key) && commandHandler) { commandHandler('#choice ' + e.key); return; }   // numbers work for everyone
    if (!on) return;

    if (browse && browseKeydown(e)) return;
    var k = (e.key || '').toLowerCase();
    var hk = e.key === 'Escape' ? 'escape' : k;
    // '?' ALWAYS toggles help mode, and it MUST be tested BEFORE the learn-mode guard
    // below. It used to sit after it — so once help mode was on, HELP['?'] just spoke
    // its own description and returned, and HELP['escape'] did the same. There was NO
    // way out. (Josh, trapped: "once you go into help mode you can't get out. Hitting ?
    // only tells you about help mode. Escape only tells you about the escape menu.")
    if (e.key === '?') { e.preventDefault(); helpMode = !helpMode; speak(helpMode ? 'Help mode on. Press any key to hear what it does, without doing it. Question mark or Escape to exit.' : 'Help mode off.', 'urgent'); return; }
    if (helpMode && e.key === 'Escape') { e.preventDefault(); helpMode = false; speak('Help mode off.', 'urgent'); return; }   // second, obvious way out
    if (helpMode && HELP[hk]) { e.preventDefault(); speak(HELP[hk], 'urgent'); return; }   // learn mode: speak, don't fire
    // SPACE = push-to-talk — but NEVER steal it from a screen reader or a focused control.
    // VoiceOver ACTIVATES with VO+Space (Ctrl+Option+Space), and a bare Space on a focused
    // button/link must click it. We used to preventDefault() every Space, so a VoiceOver
    // user could not press anything. (Josh: "anytime I hit spacebar it wants to capture
    // sound. It doesn't activate anything.") Only grab a BARE space on a non-actionable target.
    if (e.code === 'Space' && !e.ctrlKey && !e.altKey && !e.metaKey && !isActionable(document.activeElement)) {
      e.preventDefault(); pttActive = true; startListen(); return;
    }
    if (k === 's') { e.preventDefault(); stopSpeaking(); return; }
    if (k === 'h') { e.preventDefault(); speak((info.health && info.health()) || lastText || 'Nothing yet.', 'urgent'); return; }
    if (k === 'l') { e.preventDefault(); speak((info.status && info.status()) || 'No character yet.', 'urgent'); return; }
    if (k === 'm') { e.preventDefault(); speak((info.money && info.money()) || 'No gold yet.', 'urgent'); return; }
    if (k === 'x') { e.preventDefault(); speak((info.progression && info.progression()) || 'No progression yet.', 'urgent'); return; }
    if (k === 'b') { e.preventDefault(); speak((info.buffs && info.buffs()) || 'No buffs.', 'urgent'); return; }
    if (k === 'd') { e.preventDefault(); speak((info.debuffs && info.debuffs()) || 'No debuffs.', 'urgent'); return; }
    if (k === 'c') { e.preventDefault(); if (info.cantrip) info.cantrip(); else speak('No cantrip to cycle.', 'urgent'); return; }
    if (k === 'e') { e.preventDefault(); openBrowse('foes'); return; }
    if (k === 'k') { e.preventDefault(); openBrowse('spells'); return; }
    if (k === 'p') { e.preventDefault(); openBrowse('party'); return; }
    if (k === 'a') { e.preventDefault(); repeat(); return; }   // A = repeat (poker parity, Josh 2026-07-14). Attacks are on the number keys.
    if (e.key === '0') { e.preventDefault(); if (info.descend) info.descend(); return; }
    if (e.key === '\\') { e.preventDefault(); if (info.chatFocus) info.chatFocus(); return; }
    if (e.key === 'Escape') { e.preventDefault(); openBrowse('session'); return; }
    if (e.key === ']') { faster(); return; }
    if (e.key === '[') { slower(); return; }
    if (e.key === '=' || e.key === '+') { nudgeVolume(0.1); return; }
    if (e.key === '-' || e.key === '_') { nudgeVolume(-0.1); return; }
  }
  // Only stop a push-to-talk we actually STARTED — otherwise a Space we deliberately
  // let through (VoiceOver activation, a focused button) would still be swallowed here.
  function onKeyup(e) { if (e.code === 'Space' && on && pttActive) { pttActive = false; e.preventDefault(); stopListen(); } }
  // Is focus on something a Space press is supposed to ACTIVATE? If so, push-to-talk
  // must keep its hands off (see the Space branch in onKeydown).
  function isActionable(el) {
    if (!el || el === document.body) return false;
    var t = (el.tagName || '').toUpperCase();
    if (t === 'BUTTON' || t === 'A' || t === 'INPUT' || t === 'SELECT' || t === 'TEXTAREA' || t === 'SUMMARY') return true;
    if (el.isContentEditable) return true;
    var r = ((el.getAttribute && el.getAttribute('role')) || '').toLowerCase();
    return r === 'button' || r === 'link' || r === 'checkbox' || r === 'radio' || r === 'menuitem' || r === 'menuitemcheckbox' || r === 'tab' || r === 'option' || r === 'switch';
  }

  // ---- ui helpers ----
  var toastTimer = null;
  function toast(msg) {
    var el = document.getElementById('toast'); if (!el) return;
    el.textContent = msg; el.hidden = false;
    clearTimeout(toastTimer); toastTimer = setTimeout(function () { el.hidden = true; }, 2600);
  }
  function setStatus(msg) {
    var el = document.getElementById('status-line');
    if (el) el.textContent = msg.length > 70 ? msg.slice(0, 67) + '…' : msg;
  }

  // ---- init ----
  function init(opts) {
    opts = opts || {};
    commandHandler = opts.onCommand || null;
    blindOnHook = opts.onBlindOn || null;
    if (supportsTTS) { pickVoice(); TTS.onvoiceschanged = pickVoice; }

    var bt = document.getElementById('blind-toggle');
    if (bt) bt.addEventListener('click', toggle);
    var pttB = document.getElementById('ptt');
    if (pttB) {
      pttB.addEventListener('pointerdown', function (e) { e.preventDefault(); startListen(); });
      pttB.addEventListener('pointerup', function (e) { e.preventDefault(); stopListen(); });
      pttB.addEventListener('pointerleave', function () { if (listening) stopListen(); });
    }
    var onEl = function (id, fn) { var el = document.getElementById(id); if (el) el.addEventListener('click', fn); };
    onEl('repeat', repeat); onEl('slower', slower); onEl('faster', faster); onEl('mute', toggleMute);

    document.addEventListener('keydown', onKeydown);
    document.addEventListener('keyup', onKeyup);

    // Restore mode from sessionStorage (poker convention) — silent restore.
    try { if (sessionStorage.getItem('blindMode') === '1') { on = true; var b = document.getElementById('blind-toggle'); if (b) { b.setAttribute('aria-pressed', 'true'); b.textContent = '👁 Blind mode: ON'; } document.body.classList.add('blind-on'); } } catch (e) {}
    blog('init — TTS:', supportsTTS, 'SR:', supportsSR, 'blind:', on);
  }

  window.BlindMode = {
    init: init, speak: speak, speakGM: speakGM, speakAs: speakAs, setGMVoice: setGMVoice,
    repeat: repeat, faster: faster, slower: slower, toggleMute: toggleMute,
    stopSpeaking: stopSpeaking, flushSpeech: flushSpeech, nudgeVolume: nudgeVolume,
    toggle: toggle, isOn: function () { return on; }, isMuted: function () { return muted; },
    ptt: { start: startListen, stop: stopListen },
    registerInfo: function (providers) { info = Object.assign(info, providers || {}); },
    toast: toast, getLogs: function () { return logs.slice(); },
    setCommandHandler: function (fn) { commandHandler = fn; },
    caps: { tts: supportsTTS, sr: supportsSR },
  };
})();
