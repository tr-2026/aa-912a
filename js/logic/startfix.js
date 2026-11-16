// "The turkey would have to start at 4:54 AM." When a dish is left out only because it would start before the
// earliest start time, work out when it would start and which single changes would let it fit. Pure: plan in,
// choices out. Nothing is changed here; the Schedule screen offers the choices as buttons.
import { buildSchedule, CONFLICT } from "./scheduler.js";
import { toMinutes, toClock } from "./time.js";

const ROUND_MIN = 15;          // choices are offered on the quarter hour
const LATEST_DINNER = 21 * 60; // do not suggest sitting down after 9:00 PM

const leftOut = (schedule, dishId) => schedule.conflicts.some((c) => c.dishId === dishId && !c.placed);
const firstStart = (schedule, dishId) => {
  const starts = schedule.thursday.filter((e) => e.dishId === dishId).map((e) => e.start);
  return starts.length ? Math.min(...starts) : null;
};

/** The same plan with one thing changed. The plan passed in is not touched. */
function changed(plan, change) {
  const copy = JSON.parse(JSON.stringify(plan));
  change(copy);
  return copy;
}

/**
 * @param {import("../types.js").Plan} plan
 * @param {Object} recipes
 * @param {Object} ingredients
 * @param {string} dishId a dish the schedule left out for starting too early
 * @returns {null | {needStart: number, wake: number, options: Array<{kind: "wake"|"dinner"|"unstuffed", wakeTime?: string, dinnerTime?: string}>}}
 *   null when the earliest start time is not what keeps the dish out.
 */
export function startChoices(plan, recipes, ingredients, dishId) {
  const now = buildSchedule(plan, recipes, ingredients);
  const conflict = now.conflicts.find((c) => c.dishId === dishId && !c.placed);
  if (!conflict || conflict.reason !== CONFLICT.wake.reason) return null;

  // With no earliest start time at all, when would the dish begin?
  const free = buildSchedule(changed(plan, (p) => { p.settings.wakeTime = "00:00"; }), recipes, ingredients);
  const needStart = firstStart(free, dishId);
  if (needStart === null || leftOut(free, dishId)) return null; // something else also keeps it out

  const wake = toMinutes(plan.settings.wakeTime);
  const options = [];
  const fitsWith = (change) => !leftOut(buildSchedule(changed(plan, change), recipes, ingredients), dishId);

  const earlier = Math.floor(needStart / ROUND_MIN) * ROUND_MIN;
  if (earlier >= 0) options.push({ kind: "wake", wakeTime: toClock(earlier) });

  const later = toMinutes(plan.dinnerTime) + Math.ceil((wake - needStart) / ROUND_MIN) * ROUND_MIN;
  if (later <= LATEST_DINNER && fitsWith((p) => { p.dinnerTime = toClock(later); })) {
    options.push({ kind: "dinner", dinnerTime: toClock(later) });
  }

  // A stuffed bird roasts longer. Baking the stuffing in its own dish may be enough.
  if (recipes[dishId]?.thaw && plan.turkey.stuffed && fitsWith((p) => { p.turkey.stuffed = false; })) {
    options.push({ kind: "unstuffed" });
  }
  return { needStart, wake, options };
}