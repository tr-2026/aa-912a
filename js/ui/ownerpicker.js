// A row of toggle buttons, one per cook, for choosing who does a dish or a step.
// Shown only while helper cooks are on (Setup). Shared by the Dishes screen and the step dialog.
import { getPlan, updatePlan } from "../state.js";
import { el } from "./dom.js";

const sameSet = (a, b) => a.length === b.length && a.every((id) => b.includes(id));

/**
 * Save an owner list under `key` in plan.owners. A list equal to the default is removed instead, so the
 * plan only keeps real choices.
 */
export function saveOwners(key, list, defaultList) {
  updatePlan((p) => {
    if (sameSet(list, defaultList)) delete p.owners[key];
    else p.owners[key] = list;
  });
}

/**
 * @param {Object} opts
 * @param {string} opts.label       text before the buttons ("Cook")
 * @param {string[]} opts.current   cook ids who currently own it
 * @param {string} opts.focusKey    unique text for keyboard-focus restore
 * @param {(next: string[]) => void} opts.onChange  called with the new list (never empty)
 */
export function ownerPicker({ label, current, focusKey, onChange }) {
  const cooks = getPlan().helpers.cooks;
  const chips = cooks.map((cook) => el("button", {
    type: "button", class: "chip", text: cook.name, "aria-pressed": String(current.includes(cook.id)),
    "data-focus": `own:${focusKey}:${cook.id}`,
    onclick: () => {
      const next = current.includes(cook.id) ? current.filter((id) => id !== cook.id) : [...current, cook.id];
      if (next.length > 0) onChange(next); // at least one person must do it
    },
  }));
  return el("div", { class: "owners", role: "group", "aria-label": label }, [el("span", { class: "field-label", text: label }), ...chips]);
}
