// Every recipe the current plan can use: the ones that come with the app plus the host's own dishes.
// Screens ask here instead of reading js/seed/recipes.js, so a dish the host added shows up everywhere.
import { getPlan } from "../state.js";
import { recipes as seedRecipes } from "../seed/recipes.js";
import { recipesFor } from "../logic/dishes.js";

let lastKey = null;
let lastRecipes = seedRecipes;

/** Rebuilt only when the host's own dishes change. Treat the result as read-only. */
export function allRecipes() {
  const key = JSON.stringify(getPlan().ownDishes ?? []);
  if (key !== lastKey) {
    lastRecipes = recipesFor(getPlan(), seedRecipes);
    lastKey = key;
  }
  return lastRecipes;
}
