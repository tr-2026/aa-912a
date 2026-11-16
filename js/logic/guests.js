// Guest-count math (DESIGN 4.7). Pure functions: numbers in, numbers out.

import { cleanCeil } from "./quantity.js";

/**
 * Eating equivalents = adults + kids x kidFactor. 13 adults + 1 child = 13.5.
 * @param {number} adults
 * @param {number} kids
 * @param {number} kidFactor
 * @returns {number}
 */
export function eatingEquivalents(adults, kids, kidFactor) {
  return adults + kids * kidFactor;
}

/**
 * Eating equivalents for a whole plan.
 * @param {import("../types.js").Plan} plan
 * @returns {number}
 */
export function planEquivalents(plan) {
  return eatingEquivalents(plan.adults, plan.kids, plan.settings.kidFactor);
}

/**
 * How many batches of a recipe feed the guests: ceil(equivalents / servesBase), at least one step.
 * `step` is the smallest change in the amount: 1 for a dish with a recipe, 0.5 for a pan, a bowl or a dozen of a
 * dish that has no recipe. 15 guests and a pan that feeds 14 is 1.5 pans, not 2.
 * @param {number} equivalents
 * @param {number} servesBase
 * @param {number} [step]
 * @returns {number}
 */
export function suggestedBatches(equivalents, servesBase, step = 1) {
  if (!(servesBase > 0)) return step;
  return Math.max(step, cleanCeil(equivalents / servesBase / step) * step);
}

/**
 * Suggested turkey size in pounds: ceil(equivalents x lbPerPerson). 13.5 x 1.25 = 16.875 -> 17.
 * @param {number} equivalents
 * @param {number} lbPerPerson
 * @returns {number}
 */
export function suggestedTurkeyLb(equivalents, lbPerPerson) {
  return cleanCeil(equivalents * lbPerPerson);
}

/**
 * Returns a new menu where every line the host has not set by hand gets the suggested batch count.
 * Lines with batchesOverride === true, or whose recipe is unknown, are left alone.
 * @param {import("../types.js").PlanItem[]} menu
 * @param {number} equivalents
 * @param {Object<string, import("../types.js").Recipe>} recipes
 * @returns {import("../types.js").PlanItem[]}
 */
export function withSuggestedBatches(menu, equivalents, recipes) {
  return menu.map((item) => {
    const recipe = recipes[item.recipeId];
    if (item.batchesOverride || !recipe) return item;
    return { ...item, batches: suggestedBatches(equivalents, recipe.servesBase, recipe.unit?.step ?? 1) };
  });
}
