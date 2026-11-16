// The questions BirdBrain asks first, and the check each answer has to pass before moving on. Pure.
// The screens are in js/ui/guide.js.
import { cookNamesProblem, menuProblem } from "./readiness.js";
import { ovenCount } from "./kitchen.js";
import { inRange, TURKEY_LB, MAX_GUESTS } from "./limits.js";
import { toMinutes } from "./time.js";

/** The screens, in order. "welcome" and "ready" are not numbered steps. */
export const GUIDE_STEPS = ["welcome", "guests", "turkey", "kitchen", "menu", "review", "ready"];
/** The numbered steps, shown as "Step 2 of 5". */
export const NUMBERED_STEPS = ["guests", "turkey", "kitchen", "menu", "review"];
export const STEP_TITLES = { guests: "Guests", turkey: "Turkey", kitchen: "Kitchen", menu: "Menu", review: "Check" };

function guestsProblem(plan) {
  if (!Number.isInteger(plan.adults) || !Number.isInteger(plan.kids) || plan.adults < 0 || plan.kids < 0) return "Guest counts must be whole numbers.";
  if (plan.adults > MAX_GUESTS || plan.kids > MAX_GUESTS) return `That's more than ${MAX_GUESTS} guests. Please check the numbers.`;
  if (plan.adults + plan.kids < 1) return "Add at least one guest.";
  try { toMinutes(plan.dinnerTime); } catch { return "Choose a dinner time."; }
  return null;
}

function turkeyProblem(plan) {
  if (!inRange(plan.turkey.weightLb, TURKEY_LB.min, TURKEY_LB.max)) return `Enter a turkey weight between ${TURKEY_LB.min} and ${TURKEY_LB.max} lb.`;
  return null;
}

function kitchenProblem(plan) {
  if (ovenCount(plan) < 1) return "Choose at least one oven.";
  return cookNamesProblem(plan);
}

/**
 * Why a step cannot move on yet, in plain words, or null.
 * @param {import("../types.js").Plan} plan
 * @param {string} stepId one of GUIDE_STEPS
 * @returns {string|null}
 */
export function stepProblem(plan, stepId) {
  switch (stepId) {
    case "guests": return guestsProblem(plan);
    case "turkey": return turkeyProblem(plan);
    case "kitchen": return kitchenProblem(plan);
    case "menu": return menuProblem(plan);
    case "review": return guestsProblem(plan) || turkeyProblem(plan) || kitchenProblem(plan) || menuProblem(plan);
    default: return null;
  }
}
