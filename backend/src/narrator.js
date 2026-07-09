/**
 * Template narrator — terse, screen-reader-friendly prose for each game event.
 * This is a stable interface (one function per event kind) so the v0.2 LLM GM
 * can replace the internals without touching callers. Text is deliberately
 * short and factual; the accessibility layer reads it aloud by priority.
 */

function roomEntered(room, hero) {
  return `You enter ${room.flavor}. Blocking your way is ${withArticle(room.creature.name)} — ${room.creature.flavor}. `
    + `You grip your ${hero.weaponName}. What do you do?`;
}

function heroAttackResult(res, hero, creature) {
  if (!res.hit) {
    return res.d20 === 1
      ? `You swing your ${hero.weaponName} and stumble — a clean miss.`
      : `Your ${hero.weaponName} whistles past the ${creature.name}.`;
  }
  const crit = res.crit ? 'A critical hit! ' : '';
  return `${crit}You strike the ${creature.name} for ${res.damage} damage.`
    + ` (${Math.max(0, creature.hp)} health left.)`;
}

function creatureAttackResult(res, hero, creature) {
  if (!res.hit) {
    return `The ${creature.name} lunges but fails to land a blow.`;
  }
  return `The ${creature.name} hits you for ${res.damage} damage.`
    + ` (${Math.max(0, hero.hp)} health left.)`;
}

function victory(creature, reward) {
  return `The ${creature.name} falls. You cleared the room! `
    + `You find ${reward.gp} gold pieces.`;
}

function defeat(creature) {
  return `The ${creature.name}'s blow drops you. You have fallen. Your run ends here.`;
}

function heroStatus(hero) {
  const d = hero.character.derived;
  return `${hero.character.name}, level 1 ${hero.character.cls}. `
    + `Health ${hero.hp} of ${hero.character.maxHp}. Armor class ${hero.character.ac}. `
    + `Attack bonus plus ${d.bab}. Wielding a ${hero.character.weaponName}.`;
}

function lookAround(room) {
  return `You are in ${room.flavor}. ${withArticle(room.creature.name, true)} `
    + `(${Math.max(0, room.creature.hp)} health) still stands against you.`;
}

function withArticle(noun, cap = false) {
  const art = /^[aeiou]/i.test(noun) ? 'an' : 'a';
  const s = `${art} ${noun}`;
  return cap ? s[0].toUpperCase() + s.slice(1) : s;
}

module.exports = {
  roomEntered, heroAttackResult, creatureAttackResult,
  victory, defeat, heroStatus, lookAround,
};
