// Which screen the app opens on. Pure: today's date is passed in.
import { readiness } from "./readiness.js";
import { thanksgivingDate } from "./time.js";

/**
 * - Not set up yet: the questions ("guide").
 * - Thanksgiving day, or practising with ?now=: the Cook screen.
 * - Any other day: the Schedule, which opens on the list of jobs to do before Thursday.
 * @param {import("../types.js").Plan} plan
 * @param {Date} today
 * @param {boolean} rehearsing true when the address has ?now=HH:MM
 * @returns {"guide"|"cook"|"schedule"}
 */
export function homeScreen(plan, today, rehearsing) {
  if (!readiness(plan).ready) return "guide";
  if (rehearsing || isThanksgiving(plan, today)) return "cook";
  return "schedule";
}

/** True when `today` is Thanksgiving day of the plan's year. */
export function isThanksgiving(plan, today) {
  const t = thanksgivingDate(plan.year);
  return today.getFullYear() === t.getFullYear() && today.getMonth() === t.getMonth() && today.getDate() === t.getDate();
}
