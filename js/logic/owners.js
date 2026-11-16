// Who does which task (helper cooks). Pure.
// plan.owners maps "recipeId" (the whole dish) or "recipeId.stepId" (one step) to a list of cook ids. A step
// key beats its dish key. A task with several owners keeps ALL of them busy for its whole length (they work
// on it together; it does not go faster). With helpers off, or no usable owner, the first cook does it.

/** The main cook's id (always the first cook). */
export function mainCookId(plan) {
  return plan.helpers?.cooks?.[0]?.id ?? "cook1";
}

/** True when helper cooks are switched on AND there is more than one cook to give work to. */
export function helpersOn(plan) {
  return !!plan.helpers?.enabled && plan.helpers.cooks.length > 1;
}

/** "Ann" for a cook id; the id itself if the cook is gone. */
export function cookName(plan, cookId) {
  return plan.helpers?.cooks?.find((c) => c.id === cookId)?.name ?? cookId;
}

function knownIds(plan, ids) {
  const known = new Set(plan.helpers.cooks.map((c) => c.id));
  return Array.isArray(ids) ? ids.filter((id) => known.has(id)) : [];
}

/**
 * The cook ids who do this step.
 * @param {import("../types.js").Plan} plan
 * @param {string} dishId
 * @param {string} stepId
 * @returns {string[]} never empty
 */
export function ownersFor(plan, dishId, stepId) {
  const main = mainCookId(plan);
  if (!plan.helpers?.enabled) return [main];
  const owners = plan.owners || {};
  const forStep = knownIds(plan, owners[`${dishId}.${stepId}`]);
  if (forStep.length > 0) return forStep;
  const forDish = knownIds(plan, owners[dishId]);
  return forDish.length > 0 ? forDish : [main];
}

/** Cook ids who do the dish as a whole (its dish-level owners, or the main cook). */
export function dishOwners(plan, dishId) {
  const main = mainCookId(plan);
  if (!plan.helpers?.enabled) return [main];
  const forDish = knownIds(plan, (plan.owners || {})[dishId]);
  return forDish.length > 0 ? forDish : [main];
}
