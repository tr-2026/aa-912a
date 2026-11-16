// "We are running late": move dinner, and so the whole day, later. Pure.
import { toMinutes, toClock } from "./time.js";

export const LATE_CHOICES_MIN = [15, 30];
const LATEST_DINNER_MIN = 23 * 60 + 45;
const REMINDER_KEY = /^reminder\.([^.]+)\.(-?\d+)\.(.*)$/;

/** True when dinner can still move this much later today. */
export function canMoveLater(plan, minutes) {
  return toMinutes(plan.dinnerTime) + minutes <= LATEST_DINNER_MIN;
}

/**
 * The parts of the plan that change when the day moves `minutes` later.
 * Jobs are remembered by dish and step, so their ticks stay. A reminder is remembered by its time, so each
 * "Got it" moves along with its reminder. Otherwise every reminder already dealt with would pop up again.
 * @param {import("../types.js").Plan} plan
 * @param {number} minutes
 * @returns {{dinnerTime: string, done: Object<string, boolean>}}
 */
export function movedLater(plan, minutes) {
  const done = {};
  for (const [key, value] of Object.entries(plan.done)) {
    const m = REMINDER_KEY.exec(key);
    done[m ? `reminder.${m[1]}.${Number(m[2]) + minutes}.${m[3]}` : key] = value;
  }
  return { dinnerTime: toClock(toMinutes(plan.dinnerTime) + minutes), done };
}
