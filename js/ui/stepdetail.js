// The pop-up for one step: what to do, and boxes to change its time or oven temperature.
// Changes are saved in plan.overrides (key "recipeId.stepId") and applied by logic/overrides.js.
import { getPlan, updatePlan } from "../state.js";
import { allRecipes } from "./recipebook.js";
import { mergedSteps, stepKey } from "../logic/overrides.js";
import { resolveTurkeyStages } from "../logic/turkey.js";
import { ownersFor, dishOwners, helpersOn } from "../logic/owners.js";
import { MAX_STEP_MINUTES, MAX_TEMP_F } from "../logic/limits.js";
import { el, field, readNumber, rebuildKeepingFocus } from "./dom.js";
import { ownerPicker, saveOwners } from "./ownerpicker.js";

/** The step as the scheduler sees it: overrides applied and turkey stages filled in. */
function currentStep(dishId, stepId) {
  const plan = getPlan();
  return resolveTurkeyStages(mergedSteps(allRecipes()[dishId], plan.overrides), plan.turkey).find((s) => s.id === stepId);
}

function durationEditor(dishId, step, key, changed) {
  const seedMinutes = allRecipes()[dishId].steps.find((s) => s.id === step.id).durationMin;
  const input = el("input", { type: "number", min: "1", step: "1", value: String(step.durationMin) });
  input.addEventListener("input", () => {
    const n = readNumber(input);
    if (n === null || !Number.isInteger(n) || n <= 0 || n > MAX_STEP_MINUTES) return;
    updatePlan((p) => { if (n === seedMinutes) delete p.overrides[key]; else p.overrides[key] = { durationMin: n }; });
    changed();
  });
  return field("Minutes", input);
}

function stagesEditor(step, key, changed) {
  const stages = step.cook.stages.map((s) => ({ ...s }));
  const save = () => {
    updatePlan((p) => { p.overrides[key] = { stages: stages.map((s) => ({ ...s })) }; });
    changed();
  };
  const rows = stages.map((stage, i) => {
    const part = stages.length > 1 ? `Part ${i + 1}: ` : "";
    const temp = el("input", { type: "number", min: "0", step: "5", value: String(stage.tempF) });
    const mins = el("input", { type: "number", min: "1", step: "1", value: String(stage.minutes) });
    temp.addEventListener("input", () => { const n = readNumber(temp); if (n !== null && n > 0 && n <= MAX_TEMP_F) { stage.tempF = n; save(); } });
    mins.addEventListener("input", () => { const n = readNumber(mins); if (n !== null && Number.isInteger(n) && n > 0 && n <= MAX_STEP_MINUTES) { stage.minutes = n; save(); } });
    return el("div", { class: "fields" }, [field(`${part}oven temperature (°F)`, temp), field(`${part}minutes`, mins)]);
  });
  return el("div", {}, rows);
}

/** "Who does this step": shown only with helper cooks on, and only for steps that need a person. */
function ownerSection(dishId, step) {
  const box = el("div");
  const ownerKey = stepKey(dishId, step.id);
  const render = () => {
    const plan = getPlan();
    if (!helpersOn(plan) || step.kind === "passive") { box.replaceChildren(); return; }
    box.replaceChildren(
      ownerPicker({
        label: "Who does this step", focusKey: ownerKey, current: ownersFor(plan, dishId, step.id),
        onChange: (next) => { saveOwners(ownerKey, next, dishOwners(getPlan(), dishId)); rebuildKeepingFocus(box, render); },
      }),
      el("p", { class: "subtle", text: plan.owners[ownerKey] ? "Someone different does this step." : "The same person as the rest of the dish." }),
    );
  };
  render();
  return box;
}

/**
 * Fill `dialog` for one step and open it.
 * @param {HTMLDialogElement} dialog
 * @param {string} dishId
 * @param {string} stepId
 * @param {string} instructions the rendered text (placeholders already filled)
 */
export function showStepDetail(dialog, dishId, stepId, instructions) {
  const step = currentStep(dishId, stepId);
  if (!step) return;
  const key = stepKey(dishId, stepId);

  // The badge and the button are always built, and shown only while the step differs from the recipe.
  const badge = el("span", { class: "badge edited", text: "changed" });
  const reset = el("button", {
    type: "button", class: "danger", text: "Go back to the recipe's times",
    onclick: () => { updatePlan((p) => { delete p.overrides[key]; }); showStepDetail(dialog, dishId, stepId, instructions); },
  });
  const sync = () => { const edited = !!getPlan().overrides[key]; badge.hidden = !edited; reset.hidden = !edited; };

  const editor = step.kind === "cook" ? stagesEditor(step, key, sync) : durationEditor(dishId, step, key, sync);
  dialog.replaceChildren(
    el("h3", { text: `${allRecipes()[dishId].name}: ${step.name}` }),
    el("p", {}, [badge]),
    el("p", { text: instructions }),
    ownerSection(dishId, step),
    editor,
    el("div", { class: "row" }, [el("button", { type: "button", text: "Close", onclick: () => dialog.close() }), reset]),
  );
  sync();
  if (!dialog.open) dialog.showModal();
}
