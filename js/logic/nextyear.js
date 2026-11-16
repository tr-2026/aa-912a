// Starting next year's plan from this year's. Pure.

/**
 * Next year's plan. Kept: guests, turkey, kitchen, helpers, the menu, the host's own dishes, changed times,
 * extra shopping items and the notes. Cleared: everything ticked off, "have it" marks and the saved-copy date.
 * Each dish's "note for this year" moves to plan.pastNotes so it shows under "Past years" on the recipe card.
 * The questions are asked again, with last year's answers filled in.
 * @param {import("../types.js").Plan} plan
 * @returns {import("../types.js").Plan} a new plan; the input is not changed
 */
export function nextYearPlan(plan) {
  const copy = JSON.parse(JSON.stringify(plan));
  const kept = copy.menu
    .filter((m) => m.notes.trim())
    .map((m) => ({ year: plan.year, recipeId: m.recipeId, text: m.notes.trim() }));
  return {
    ...copy,
    year: plan.year + 1,
    menu: copy.menu.map((m) => ({ ...m, notes: "" })),
    pastNotes: [...(copy.pastNotes ?? []), ...kept],
    confirmed: { people: false, menu: false },
    done: {},
    checked: {},
    haveIt: {},
    lastBackupAt: null,
  };
}

/** Notes from earlier years for one dish, newest first: [{year, text}]. */
export function pastNotesFor(plan, recipeId) {
  return (plan.pastNotes ?? [])
    .filter((n) => n.recipeId === recipeId)
    .sort((a, b) => b.year - a.year)
    .map(({ year, text }) => ({ year, text }));
}
