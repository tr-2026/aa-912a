// Merges the host's edits (plan.overrides) over seed steps (DESIGN 4.8). Pure: the seed is never changed.

/** The key used in plan.overrides and plan.done for one step. */
export function stepKey(recipeId, stepId) {
  return `${recipeId}.${stepId}`;
}

function mergeStep(step, override) {
  if (!override) return step;
  const merged = { ...step };
  let edited = false;
  // durationMin only makes sense for hands_on and passive steps.
  if (step.kind !== "cook" && Number.isFinite(override.durationMin) && override.durationMin > 0) {
    merged.durationMin = override.durationMin;
    edited = true;
  }
  // stages replaces a cook step's whole list. The turkey's "stagesFrom" no longer applies then.
  if (step.kind === "cook" && Array.isArray(override.stages) && override.stages.length > 0) {
    merged.cook = { ...step.cook, stages: override.stages.map((s) => ({ ...s })) };
    delete merged.cook.stagesFrom;
    edited = true;
  }
  return edited ? { ...merged, edited: true } : step;
}

/**
 * Returns the recipe's steps with overrides applied. Edited steps carry `edited: true`.
 * @param {import("../types.js").Recipe} recipe
 * @param {Object<string, Object>} overrides plan.overrides
 * @returns {import("../types.js").Step[]}
 */
export function mergedSteps(recipe, overrides) {
  return recipe.steps.map((s) => mergeStep(s, overrides[stepKey(recipe.id, s.id)]));
}
