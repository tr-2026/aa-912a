// Hold times: how many minutes BEFORE it is due a dish may finish and sit covered (DESIGN 4.4 serve.holdMin).
// The seed has a standard value per dish; the host can change it for this plan in plan.holds. Pure.

export const MAX_HOLD_MIN = 600;
export const HOLD_STEP_MIN = 15;

/** Keep a hold time a whole number of minutes between 0 and MAX_HOLD_MIN. */
export function clampHold(minutes) {
  return Math.max(0, Math.min(MAX_HOLD_MIN, Math.round(minutes)));
}

/** True when the host changed this dish's hold time from the seed's standard. */
export function hasHoldOverride(plan, recipe) {
  const value = plan.holds?.[recipe.id];
  return Number.isFinite(value) && clampHold(value) !== recipe.serve.holdMin;
}

/**
 * The hold time the scheduler uses for a dish: the host's choice, or the seed's standard.
 * @param {import("../types.js").Plan} plan
 * @param {import("../types.js").Recipe} recipe
 * @returns {number} minutes
 */
export function holdFor(plan, recipe) {
  const value = plan.holds?.[recipe.id];
  return Number.isFinite(value) ? clampHold(value) : recipe.serve.holdMin;
}
