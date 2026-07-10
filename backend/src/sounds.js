/**
 * Sound pools — transplanted verbatim from poker game/combat.js (the curated
 * FoundryVTT effects library, served from /audio/). One sound per action, picked
 * at random from the pool, attached to the log event; the client plays it.
 */
const SND = {
  whiffDagger: '/audio/fight_whiff_dagger.mp3',
  whiffSword: ['/audio/fight_whiff_sword_1.mp3', '/audio/fight_whiff_sword_2.mp3', '/audio/fight_whiff_sword_3.mp3', '/audio/fight_whiff_sword_4.mp3', '/audio/fight_whiff_sword_5.mp3', '/audio/fight_whiff_sword_6.mp3', '/audio/fight_whiff_sword_7.mp3', '/audio/fight_whiff_sword_8.mp3'],
  block: ['/audio/fight_block_1.mp3', '/audio/fight_block_2.mp3', '/audio/fight_block_3.mp3', '/audio/fight_block_4.mp3', '/audio/fight_block_5.mp3', '/audio/fight_block_6.mp3', '/audio/fight_block_7.mp3', '/audio/fight_block_8.mp3', '/audio/fight_block_9.mp3', '/audio/fight_block_10.mp3', '/audio/fight_block_11.mp3'],
  flesh: ['/audio/fight_flesh_1.mp3', '/audio/fight_flesh_2.mp3', '/audio/fight_flesh_3.mp3', '/audio/fight_flesh_4.mp3', '/audio/fight_flesh_5.mp3', '/audio/fight_flesh_6.mp3', '/audio/fight_flesh_7.mp3', '/audio/fight_flesh_8.mp3', '/audio/fight_flesh_9.mp3', '/audio/fight_flesh_10.mp3', '/audio/fight_flesh_11.mp3', '/audio/fight_flesh_12.mp3', '/audio/fight_flesh_13.mp3', '/audio/fight_flesh_17.mp3', '/audio/fight_flesh_18.mp3', '/audio/fight_flesh_19.mp3', '/audio/fight_flesh_21.mp3', '/audio/fight_flesh_23.mp3'],
  fumble: '/audio/fight_fumble.mp3',
  lightning: ['/audio/fight_lightning.mp3', '/audio/fight_lightning_2.mp3', '/audio/fight_lightning_3.mp3', '/audio/fight_lightning_4.mp3', '/audio/fight_lightning_7.mp3'],
  stink: ['/audio/fight_stink.mp3', '/audio/fight_stink_2.mp3', '/audio/fight_stink_3.mp3', '/audio/fight_stink_4.mp3', '/audio/fight_stink_5.mp3', '/audio/fight_stink_6.mp3', '/audio/fight_stink_7.mp3', '/audio/fight_stink_8.mp3'],
};

function pick(pool, roll = Math.random) {
  if (!pool) return null;
  if (!Array.isArray(pool)) return pool;
  return pool[Math.floor(roll() * pool.length)];
}

/** Default cast sound by effect family (poker's per-handler defaults). */
function forEffect(ab, roll = Math.random) {
  if (ab && ab.sounds) return pick(ab.sounds, roll);
  if (ab && ab.sound) return ab.sound;
  const eff = ab && ab.effect;
  if (eff === 'save_debuff') return pick(SND.stink, roll);
  if (eff === 'heal' || eff === 'buff') return pick(SND.flesh, roll);
  return pick(SND.lightning, roll);   // bolt/aoe/missile/touch default
}

module.exports = { SND, pick, forEffect };
