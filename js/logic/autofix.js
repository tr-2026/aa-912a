// "Find a fix for me": looks for the smallest change to how long dishes may wait, covered, that makes more of
// them fit. Pure. It only proposes; the host decides whether to use it. No scheduling rule is changed.
import { buildSchedule } from "./scheduler.js";
import { holdFor, HOLD_STEP_MIN } from "./holds.js";

// The longest wait this will suggest. Longer is possible by hand on the Dishes screen.
// TODO(host): confirm. Two hours is the usual food-safety limit for food kept below 140°F.
export const MAX_SUGGESTED_HOLD_MIN = 120;
const MAX_ROUNDS = 8; // each round fixes at least one dish, so this is also the most dishes it can fix

const leftOut = (schedule) => schedule.conflicts.filter((c) => !c.placed).map((c) => c.dishId);

/** The shortest longer wait for one dish that leaves fewer dishes out, or null. */
function smallestHelpfulHold(plan, recipes, ingredients, dishId, countNow) {
  const recipe = recipes[dishId];
  if (!recipe) return null;
  for (let to = holdFor(plan, recipe) + HOLD_STEP_MIN; to <= MAX_SUGGESTED_HOLD_MIN; to += HOLD_STEP_MIN) {
    const trial = { ...plan, holds: { ...plan.holds, [dishId]: to } };
    const schedule = buildSchedule(trial, recipes, ingredients);
    if (leftOut(schedule).length < countNow) return { to, trial, schedule };
  }
  return null;
}

/**
 * @param {import("../types.js").Plan} plan
 * @param {Object<string, import("../types.js").Recipe>} recipes
 * @param {Object<string, import("../types.js").Ingredient>} ingredients
 * @returns {{changes: {dishId: string, from: number, to: number}[], before: number, after: number}}
 *   changes: new wait times, in minutes. before / after: how many dishes are left out without and with them.
 */
export function findHoldFix(plan, recipes, ingredients) {
  let current = plan;
  let schedule = buildSchedule(plan, recipes, ingredients);
  const before = leftOut(schedule).length;

  for (let round = 0; round < MAX_ROUNDS && leftOut(schedule).length > 0; round++) {
    let found = null;
    for (const dishId of leftOut(schedule)) {
      found = smallestHelpfulHold(current, recipes, ingredients, dishId, leftOut(schedule).length);
      if (found) break;
    }
    if (!found) break;
    current = found.trial;
    schedule = found.schedule;
  }

  const changes = Object.keys(current.holds)
    .filter((id) => recipes[id] && holdFor(current, recipes[id]) !== holdFor(plan, recipes[id]))
    .map((id) => ({ dishId: id, from: holdFor(plan, recipes[id]), to: holdFor(current, recipes[id]) }));
  return { changes, before, after: leftOut(schedule).length };
}
