/**
 * Dice utilities. A "roller" is just a function () -> float in [0,1); by
 * default Math.random, but combat/roomgen accept an injected roller so tests
 * are fully deterministic (seed in, known rolls out). This keeps every rules
 * resolution pure and reproducible.
 */

/** Mulberry32 — tiny deterministic PRNG. seed:int -> roller():float[0,1). */
function seededRoller(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Roll one die of `sides` (1..sides) using the given roller. */
function rollDie(sides, roll = Math.random) {
  return 1 + Math.floor(roll() * sides);
}

/** Roll `count` dice of `sides`, return the sum. */
function rollDice(count, sides, roll = Math.random) {
  let total = 0;
  for (let i = 0; i < count; i++) total += rollDie(sides, roll);
  return total;
}

/** Pick a random element from arr using the roller. */
function pick(arr, roll = Math.random) {
  return arr[Math.floor(roll() * arr.length)];
}

module.exports = { seededRoller, rollDie, rollDice, pick };
