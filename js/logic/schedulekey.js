// A cheap fingerprint of every part of the plan that can change the schedule. Pure.
// Two plans with the same key give the same schedule, so the screens can reuse one result instead of
// rebuilding it after every keystroke (notes, ticked boxes, shopping check-offs and "who" text never matter).

const SCHEDULE_FIELDS = ["year", "dinnerTime", "turkey", "equipment", "helpers", "owners", "holds", "overrides", "settings", "ownDishes", "cookWith"];

/**
 * @param {import("../types.js").Plan} plan
 * @returns {string}
 */
export function scheduleKey(plan) {
  const menu = plan.menu.map((m) => [m.recipeId, m.included, m.batches, m.source]);
  return JSON.stringify([...SCHEDULE_FIELDS.map((field) => plan[field]), menu]);
}
