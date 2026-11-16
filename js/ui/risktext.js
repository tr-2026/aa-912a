// Sentences for the "things to check" list. Used by the Schedule screen, the pop-up notices and the questions.
import { formatTime } from "../logic/time.js";
import { dishName, speak, isPluralName } from "./format.js";
import { CONFLICT } from "../logic/scheduler.js";

/** "You have no break from 2:05 PM to 3:05 PM. A small delay could make dinner late." */
export function busyText(risk, plan) {
  return `${speak(plan, risk.cookId).has} no break from ${formatTime(risk.at)} to ${formatTime(risk.at + risk.windowMin)}. A small delay could make dinner late.`;
}

/** "Corn Bread doesn't fit yet. There's no oven space at the right temperature." */
export function conflictText(conflict) {
  if (conflict.placed) return `${dishName(conflict.dishId)}: the oven has to be turned on before your earliest start time.`;
  const name = dishName(conflict.dishId);
  // A hot dish that cannot get an oven close to dinner says so, instead of talking about the oven's temperature.
  const reason = conflict.servedHot ? CONFLICT.slots.hotReason : conflict.reason;
  return `${name} ${isPluralName(name) ? "don't" : "doesn't"} fit yet. ${reason}.`;
}

/** One sentence for something that was on the list and no longer is: "Corn Bread fits now." */
export function fixedText(risk, plan) {
  if (risk.kind === "busy") return `${speak(plan, risk.cookId).has} more room in the day now.`;
  // A dish that left the menu, or that a guest now brings, has no name to look up or nothing left to fit.
  const stillCooked = plan.menu.some((m) => m.recipeId === risk.dishId && m.included && m.source !== "guest");
  const name = dishName(risk.dishId);
  const many = isPluralName(name);
  return stillCooked ? `${name} ${many ? "fit" : "fits"} now.` : `${name} ${many ? "are" : "is"} no longer something you cook.`;
}

/** One sentence for any item from logic/risks.js listRisks(). */
export function riskText(risk, plan) {
  return risk.kind === "busy" ? busyText(risk, plan) : conflictText(risk);
}
