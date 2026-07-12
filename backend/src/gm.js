/**
 * The LLM GAME MASTER — answers questions and narrates color via chat/PTT.
 * Provider chain (Tobias): local Ollama (RTX-5080 box, primary when up) →
 * OpenRouter → OpenAI. All env-driven; each is skipped if unconfigured/down.
 *
 * HARD BOUNDARY (design spec): the GM NEVER adjudicates mechanics — no rolls,
 * no damage, no rule inventions. It narrates, roleplays, and answers questions
 * about the visible situation; PF1 RAW for rules questions (standing principle).
 */
const OLLAMA_URL = process.env.OLLAMA_URL || 'http://192.168.1.202:11434';
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || 'gpt-oss:20b';   // what the 5080 box carries
const OPENROUTER_KEY = process.env.OPENROUTER_API_KEY || '';
const OPENROUTER_MODEL = process.env.OPENROUTER_MODEL || 'meta-llama/llama-3.1-8b-instruct';
const OPENAI_KEY = process.env.OPENAI_API_KEY || '';
const OPENAI_MODEL = process.env.OPENAI_MODEL || 'gpt-4o-mini';

const SYSTEM = `You are the Game Master of a Pathfinder 1e dungeon crawl. Voice: dry, vivid, a little ominous.
RULES YOU MUST FOLLOW:
- NEVER roll dice, decide hits/damage/saves, or change game state. The engine adjudicates everything; you narrate and answer.
- Answer questions about the CURRENT SITUATION using only the context given. Do not invent enemies, treasure, or exits that are not in the context.
- Rules questions: answer with real Pathfinder 1e rules, briefly.
- Never reveal hidden information (unseen enemies, unrolled outcomes).
- 1-3 sentences. This is read aloud — no markdown, no lists.`;

function buildContext(snap) {
  if (!snap || !snap.run) return 'The party is in the lobby, preparing to delve.';
  const r = snap.run;
  const heroes = r.combatants.filter(c => c.side === 'hero')
    .map(c => `${c.name}${c.level ? ' (L' + c.level + ')' : ''} ${c.down ? 'DOWN' : c.hp + '/' + c.maxHp + ' HP'}`).join('; ');
  const foes = r.combatants.filter(c => c.side === 'enemy' && !c.down)
    .map(c => `${c.name} ${c.hp}/${c.maxHp} HP${(c.conditions || []).length ? ' (' + c.conditions.join(', ') + ')' : ''}`).join('; ') || 'none visible';
  const log = (r.log || []).slice(-10).map(e => e.text).join(' | ');
  return `Delve "${snap.name}", room ${r.roomsCleared + 1}, round ${r.round}, phase ${r.phase}.
Party: ${heroes}. Gold: ${r.gold}.
Visible enemies: ${foes}.
Recent events: ${log}`;
}

async function tryChat(url, headers, body, timeoutMs) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body), signal: ctrl.signal });
    if (!res.ok) return null;
    const d = await res.json();
    return (d.choices && d.choices[0] && d.choices[0].message && d.choices[0].message.content)
        || (d.message && d.message.content) || null;
  } catch (e) { return null; } finally { clearTimeout(timer); }
}

/** Ask the GM. Returns { text, provider } or { text: fallback, provider: 'none' }. */
async function askGM(question, snap) {
  const messages = [
    { role: 'system', content: SYSTEM },
    { role: 'user', content: `SITUATION:\n${buildContext(snap)}\n\nPLAYER ASKS: ${question}` },
  ];
  // 1) Ollama (local 5080 box — primary when reachable)
  let text = await tryChat(`${OLLAMA_URL}/api/chat`, { 'Content-Type': 'application/json' },
    { model: OLLAMA_MODEL, messages, stream: false, keep_alive: '30m', options: { num_predict: 600 } }, 45000);   // gpt-oss REASONS before answering — the budget must cover thinking + reply; 45s covers a cold VRAM load, a DOWN host still fails fast
  if (text) return { text: text.trim(), provider: 'ollama' };
  // 2) OpenRouter
  if (OPENROUTER_KEY) {
    text = await tryChat('https://openrouter.ai/api/v1/chat/completions',
      { 'Content-Type': 'application/json', Authorization: `Bearer ${OPENROUTER_KEY}` },
      { model: OPENROUTER_MODEL, messages, max_tokens: 160 }, 20000);
    if (text) return { text: text.trim(), provider: 'openrouter' };
  }
  // 3) OpenAI
  if (OPENAI_KEY) {
    text = await tryChat('https://api.openai.com/v1/chat/completions',
      { 'Content-Type': 'application/json', Authorization: `Bearer ${OPENAI_KEY}` },
      { model: OPENAI_MODEL, messages, max_tokens: 160 }, 20000);
    if (text) return { text: text.trim(), provider: 'openai' };
  }
  return { text: 'The GM is silent — no oracle answers from beyond. (No LLM provider reachable.)', provider: 'none' };
}

/** Roleplay a party companion answering their leader (chat + 11labs voice). */
async function askCompanion(name, flavor, question, snap) {
  const messages = [
    { role: 'system', content: `You ARE ${name}, an AI-controlled companion in a Pathfinder 1e dungeon party, speaking to your party leader.
PERSONA: ${flavor}
RULES: Stay fully in character. Never roll dice, decide outcomes, or invent things not in the context. 1-3 spoken sentences, no markdown. You may advise, banter, complain, or scheme — in YOUR voice.` },
    { role: 'user', content: `SITUATION:
${buildContext(snap)}

YOUR LEADER SAYS TO YOU: ${question}` },
  ];
  let text = await tryChat(`${OLLAMA_URL}/api/chat`, { 'Content-Type': 'application/json' },
    { model: OLLAMA_MODEL, messages, stream: false, keep_alive: '30m', options: { num_predict: 600 } }, 45000);
  if (text) return { text: text.trim(), provider: 'ollama' };
  if (OPENAI_KEY) {
    text = await tryChat('https://api.openai.com/v1/chat/completions',
      { 'Content-Type': 'application/json', Authorization: `Bearer ${OPENAI_KEY}` },
      { model: OPENAI_MODEL, messages, max_tokens: 140 }, 20000);
    if (text) return { text: text.trim(), provider: 'openai' };
  }
  return { text: `${name} says nothing.`, provider: 'none' };
}

/** One SHORT in-character combat quip (a kill, a fallen ally). Fresh from the
 *  LLM each time (Tobias chose variety over canned lines); callers throttle. */
async function askBanter(name, flavor, eventDesc, snap) {
  const messages = [
    { role: 'system', content: `You ARE ${name}, an adventurer in a Pathfinder dungeon fight.
PERSONA: ${flavor}
React to the event with ONE short spoken line — 15 words max, fully in character. No markdown, no quotes, no narration, just the line you say out loud.` },
    { role: 'user', content: `WHAT JUST HAPPENED: ${eventDesc}
SITUATION: ${buildContext(snap)}
Your one-liner:` },
  ];
  let text = await tryChat(`${OLLAMA_URL}/api/chat`, { 'Content-Type': 'application/json' },
    { model: OLLAMA_MODEL, messages, stream: false, keep_alive: '30m', options: { num_predict: 400 } }, 15000);
  if (text) return { text: text.trim().replace(/^["']|["']$/g, '').slice(0, 160), provider: 'ollama' };
  if (OPENAI_KEY) {
    text = await tryChat('https://api.openai.com/v1/chat/completions',
      { 'Content-Type': 'application/json', Authorization: `Bearer ${OPENAI_KEY}` },
      { model: OPENAI_MODEL, messages, max_tokens: 60 }, 10000);
    if (text) return { text: text.trim().replace(/^["']|["']$/g, '').slice(0, 160), provider: 'openai' };
  }
  return null;
}

module.exports = { askGM, askCompanion, askBanter, buildContext };
