// One shared schedule for the whole app. The Schedule screen, the Cook screen and the risk notices all need it;
// building it once per real change (instead of once per screen per keystroke) keeps typing snappy.
// Callers must treat the result as read-only.
import { allRecipes } from "./recipebook.js";
import { ingredients } from "../seed/ingredients.js";
import { buildSchedule } from "../logic/scheduler.js";
import { scheduleKey } from "../logic/schedulekey.js";

let lastKey = null;
let lastSchedule = null;

/** The schedule for this plan, reused while nothing that affects it has changed. */
export function getSchedule(plan) {
  const key = scheduleKey(plan);
  if (key !== lastKey) {
    lastSchedule = buildSchedule(plan, allRecipes(), ingredients);
    lastKey = key;
  }
  return lastSchedule;
}
