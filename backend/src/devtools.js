/**
 * DEV BACKDOOR (Tobias 2026-07-12): a command console that lets a tester —
 * human or Claude — drive EVERY function of play through the REAL action
 * paths (session.action / pubBuy / companion...), the way a blind player
 * drives them by keys and chat commands. Plus staging cheats (set hp, give,
 * spawn) so scenarios don't need luck.
 *
 * SECURITY: only mounted when DEV_BACKDOOR=1 (never in the prod compose).
 * Everything here calls the same code paths players use — no rule bypasses
 * except the explicit cheat verbs.
 *
 * One POST /api/dev/cmd {who, cmd} per step. `who` names a persistent dev
 * player (auto-created on first use). Every reply carries { ok, said } —
 * said = the NEW log lines a player would have heard — plus a compact state.
 *
 * Command grammar (docs/DEV-BACKDOOR.md):
 *   new <cls> [race] [with Comp1,Comp2]   fresh delve, character, started
 *   roll | attack [name] | cast <key> [name] | use <item> [name]
 *   equip <item> | descend | pass | retreat | cantrip
 *   loot send <item> <who> | loot party <item> | loot take <item>
 *   pub buy <service> [who] | pub sell <item> | setout
 *   companion <Name> <question...>        LLM ask (returns text)
 *   state | hero | kit | log [n]          inspection
 *   set hp <n> [name] | give <item> [qty] | gold <n> | kill [name]
 *   spawn <monKey>                        add a foe to the current room
 */
const session = require('./session');
const items = require('./items');

const ENABLED = process.env.DEV_BACKDOOR === '1';
const players = new Map();   // who -> clientId

function say(run, fromSeq) {
  return (run && run.log ? run.log.filter(e => e.seq > fromSeq).map(e => e.text) : []);
}
function summary(s) {
  if (!s) return null;
  const r = s.run;
  return {
    phase: s.phase, runPhase: r && r.phase, round: r && r.round, gold: r && r.gold,
    depth: r ? r.roomsCleared + 1 : null,
    heroes: r ? r.combatants.filter(c => c.side === 'hero').map(h => `${h.name} ${h.hp}/${h.maxHp}${h.down ? ' DOWN' : ''}${h.dead ? ' DEAD' : ''}`) : [],
    foes: (r && (r.phase === 'combat' || r.phase === 'initiative'))
      ? r.combatants.filter(c => c.side === 'enemy' && !c.down && c.revealed).map(e => `${e.name} ${e.hp}/${e.maxHp}`) : [],
    turn: r && r.phase === 'combat' ? (session.sessionSnapshotFor(playersRev(s)) || {}).run?.turn?.name || null : null,
    pub: s.phase === 'pub' ? (session.sessionSnapshotFor(playersRev(s)) || {}).pub : undefined,
  };
}
function playersRev(s) { for (const [, cid] of players) { const s2 = session._testInternals(cid); if (s2 === s) return cid; } return null; }

function heroOf(sess, clientId) {
  const snap = session.sessionSnapshotFor(clientId);
  const mid = snap && snap.yourMemberId;
  return sess.run && sess.run.heroes.find(h => h.ownerClientId === mid || h.ownerClientId === clientId);
}
function findCombatant(run, name, side) {
  if (!name) return null;
  const n = String(name).toLowerCase();
  return run.combatants.find(c => (!side || c.side === side) && c.name.toLowerCase().indexOf(n) >= 0);
}

async function runCmd(who, cmd) {
  who = String(who || 'dev').trim() || 'dev';
  const parts = String(cmd || '').trim().split(/\s+/);
  const verb = (parts[0] || '').toLowerCase();
  let clientId = players.get(who);
  let sess = clientId ? session._testInternals(clientId) : null;
  const run = sess && sess.run;
  const seq0 = run ? run.seq : 0;
  const done = (extra) => {
    const s2 = clientId ? session._testInternals(clientId) : null;
    return Object.assign({ ok: true, said: say(s2 && s2.run, seq0), state: summary(s2) }, extra);
  };
  const fail = (error) => ({ ok: false, error });

  // ── lifecycle ──
  if (verb === 'new') {
    const cls = parts[1] || 'fighter';
    const withIdx = parts.findIndex(p => p.toLowerCase() === 'with');
    const race = (withIdx === -1 ? parts[2] : (withIdx > 2 ? parts[2] : null)) || 'human';
    const comps = withIdx >= 0 ? parts.slice(withIdx + 1).join(' ').split(',').map(x => x.trim()).filter(Boolean) : [];
    const c = session.createDelve({ name: who, icon: '🧪', delveName: 'dev-' + who + '-' + (players.size + 1) + '-' + Math.floor(Math.random() * 1e6) });
    if (!c.ok) return fail(c.error);
    players.set(who, c.clientId);
    clientId = c.clientId;
    const sc = session.setCharacter(clientId, { race, cls });
    if (!sc.ok) return fail('setCharacter: ' + sc.error);
    for (const nm of comps) { const a = session.addCompanion(clientId, nm); if (!a.ok) return fail('companion ' + nm + ': ' + a.error); }
    const st = session.startRun(clientId);
    if (!st.ok) return fail('startRun: ' + st.error);
    const s2 = session._testInternals(clientId);
    return { ok: true, said: say(s2.run, 0), state: summary(s2) };
  }
  if (!clientId || !sess) return fail(`no delve for "${who}" — start with: new <cls> [race] [with Comp,Comp]`);

  // ── real play actions (the exact paths players use) ──
  const ACT = {
    roll: () => session.action(clientId, { type: 'initiative' }),
    descend: () => session.action(clientId, { type: 'descend' }),
    pass: () => session.action(clientId, { type: 'pass' }),
    retreat: () => session.action(clientId, { type: 'retreat' }),
    cantrip: () => session.action(clientId, { type: 'cantrip' }),
  };
  if (ACT[verb]) { const r = ACT[verb](); return r.ok ? done() : fail(r.error); }
  if (verb === 'attack') {
    const t = findCombatant(run, parts.slice(1).join(' '), 'enemy');
    const r = session.action(clientId, { type: 'attack', target: t && t.id });
    return r.ok ? done() : fail(r.error);
  }
  if (verb === 'cast') {
    const t = findCombatant(run, parts.slice(2).join(' '), null);
    const r = session.action(clientId, { type: 'cast', spell: parts[1], target: t && t.id });
    return r.ok ? done() : fail(r.error);
  }
  if (verb === 'use') {
    const t = findCombatant(run, parts.slice(2).join(' '), null);
    const r = session.action(clientId, { type: 'use', item: parts[1], target: t && t.id });
    return r.ok ? done() : fail(r.error);
  }
  if (verb === 'equip') { const r = session.action(clientId, { type: 'equip', item: parts[1] }); return r.ok ? done() : fail(r.error); }
  if (verb === 'loot') {
    const sub = (parts[1] || '').toLowerCase();
    const type = sub === 'send' ? 'loot_send' : sub === 'party' ? 'loot_party' : sub === 'take' ? 'loot_take' : null;
    if (!type) return fail('loot send|party|take <item> [who]');
    const r = session.action(clientId, { type, item: parts[2], target: parts.slice(3).join(' ') || undefined });
    return r.ok ? done() : fail(r.error);
  }
  if (verb === 'pub') {
    const sub = (parts[1] || '').toLowerCase();
    if (sub === 'buy') { const r = session.pubBuy(clientId, parts[2], parts.slice(3).join(' ') || undefined); return r.ok ? done({ text: r.text }) : fail(r.error); }
    if (sub === 'sell') { const r = session.pubSell(clientId, parts[2]); return r.ok ? done({ text: r.text }) : fail(r.error); }
    return fail('pub buy|sell ...');
  }
  if (verb === 'setout') { const r = session.startRun(clientId); return r.ok ? done() : fail(r.error); }
  if (verb === 'companion') {
    const snap = session.sessionSnapshotFor(clientId);
    const member = snap && snap.members.find(m => m.ai && m.name.toLowerCase() === (parts[1] || '').toLowerCase());
    if (!member) return fail('no such companion');
    const { CHARACTER_FLAVOR } = require('./dungeon-port/character_flavor');
    const flavor = CHARACTER_FLAVOR[member.name] || CHARACTER_FLAVOR[member.name.split(' ')[0]] || member.name;
    const r = await require('./gm').askCompanion(member.name, flavor, parts.slice(2).join(' '), snap);
    return { ok: true, said: [member.name + ': ' + r.text], state: summary(sess) };
  }

  // ── inspection ──
  if (verb === 'state') return { ok: true, state: summary(sess), said: [] };
  if (verb === 'hero') { const h = heroOf(sess, clientId); return { ok: true, hero: h && { name: h.name, hp: h.hp, maxHp: h.maxHp, ac: h.ac, slots: h.slots, pack: h.pack, negLevels: h.negLevels || 0, runUses: h.runAbilityUses, roomUses: h.abilityUses }, said: [] }; }
  if (verb === 'kit') {
    const snap = session.sessionSnapshotFor(clientId);
    const live = snap && snap.run && snap.run.turn && snap.run.turn.kit;
    if (live) return { ok: true, kit: live, said: [] };
    const h = heroOf(sess, clientId);
    const kd = h && require('./pf1core').abilities.kitFor(h.cls);
    return { ok: true, kitKeys: kd ? (kd.abilities || []).map(a => a.key + (a.slvl != null ? ' (L' + a.slvl + ')' : '')) : [], said: [] };
  }
  if (verb === 'log') { const n = parseInt(parts[1], 10) || 10; return { ok: true, said: run.log.slice(-n).map(e => e.text) }; }

  // ── staging cheats (explicit, dev-only) ──
  if (verb === 'set' && (parts[1] || '').toLowerCase() === 'hp') {
    const n = parseInt(parts[2], 10);
    const t = parts[3] ? findCombatant(run, parts.slice(3).join(' ')) : heroOf(sess, clientId);
    if (!t) return fail('no such combatant');
    t.hp = n; if (t.hp > 0) { t.down = false; t.dead = false; }
    return done({ set: t.name + ' hp=' + n });
  }
  if (verb === 'give') {
    const key = parts[1]; const qty = parseInt(parts[2], 10) || 1;
    if (!items.ITEM_BY_KEY[key]) return fail('unknown item key (see items.js): ' + key);
    const slot = run.inventory.find(x => x.key === key);
    if (slot) slot.qty += qty; else run.inventory.push({ key, qty });
    return done({ gave: key + ' x' + qty });
  }
  if (verb === 'gold') { run.gold = parseInt(parts[1], 10) || 0; return done({ gold: run.gold }); }
  if (verb === 'kill') {
    const t = parts[1] ? findCombatant(run, parts.slice(1).join(' '), 'enemy') : run.combatants.find(c => c.side === 'enemy' && !c.down);
    if (!t) return fail('no living foe');
    t.hp = 0; t.down = true; t.revealed = true;
    // advance the loop via a real no-op action so clear/XP logic runs
    session.action(clientId, { type: 'pass' });
    return done({ killed: t.name });
  }
  if (verb === 'spawn') {
    const pf1 = require('./pf1core');
    const base = pf1.monsters.MON[parts[1]];
    if (!base) return fail('unknown MON key: ' + parts[1]);
    const e = run.shim._makeEnemyPGM(base);
    e.key = parts[1]; e.revealed = true; e.stealth = 10; e.art = null;
    run.combatants.push(e);
    return done({ spawned: e.name });
  }
  return fail('unknown command — see docs/DEV-BACKDOOR.md');
}

module.exports = { ENABLED, runCmd };
