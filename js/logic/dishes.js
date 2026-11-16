// Dishes the host adds, and dishes a guest brings. Pure.
//
// The recipes in js/seed/ are code. A host cannot change code, so a dish of their own is saved in the plan as a
// few plain answers (plan.ownDishes) and turned into a small recipe here each time it is needed. Everything that
// reads recipes should read recipesFor(plan, seedRecipes), which is the seed plus the host's own dishes.

import { inRange, MAX_STEP_MINUTES, MAX_TEMP_F } from "./limits.js";

export const OWN_PREFIX = "own_";
export const OWN_CATEGORIES = ["side", "bread", "appetizer", "dessert", "other"];
export const OWN_NAME_MAX = 40;
export const OVEN_TEMP_F = { min: 150, max: MAX_TEMP_F };
export const SHOPPING_MAX_LINES = 20;

// How long a dish of the host's own may wait, covered, unless they change it on the Dishes screen.
// TODO(host): confirm. 30 minutes matches most hot sides in the seed.
const OWN_HOLD_MIN = { hot: 30, room: 120 };

/** True when the host cooks this menu line. False when a guest brings it: no jobs, no groceries. */
export function cookedHere(item) {
  return item.source !== "guest";
}

/**
 * Say that a guest brings a dish, or that the host cooks it after all. Changes the menu line.
 * The "who" name belongs to a guest's dish only, so it is cleared when the host cooks it. A name already on a
 * dish the host was cooking (left in a plan saved by an older version) is not a guest's name, so it is dropped
 * when a guest takes over.
 * @param {import("../types.js").PlanItem} line
 * @param {import("../types.js").Recipe} [recipe]
 * @param {boolean} guest true = a guest brings it
 */
export function setGuestBringing(line, recipe, guest) {
  if (guest) {
    if (line.source !== "guest") line.who = "";
    line.source = "guest";
  } else {
    delete line.source;
    line.who = "";
  }
}

export const isOwnDish = (recipeId) => String(recipeId).startsWith(OWN_PREFIX);

/** The optional list of things to buy for a dish: each needs a name and an amount above 0. */
function shoppingProblem(lines) {
  if (lines === undefined) return null;
  if (!Array.isArray(lines) || lines.length > SHOPPING_MAX_LINES) return `You can add up to ${SHOPPING_MAX_LINES} things to buy.`;
  const ok = lines.every((s) => s && typeof s.name === "string" && s.name.trim() !== "" && s.name.length <= OWN_NAME_MAX
    && inRange(s.qty, 0.001, 10000) && typeof s.unit === "string" && s.unit.length <= 20);
  return ok ? null : "Each thing to buy needs a name and an amount above 0.";
}

/**
 * What is wrong with the answers for a dish of the host's own, in plain words, or null.
 * @param {import("../types.js").OwnDish} d
 * @returns {string|null}
 */
export function ownDishProblem(d) {
  if (typeof d.name !== "string" || !d.name.trim()) return "Give the dish a name.";
  if (d.name.trim().length > OWN_NAME_MAX) return `Keep the name to ${OWN_NAME_MAX} letters or fewer.`;
  if (!OWN_CATEGORIES.includes(d.category)) return "Choose which part of the menu it belongs to.";
  if (typeof d.oven !== "boolean" || typeof d.hot !== "boolean") return "Say whether it goes in the oven and whether it's served hot.";
  const shopping = shoppingProblem(d.shopping);
  if (shopping) return shopping;
  if (!d.oven) return null;
  if (!inRange(d.tempF, OVEN_TEMP_F.min, OVEN_TEMP_F.max)) return `Enter an oven temperature from ${OVEN_TEMP_F.min} to ${OVEN_TEMP_F.max}.`;
  if (!Number.isInteger(d.minutes) || !inRange(d.minutes, 1, MAX_STEP_MINUTES)) return "Enter how many minutes it's in the oven.";
  if (!Number.isInteger(d.prepMin) || !inRange(d.prepMin, 0, MAX_STEP_MINUTES)) return "Minutes to get it ready must be 0 or more.";
  return null;
}

/** The first id like "own_3" that no dish in the list uses. */
export function nextOwnId(ownDishes) {
  const used = new Set(ownDishes.map((d) => d.id));
  let n = 1;
  while (used.has(`${OWN_PREFIX}${n}`)) n += 1;
  return `${OWN_PREFIX}${n}`;
}

/** The recipe the rest of the app sees for one of the host's own dishes. */
export function ownRecipe(d) {
  const steps = [];
  if (d.oven) {
    if (d.prepMin > 0) {
      steps.push({
        id: "prep", name: `Get ${d.name} ready`, kind: "hands_on", dayOffset: 0, durationMin: d.prepMin,
        instructions: `Get ${d.name} ready for the oven.`,
      });
    }
    steps.push({
      id: "bake", name: `Bake ${d.name}`, kind: "cook", dayOffset: 0,
      cook: { equipmentType: "oven", slots: 1, stages: [{ tempF: d.tempF, minutes: d.minutes }] },
      instructions: `Bake at ${d.tempF}°F for ${d.minutes} minutes.`,
    });
  }
  return {
    id: d.id, name: d.name, category: d.category, own: true,
    servesBase: 0, tags: [],
    serve: { temp: d.hot ? "hot" : "room", holdMin: d.hot ? OWN_HOLD_MIN.hot : OWN_HOLD_MIN.room },
    ingredients: [], steps, notes: "", history: [],
  };
}

/**
 * Every recipe this plan can use: the seed recipes plus the host's own dishes.
 * @param {import("../types.js").Plan} plan
 * @param {Object<string, import("../types.js").Recipe>} seedRecipes
 * @returns {Object<string, import("../types.js").Recipe>}
 */
export function recipesFor(plan, seedRecipes) {
  const all = { ...seedRecipes };
  for (const d of plan.ownDishes ?? []) all[d.id] = ownRecipe(d);
  return all;
}

/** Add one of the host's own dishes to the plan, on the menu. Changes `plan`. Returns the new id. */
export function addOwnDish(plan, answers) {
  const id = nextOwnId(plan.ownDishes);
  const { shopping, ...rest } = answers;
  const dish = { ...rest, id, name: answers.name.trim() };
  // Things to buy are optional. A dish with none keeps no empty list.
  if (shopping?.length > 0) dish.shopping = shopping.map((s) => ({ name: s.name.trim(), qty: s.qty, unit: s.unit.trim() }));
  plan.ownDishes.push(dish);
  plan.menu.push({ recipeId: id, included: true, batches: 1, batchesOverride: false, who: "", notes: "" });
  return id;
}

/** Take one of the host's own dishes out of the plan, with everything saved about it. Changes `plan`. */
export function removeOwnDish(plan, id) {
  plan.ownDishes = plan.ownDishes.filter((d) => d.id !== id);
  plan.menu = plan.menu.filter((m) => m.recipeId !== id);
  delete plan.holds[id];
  delete plan.cookWith?.[id];
  for (const map of [plan.owners, plan.overrides, plan.done, plan.checked, plan.haveIt]) {
    for (const key of Object.keys(map)) if (key === id || key.startsWith(`${id}.`)) delete map[key];
  }
}
