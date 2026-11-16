// Default plan: what the app loads when nothing is saved. Data only.
// It is a function so every caller gets a fresh copy (no shared mutable state between Reset and Import).
import { recipes } from "./recipes.js";
import { eatingEquivalents, suggestedBatches } from "../logic/guests.js";
import { withOvenCount } from "../logic/kitchen.js";

export const SCHEMA_VERSION = 1;
export const STORAGE_KEY = "thanksgiving-planner:v1";

/** @returns {import("../types.js").Settings} */
export function defaultSettings() {
  return {
    wakeTime: "06:00",
    readyBufferMin: 10,
    loadMin: 5,
    unloadMin: 5,
    tempToleranceF: 25,
    transitionMin: 10,
    preheatMin: 15,
    kidFactor: 0.5,
    lbPerPerson: 1.25,
    thawLbPerDay: 4,
    thawBufferDays: 1,
  };
}

/**
 * The host has to confirm guests and menu before the schedule or shopping list is built.
 * @returns {import("../types.js").Confirmed}
 */
export function defaultConfirmed() {
  return { people: false, menu: false };
}

/**
 * Helper cooks are OFF for a plan saved before helpers existed: one cook (the first in the list) does everything.
 * When the host turns them on, more cooks can be added and tasks given to them.
 * @returns {import("../types.js").Helpers}
 */
export function defaultHelpers() {
  return { enabled: false, cooks: [{ id: "cook1", name: "Me" }] };
}

// The starting plan is a two-cook day, so that everything on the starting menu fits. One cook alone cannot: even
// with the jobs that can be done earlier moved out of the way (the cheese sauce, the stuffing mix, peeling the
// potatoes), the last hour has more hands-on work than one cook has time, and the casserole, the corn bread and the
// gravy are left out. The helper takes the stuffing, the gravy and the corn bread, and the stuffing may wait 60
// minutes instead of 30. Found by trying every combination; the result leaves only the "no break" note.
// ASSUMPTION: host to confirm. TODO(host): confirm.
const STARTING_HELPERS = { enabled: true, cooks: [{ id: "cook1", name: "Me" }, { id: "cook2", name: "Helper 1" }] };
const STARTING_OWNERS = { stuffing: ["cook2"], gravy: ["cook2"], corn_bread: ["cook2"] };
const STARTING_HOLDS = { stuffing: 60 };

/** @returns {import("../types.js").Equipment[]} */
export function defaultEquipment() {
  return withOvenCount([], 2);
}

// Dishes in the recipe seed that are NOT on this year's starting menu. The host can tick them on.
// ASSUMPTION: from the workbook's Menu tab, where these had no "Make" and no person (or are new dishes).
// TODO(host): confirm.
/** A dish that is only a name: the workbook has no recipe card for it, so the host does not cook it. */
const noRecipe = (r) => r.ingredients.length === 0 && r.steps.length === 0;

const OFF_BY_DEFAULT = new Set([
  "cranberry_jello_salad", "sugared_bacon", "pumpkin_brulee", "whipped_cream",
]);

/**
 * The plan as it started before there was a helper: one cook, nothing handed out, every dish waiting as long as its
 * recipe says. On this plan three dishes do not fit, which is what many tests need (a crowded day to fix).
 * @returns {import("../types.js").Plan}
 */
export function soloPlan() {
  const plan = defaultPlan();
  plan.helpers = defaultHelpers();
  plan.owners = {};
  plan.holds = {};
  return plan;
}
/** @returns {import("../types.js").Plan} */
export function defaultPlan() {
  const settings = defaultSettings();
  const adults = 13;
  const kids = 1;
  const guests = eatingEquivalents(adults, kids, settings.kidFactor);
  return {
    schemaVersion: SCHEMA_VERSION,
    year: 2026,
    dinnerTime: "16:00",
    adults,
    kids,
    turkey: { weightLb: 15, frozen: true, stuffed: false, convection: false, method: "per_lb" },
    equipment: defaultEquipment(),
    helpers: JSON.parse(JSON.stringify(STARTING_HELPERS)),
    owners: JSON.parse(JSON.stringify(STARTING_OWNERS)),
    holds: { ...STARTING_HOLDS },
    cookWith: {},
    confirmed: defaultConfirmed(),
    menu: Object.values(recipes).map((r) => ({
      recipeId: r.id,
      included: noRecipe(r) || !OFF_BY_DEFAULT.has(r.id),
      batches: suggestedBatches(guests, r.servesBase, r.unit?.step ?? 1),
      batchesOverride: false,
      who: "", // only filled in when a guest brings the dish
      ...(noRecipe(r) ? { source: "guest" } : {}), // no recipe card: it was always a guest's dish, so a guest brings it
      notes: "",
    })),
    haveIt: {},
    checked: {},
    notes: "",
    overrides: {},
    customItems: [],
    ownDishes: [],
    pastNotes: [],
    done: {},
    lastBackupAt: null,
    settings,
  };
}
