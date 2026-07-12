/**
 * Generate darkwood backing textures via OpenRouter image models and drop
 * them into public/textures/. The CSS theme picks them up through the
 * --tex-body / --tex-panel slots (style.css) — until then the built-in SVG
 * grain fallback renders.
 *
 * Usage:  OPENROUTER_API_KEY=sk-or-... node scripts/gen-textures.js
 * (Tobias's key is NOT stored in this public repo — paste it per run or put
 *  it in the server-side gitignored .env.)
 */
const fs = require('node:fs');
const path = require('node:path');

const KEY = process.env.OPENROUTER_API_KEY;
if (!KEY) {
  console.error('OPENROUTER_API_KEY not set — paste the key to generate textures.');
  console.error('The SVG-grain fallback keeps rendering until then.');
  process.exit(1);
}
const MODEL = process.env.OPENROUTER_IMAGE_MODEL || 'google/gemini-2.5-flash-image';
const OUT = path.join(__dirname, '..', 'public', 'textures');
fs.mkdirSync(OUT, { recursive: true });

const JOBS = [
  {
    file: 'darkwood-table.webp',
    prompt: 'Seamless tileable texture of a dark ebony oak tavern table top, aged wood planks, '
      + 'subtle grain and knots, very dark warm brown, softly lit, photographic, no objects, '
      + 'no text, 512x512, seamless edges for tiling',
  },
  {
    file: 'darkwood-panel.webp',
    prompt: 'Seamless tileable texture of polished dark walnut wood panel, fine straight grain, '
      + 'deep brown with warm highlights, softly lit, photographic, no objects, no text, '
      + '512x512, seamless edges for tiling',
  },
];

async function gen(job) {
  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${KEY}` },
    body: JSON.stringify({
      model: MODEL,
      messages: [{ role: 'user', content: job.prompt }],
      modalities: ['image', 'text'],
    }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const d = await res.json();
  const img = d.choices && d.choices[0] && d.choices[0].message && d.choices[0].message.images
    && d.choices[0].message.images[0];
  const url = img && (img.image_url ? img.image_url.url : img.url);
  if (!url) throw new Error('no image in response: ' + JSON.stringify(d).slice(0, 300));
  const b64 = url.startsWith('data:') ? url.split(',')[1] : null;
  const buf = b64 ? Buffer.from(b64, 'base64') : Buffer.from(await (await fetch(url)).arrayBuffer());
  fs.writeFileSync(path.join(OUT, job.file), buf);
  console.log('wrote', job.file, buf.length, 'bytes');
}

(async () => {
  for (const j of JOBS) await gen(j);
  console.log('\nNow point the CSS slots at the files, e.g. in :root:');
  console.log("  --tex-body: url('/textures/darkwood-table.webp');");
  console.log("  --tex-panel: url('/textures/darkwood-panel.webp');");
})().catch(e => { console.error('FAILED:', e.message); process.exit(1); });
