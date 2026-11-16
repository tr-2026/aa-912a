// Fills {ingredientId} placeholders in step text (DESIGN 4.6). Pure.
import { formatQty } from "./quantity.js";

/** "Onion (medium white)" -> "onion"; "Butter" -> "butter". Used inside sentences. */
function plainName(name) {
  const base = name.replace(/\s*\(.*\)\s*$/, "");
  return base.charAt(0).toLowerCase() + base.slice(1);
}

/**
 * Replace each {ingredientId} with the recipe's quantity x batches, in the recipe's own unit
 * and followed by the ingredient name: {butter} with 2 batches of "2 TB" -> "4 TB butter".
 * An unknown placeholder is left as written, and a console warning is logged. Never throws.
 * @param {string} text
 * @param {import("../types.js").Recipe} recipe
 * @param {number} batches
 * @param {Object<string, import("../types.js").Ingredient>} ingredients
 * @returns {string}
 */
export function renderInstructions(text, recipe, batches, ingredients) {
  return text.replace(/\{(\w+)\}/g, (whole, id) => {
    const line = recipe.ingredients.find((l) => l.ingredientId === id);
    const ing = ingredients[id];
    if (!line || !ing) {
      console.warn(`Unknown placeholder ${whole} in recipe "${recipe.id}"`);
      return whole;
    }
    // A turkey is bought by weight, never scaled by batches.
    const scale = recipe.servesBase === 0 ? 1 : batches;
    return [formatQty(line.qty * scale), line.unit, plainName(ing.name)].filter(Boolean).join(" ");
  });
}
