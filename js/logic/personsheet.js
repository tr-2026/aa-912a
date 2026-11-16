// One person's page: what they do before Thursday and on Thursday, plus the reminders for their dishes. Pure.
import { mainCookId } from "./owners.js";

/**
 * @param {import("../types.js").Schedule} schedule
 * @param {import("../types.js").Plan} plan
 * @param {string} cookId
 * @returns {{ahead: Object[], thursday: Object[], reminders: Object[], handsOnMin: number}}
 */
export function personSheet(schedule, plan, cookId) {
  const isMain = cookId === mainCookId(plan);
  // Thaw and order-ahead items belong to no particular step, so they go on the main cook's page.
  const ahead = schedule.checklist.filter((c) => (c.owners ? c.owners.includes(cookId) : isMain));
  const thursday = schedule.thursday.filter((e) => e.owners?.includes(cookId));
  const dishes = new Set([...ahead, ...thursday].map((x) => x.dishId));
  const reminders = schedule.reminders.filter((r) => r.dishId && dishes.has(r.dishId));
  const handsOnMin = thursday.reduce((sum, e) => sum + (e.end - e.start), 0);
  return { ahead, thursday, reminders, handsOnMin };
}
