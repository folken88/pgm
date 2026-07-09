/**
 * PGM blind-mode accessibility engine (independent PGM implementation, built on
 * the patterns proven in poker's blindMode.js for Josh):
 *   - 3-tier priority speech queue (urgent > event > ambient; higher cancels lower)
 *   - Push-to-talk voice control (Web Speech recognition) — hold the mic button
 *     or hold Space; release to dispatch the recognized command
 *   - Keyboard shortcuts (number keys pick choices; H repeat; +/- speed; ` mute)
 *   - Diagnostic logging ring buffer (window.BlindMode.getLogs()) for debugging a
 *     remote blind tester's session
 *   - Capability detection + graceful fallback (keyboard still works everywhere)
 *
 * Public API (window.BlindMode): init, speak, repeat, faster, slower, toggleMute,
 * setCommandHandler, toast, getLogs.
 */
(function () {
  'use strict';

  var TTS = window.speechSynthesis || null;
  var SR = window.SpeechRecognition || window.webkitSpeechRecognition || null;
  var supportsTTS = !!TTS, supportsSR = !!SR;

  var PRIO = { ambient: 0, event: 1, urgent: 2 };
  var queue = [];
  var speaking = false;
  var muted = false;
  var rate = 1.35;                 // brisk default; screen-reader users go faster
  var lastText = '';
  var commandHandler = null;
  var voice = null;

  // ---- diagnostics ring buffer ----
  var logs = [];
  function blog() {
    var msg = '[BlindMode] ' + Array.prototype.join.call(arguments, ' ');
    logs.push(msg); if (logs.length > 300) logs.shift();
    try { console.log(msg); } catch (e) {}
  }

  // ---- speech ----
  function pickVoice() {
    if (!supportsTTS) return;
    var vs = TTS.getVoices();
    voice = vs.find(function (v) { return /en[-_]/i.test(v.lang) && /female|zira|jenny|samantha/i.test(v.name); })
         || vs.find(function (v) { return /en[-_]/i.test(v.lang); }) || vs[0] || null;
  }

  function pump() {
    if (!supportsTTS || muted || speaking || queue.length === 0) return;
    var item = queue.shift();
    var u = new SpeechSynthesisUtterance(item.text);
    u.rate = rate; if (voice) u.voice = voice;
    u.onend = u.onerror = function () { speaking = false; pump(); };
    speaking = true;
    try { TTS.speak(u); } catch (e) { blog('speak error', e && e.message); speaking = false; }
  }

  function speak(text, prio) {
    if (!text) return;
    prio = prio || 'event';
    lastText = text;
    setStatus(text);
    if (!supportsTTS) return;               // visible text + status line still update
    var weight = PRIO[prio] != null ? PRIO[prio] : 1;
    if (weight >= PRIO.urgent) {
      queue = queue.filter(function (q) { return PRIO[q.prio] >= PRIO.urgent; });
      try { TTS.cancel(); } catch (e) {}
      speaking = false;
      queue.unshift({ text: text, prio: prio });
    } else if (weight === PRIO.ambient && queue.length) {
      return;                               // drop ambient if anything is queued
    } else {
      queue.push({ text: text, prio: prio });
    }
    pump();
  }

  function repeat() { if (lastText) speak(lastText, 'urgent'); }
  function clampRate(r) { return Math.max(0.6, Math.min(2.4, r)); }
  function faster() { rate = clampRate(rate + 0.15); toast('Speech faster'); speak('Faster.', 'urgent'); }
  function slower() { rate = clampRate(rate - 0.15); toast('Speech slower'); speak('Slower.', 'urgent'); }
  function toggleMute() {
    muted = !muted;
    if (muted) { try { TTS && TTS.cancel(); } catch (e) {} queue = []; if (gmAudio) { try { gmAudio.pause(); } catch (e) {} } }
    var btn = document.getElementById('mute');
    if (btn) { btn.setAttribute('aria-pressed', String(muted)); btn.textContent = muted ? '🔇 Speech: off' : '🔊 Speech: on'; }
    toast(muted ? 'Speech off' : 'Speech on');
  }

  // ---- GM voice (ElevenLabs "Ultron"); silent fallback to browser TTS ----
  var gmVoiceOn = false, gmAudio = null;
  function setGMVoice(on) { gmVoiceOn = !!on; blog('GM voice', gmVoiceOn ? 'ON (ElevenLabs)' : 'off (browser TTS)'); }
  function speakGM(text) {
    if (!text) return;
    if (!gmVoiceOn || muted) return speak(text, 'urgent');   // fallback / respect mute
    lastText = text; setStatus(text);
    fetch('/api/tts', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: text }) })
      .then(function (r) { return r.json(); })
      .then(function (d) {
        if (muted) return;
        if (d && d.ok && d.audio) {
          try { if (TTS) TTS.cancel(); } catch (e) {}
          speaking = false;
          if (gmAudio) { try { gmAudio.pause(); } catch (e) {} }
          gmAudio = new Audio('data:audio/mpeg;base64,' + d.audio);
          gmAudio.onended = gmAudio.onerror = function () { pump(); };   // resume queued speech after the GM line
          gmAudio.play().catch(function () { speak(text, 'urgent'); });
        } else { speak(text, 'urgent'); }
      })
      .catch(function () { speak(text, 'urgent'); });
  }

  // ---- push-to-talk voice recognition ----
  var recog = null, listening = false;
  function buildRecog() {
    if (!supportsSR) return null;
    var r = new SR();
    r.lang = 'en-US'; r.interimResults = false; r.maxAlternatives = 1; r.continuous = false;
    r.onresult = function (e) {
      var t = (e.results[0] && e.results[0][0] && e.results[0][0].transcript || '').trim();
      blog('heard:', JSON.stringify(t));
      if (t && commandHandler) commandHandler(t.toLowerCase());
    };
    r.onerror = function (e) { blog('SR error:', e.error); if (e.error === 'not-allowed') toast('Microphone blocked — use the keyboard/buttons.'); };
    r.onend = function () { listening = false; setPTT(false); };
    return r;
  }
  function startListen() {
    if (!supportsSR) { toast('Voice control not supported in this browser — keyboard still works.'); return; }
    if (listening) return;
    if (!recog) recog = buildRecog();
    try { recog.start(); listening = true; setPTT(true); speak('Listening.', 'urgent'); blog('listening start'); }
    catch (e) { blog('start failed', e && e.message); }
  }
  function stopListen() {
    if (recog && listening) { try { recog.stop(); } catch (e) {} }
    listening = false; setPTT(false);
  }
  function setPTT(on) {
    var b = document.getElementById('ptt');
    if (b) { b.setAttribute('aria-pressed', String(on)); b.textContent = on ? '🔴 Listening…' : '🎤 Hold to speak'; }
  }

  // ---- ui helpers ----
  var toastTimer = null;
  function toast(msg) {
    var el = document.getElementById('toast');
    if (!el) return;
    el.textContent = msg; el.hidden = false;
    clearTimeout(toastTimer); toastTimer = setTimeout(function () { el.hidden = true; }, 2600);
  }
  function setStatus(msg) {
    var el = document.getElementById('status-line');
    if (el) el.textContent = msg.length > 70 ? msg.slice(0, 67) + '…' : msg;
  }

  function isTyping(el) {
    return el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT');
  }

  // ---- init / wiring ----
  function init(opts) {
    opts = opts || {};
    commandHandler = opts.onCommand || null;

    if (supportsTTS) { pickVoice(); TTS.onvoiceschanged = pickVoice; }
    else toast('Text-to-speech unavailable — on-screen text is fully readable.');

    // Buttons
    bindPTT(document.getElementById('ptt'));
    on('repeat', 'click', repeat);
    on('slower', 'click', slower);
    on('faster', 'click', faster);
    on('mute', 'click', toggleMute);

    // Keyboard
    document.addEventListener('keydown', function (e) {
      if (isTyping(document.activeElement)) return;
      // Space = push-to-talk (hold)
      if (e.code === 'Space') { e.preventDefault(); startListen(); return; }
      if (e.key === 'h' || e.key === 'H') { e.preventDefault(); repeat(); return; }
      if (e.key === '+' || e.key === '=') { faster(); return; }
      if (e.key === '-' || e.key === '_') { slower(); return; }
      if (e.key === '`') { toggleMute(); return; }
      if (/^[1-9]$/.test(e.key) && commandHandler) { commandHandler('#choice ' + e.key); }
    });
    document.addEventListener('keyup', function (e) {
      if (e.code === 'Space') { e.preventDefault(); stopListen(); }
    });

    blog('init — TTS:', supportsTTS, 'SR:', supportsSR);
    if (!supportsSR) toast('Voice control needs Chrome/Edge — keyboard & buttons work everywhere.');
  }

  function bindPTT(btn) {
    if (!btn) return;
    btn.addEventListener('pointerdown', function (e) { e.preventDefault(); startListen(); });
    btn.addEventListener('pointerup', function (e) { e.preventDefault(); stopListen(); });
    btn.addEventListener('pointerleave', function () { if (listening) stopListen(); });
  }
  function on(id, ev, fn) { var el = document.getElementById(id); if (el) el.addEventListener(ev, fn); }

  window.BlindMode = {
    init: init, speak: speak, speakGM: speakGM, setGMVoice: setGMVoice,
    repeat: repeat, faster: faster, slower: slower,
    toggleMute: toggleMute, toast: toast, getLogs: function () { return logs.slice(); },
    setCommandHandler: function (fn) { commandHandler = fn; },
    caps: { tts: supportsTTS, sr: supportsSR },
  };
})();
