// "Ask first": the schedule and the shopping list are only made once the host has confirmed who is
// coming (guests and cooks) and what is on the menu. Pure.

/** With helper cooks on, every cook needs a name. Returns the problem in plain words, or null. */
export function cookNamesProblem(plan) {
  if (plan.helpers?.enabled && plan.helpers.cooks.some((c) => !c.name.trim())) return "Give every cook a name.";
  return null;
}

/** Why the guests part cannot be confirmed yet, or null. */
export function peopleProblem(plan) {
  if (plan.adults + plan.kids < 1) return "Add at least one guest.";
  return cookNamesProblem(plan);
}

/** Why the menu part cannot be confirmed yet, or null. */
export function menuProblem(plan) {
  if (!plan.menu.some((m) => m.included)) return "Pick at least one dish.";
  return null;
}

/**
 * @param {import("../types.js").Plan} plan
 * @returns {{people: boolean, menu: boolean, ready: boolean}} people/menu are true once confirmed and still valid
 */
export function readiness(plan) {
  const people = !!plan.confirmed?.people && peopleProblem(plan) === null;
  const menu = !!plan.confirmed?.menu && menuProblem(plan) === null;
  return { people, menu, ready: people && menu };
}
