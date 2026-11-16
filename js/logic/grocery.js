// Shopping list (DESIGN section 6). Pure: plan + seed data in, grouped rows out.

export const BUY_WHEN_ORDER = ["week_before", "day_before", "anytime"];

import { cleanCeil } from "./quantity.js";
import { cookedHere } from "./dishes.js";

function roundUpTo(total, roundTo) {
  const steps = cleanCeil(total / roundTo);
  return Math.round(steps * roundTo * 1e6) / 1e6;
}

/** Sum groceryQty x batches for every included dish, keyed by ingredient id. */
function sumIngredients(plan, recipes, ingredients) {
  const totals = {};
  for (const item of plan.menu) {
    if (!item.included || !cookedHere(item)) continue; // a guest buys for the dish they bring
    const recipe = recipes[item.recipeId];
    if (!recipe) throw new Error(`Menu has unknown recipe "${item.recipeId}"`);
    for (const lineItem of recipe.ingredients) {
      if (!ingredients[lineItem.ingredientId]) {
        throw new Error(`Recipe "${recipe.id}" uses unknown ingredient "${lineItem.ingredientId}"`);
      }
      totals[lineItem.ingredientId] = (totals[lineItem.ingredientId] || 0) + lineItem.groceryQty * item.batches;
    }
  }
  return totals;
}

function makeRecipeRow(plan, ing, total) {
  // Round the SUM, not each recipe: a quarter stick plus a half stick is 1 stick, not 2.
  const qty = ing.qtyFromTurkeyWeight ? plan.turkey.weightLb : roundUpTo(total, ing.roundTo);
  return {
    key: ing.id, ingredientId: ing.id, name: ing.name, qty, unit: ing.groceryUnit,
    brand: ing.brand, store: ing.store, buyWhen: ing.buyWhen, sort: ing.sort,
    staple: ing.staple, custom: false,
    have: !!plan.haveIt[ing.id], checked: !!plan.checked[ing.id],
  };
}

function makeCustomRow(plan, item) {
  return {
    key: item.id, name: item.name, qty: item.qty, unit: item.unit,
    brand: "", store: item.store || "Other", buyWhen: item.buyWhen, sort: 99,
    staple: false, custom: true, have: false, checked: !!plan.checked[item.id],
  };
}

/** The things to buy that the host listed when adding a dish of their own. None when a guest brings the dish. */
function makeOwnDishRows(plan) {
  return (plan.ownDishes ?? []).flatMap((dish) => {
    const line = plan.menu.find((m) => m.recipeId === dish.id);
    if (!line?.included || !cookedHere(line)) return [];
    return (dish.shopping ?? []).map((s, i) => {
      const key = `${dish.id}.${i}`;
      return {
        key, name: s.name, qty: s.qty, unit: s.unit, brand: `for ${dish.name}`, store: "Other", buyWhen: "anytime", sort: 98,
        staple: false, custom: false, have: !!plan.haveIt[key], checked: !!plan.checked[key],
      };
    });
  });
}

const byRowOrder = (a, b) => a.sort - b.sort || a.name.localeCompare(b.name);

/** Group rows by buy-when, then by store. Empty groups are left out. */
function groupRows(rows) {
  const groups = [];
  for (const buyWhen of BUY_WHEN_ORDER) {
    const inGroup = rows.filter((r) => r.buyWhen === buyWhen);
    if (inGroup.length === 0) continue;
    const stores = [...new Set(inGroup.map((r) => r.store))].sort((a, b) => a.localeCompare(b));
    groups.push({
      buyWhen,
      stores: stores.map((store) => ({ store, rows: inGroup.filter((r) => r.store === store).sort(byRowOrder) })),
    });
  }
  return groups;
}

/**
 * @param {import("../types.js").Plan} plan
 * @param {Object<string, import("../types.js").Recipe>} recipes
 * @param {Object<string, import("../types.js").Ingredient>} ingredients
 * @returns {{groups: Object[], staples: Object[], haveIt: Object[]}}
 *   groups: main list by buyWhen then store. staples: "check your pantry". haveIt: owned, plus a copy of every ticked (bought) row. Ticked rows also stay in their own group.
 * Throws if the menu or a recipe points at something the seed does not have.
 */
export function buildGroceryList(plan, recipes, ingredients) {
  const totals = sumIngredients(plan, recipes, ingredients);
  const rows = [];
  for (const [id, total] of Object.entries(totals)) {
    const ing = ingredients[id];
    if (ing.skipShopping || total <= 0) continue;
    if (ing.qtyFromTurkeyWeight && !(plan.turkey.weightLb > 0)) continue; // no bird, no "0 lb" row
    rows.push(makeRecipeRow(plan, ing, total));
  }
  rows.push(...makeOwnDishRows(plan));
  for (const item of plan.customItems) rows.push(makeCustomRow(plan, item));

  return {
    groups: groupRows(rows.filter((r) => !r.have && !r.staple)),
    staples: rows.filter((r) => !r.have && r.staple).sort(byRowOrder),
    haveIt: rows.filter((r) => r.have || r.checked).sort(byRowOrder),
  };
}
