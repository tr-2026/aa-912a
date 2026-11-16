// Thaw, buy and order-ahead dates (DESIGN section 5.2). Pure: no clock, local-time Date math only.
import { thanksgivingDate } from "./time.js";
import { cleanCeil } from "./quantity.js";
import { cookedHere } from "./dishes.js";

// How far ahead to order the turkey. A frozen one has to be in hand before it starts thawing, so the order date
// follows the thaw date. A fresh one is ordered this many days before Thanksgiving, and that is also the day it
// is picked up, so a fresh turkey gets one reminder, not an order reminder and a buy reminder.
// TODO(host): confirm. Both numbers are 2 days at the host's request.
const ORDER_DAYS_BEFORE_THAW = 2;
const FRESH_TURKEY_ORDER_DAYS = 2;

/** Whole days to thaw a frozen bird in the fridge: ceil(lb / lbPerDay) + buffer. 15 lb -> 5 days. */
export function thawDays(weightLb, settings) {
  const perDay = settings.thawLbPerDay > 0 ? settings.thawLbPerDay : 4; // never divide by zero (USDA: about 4 lb a day)
  return cleanCeil(weightLb / perDay) + (settings.thawBufferDays || 0);
}

/** The calendar date `daysBefore` days before Thanksgiving (local midnight). */
function dateBefore(year, daysBefore) {
  const t = thanksgivingDate(year);
  return new Date(t.getFullYear(), t.getMonth(), t.getDate() - daysBefore);
}

function datedItem(plan, dishId, stepId, daysBefore, label, instructions) {
  return {
    dayOffset: -daysBefore,
    date: dateBefore(plan.year, daysBefore),
    dishId, stepId, label, durationMin: 0, instructions,
  };
}

/**
 * Checklist items that come from dates rather than cooking steps: thaw or buy the turkey, and
 * any recipe's orderAhead. Earliest first. Same shape as schedule.checklist entries (DESIGN 7.1).
 * @param {import("../types.js").Plan} plan
 * @param {Object<string, import("../types.js").Recipe>} recipes
 * @returns {Object[]}
 */
export function datedChecklistItems(plan, recipes) {
  const items = [];
  for (const menuItem of plan.menu) {
    const recipe = recipes[menuItem.recipeId];
    if (!menuItem.included || !recipe || !cookedHere(menuItem)) continue;

    // For a dish that thaws (the turkey) the order date comes from the thaw rules. For any other dish it is the
    // recipe's own daysBefore.
    let orderDays = recipe.orderAhead?.daysBefore;
    let orderNote = "";
    if (recipe.thaw) {
      if (plan.turkey.frozen) {
        const days = thawDays(plan.turkey.weightLb, plan.settings);
        items.push(datedItem(plan, recipe.id, "thaw", days, "Move turkey to the fridge",
          `A ${plan.turkey.weightLb} lb frozen bird needs about ${days} days in the fridge to thaw.`));
        orderDays = days + ORDER_DAYS_BEFORE_THAW;
      } else {
        orderDays = FRESH_TURKEY_ORDER_DAYS;
        orderNote = " Keep it in the fridge once you have it.";
      }
    }
    if (recipe.orderAhead) {
      const { text } = recipe.orderAhead;
      items.push(datedItem(plan, recipe.id, "order", orderDays, text, orderNote ? `${text}.${orderNote}` : text));
    }
  }
  return items.sort((a, b) => a.dayOffset - b.dayOffset);
}
