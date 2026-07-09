/**
 * ElevenLabs TTS for the Game-Master voice — server-side ONLY.
 *
 * The API key lives in process.env.ELEVENLABS_API_KEY (set via .env / deploy env)
 * and MUST NEVER appear in a client payload, URL, log line, or error. PGM's repo
 * is PUBLIC — the key is not committed; only this code that reads it from the
 * environment is.
 *
 * The GM voice is chosen by NAME (default "Ultron", override via GM_VOICE) and
 * resolved to a voice_id at first use via the /v1/voices API — so no voice_id
 * hash needs to be hand-copied. If the key is missing or the voice isn't found,
 * synthesize() returns null and callers fall back to the browser's TTS.
 */
const API_KEY = process.env.ELEVENLABS_API_KEY || '';
const MODEL = process.env.ELEVENLABS_MODEL || 'eleven_multilingual_v2';
const TIMEOUT_MS = parseInt(process.env.ELEVENLABS_TIMEOUT_MS || '12000', 10);
const GM_VOICE = process.env.GM_VOICE || 'Ultron';
const ENABLED = !!API_KEY;

// A GM / rogue-AI delivery: steady and deliberate, not rushed.
const VOICE_SETTINGS = { stability: 0.55, similarity_boost: 0.8, style: 0.15, use_speaker_boost: true, speed: 0.92 };

const audioCache = new Map();     // text -> base64 mp3 (synth once, serve all clients)
let _voiceId = undefined;         // undefined = unresolved, null = not found, string = id

if (ENABLED) console.log(`[11labs] enabled (GM voice "${GM_VOICE}", model ${MODEL})`);
else console.log('[11labs] disabled (no ELEVENLABS_API_KEY) — GM narration uses browser TTS');

/** Resolve the configured GM voice NAME to its voice_id (cached). */
async function resolveVoiceId() {
  if (_voiceId !== undefined) return _voiceId;
  try {
    const res = await fetch('https://api.elevenlabs.io/v1/voices', { headers: { 'xi-api-key': API_KEY } });
    if (!res.ok) { console.warn(`[11labs] voices HTTP ${res.status}`); _voiceId = null; return null; }
    const data = await res.json();
    const want = GM_VOICE.toLowerCase();
    const v = (data.voices || []).find(x => (x.name || '').toLowerCase() === want);
    _voiceId = v ? v.voice_id : null;
    if (!_voiceId) console.warn(`[11labs] GM voice "${GM_VOICE}" not found in account — falling back to browser TTS`);
    else console.log(`[11labs] resolved GM voice "${GM_VOICE}"`);
    return _voiceId;
  } catch (e) { console.warn('[11labs] voice resolve failed'); _voiceId = null; return null; }
}

/** Synthesize a GM line. Returns base64 mp3, or null (caller falls back). */
async function synthesize(text) {
  if (!ENABLED || !text) return null;
  const clean = String(text).trim().slice(0, 400);
  if (!clean) return null;
  if (audioCache.has(clean)) return audioCache.get(clean);

  const voiceId = await resolveVoiceId();
  if (!voiceId) return null;

  const url = `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}?output_format=mp3_44100_128`;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'xi-api-key': API_KEY, 'Content-Type': 'application/json', 'Accept': 'audio/mpeg' },
      body: JSON.stringify({ text: clean, model_id: MODEL, voice_settings: VOICE_SETTINGS }),
      signal: ctrl.signal,
    });
    if (!res.ok) { console.warn(`[11labs] HTTP ${res.status}`); return null; }
    const buf = await res.arrayBuffer();
    if (!buf || buf.byteLength === 0) return null;
    const b64 = Buffer.from(buf).toString('base64');
    if (audioCache.size < 300) audioCache.set(clean, b64);
    return b64;
  } catch (e) { return null; } finally { clearTimeout(timer); }
}

module.exports = { synthesize, enabled: () => ENABLED, voiceName: () => GM_VOICE };
