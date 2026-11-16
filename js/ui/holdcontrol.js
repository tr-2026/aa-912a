// "Can wait, covered, for up to N minutes": how long one dish may sit between cooking and dinner.
// Saved for this plan only (plan.holds). Shown on the Dishes screen and beside a dish that does not fit.
import { getPlan, updatePlan } from "../state.js";
import { holdFor, hasHoldOverride, clampHold, HOLD_STEP_MIN, MAX_HOLD_MIN } from "../logic/holds.js";
import { el } from "./dom.js";

// Hot food held longer than this gets a food-safety reminder.
const HOT_HOLD_NOTE_MIN = 60;

/** True when the dish has Thursday cooking steps, so a hold time means something. */
export function hasHoldTime(recipe) {
  return recipe.steps.some((s) => s.dayOffset === 0 && !s.floating);
}

function setHold(recipe, minutes) {
  const value = clampHold(minutes);
  updatePlan((p) => {
    if (value === recipe.serve.holdMin) delete p.holds[recipe.id]; // back to the standard: keep the plan clean
    else p.holds[recipe.id] = value;
  });
}

/**
 * @param {import("../types.js").Recipe} recipe
 * @returns {HTMLElement}
 */
export function holdControl(recipe) {
  const plan = getPlan();
  const hold = holdFor(plan, recipe);
  const id = recipe.id;
  const changed = hasHoldOverride(plan, recipe);

  const less = el("button", {
    type: "button", class: "step", text: "−", "aria-label": `Shorter wait for ${recipe.name}`, "data-focus": `hold-:${id}`,
    disabled: hold <= 0, onclick: () => setHold(recipe, hold - HOLD_STEP_MIN),
  });
  const more = el("button", {
    type: "button", class: "step", text: "+", "aria-label": `Longer wait for ${recipe.name}`, "data-focus": `hold+:${id}`,
    disabled: hold >= MAX_HOLD_MIN, onclick: () => setHold(recipe, hold + HOLD_STEP_MIN),
  });
  const reset = changed
    ? el("button", { type: "button", class: "link", text: `back to ${recipe.serve.holdMin} min`, "data-focus": `holdreset:${id}`, onclick: () => setHold(recipe, recipe.serve.holdMin) })
    : null;
  const caution = recipe.serve.temp === "hot" && hold > HOT_HOLD_NOTE_MIN
    ? el("p", { class: "subtle", text: "Keep it somewhere warm. Hot food should stay at 140°F or hotter, and shouldn't sit cooler than that for more than 2 hours." })
    : null;

  return el("div", { class: "hold" }, [
    el("div", { class: "stepper" }, [
      el("span", { class: "field-label", text: "Can wait, covered, for up to" }), less,
      el("output", { class: "count wide", "aria-label": `How long ${recipe.name} can wait`, text: `${hold} min` }), more, reset,
    ].filter(Boolean)),
    caution,
  ].filter(Boolean));
}
