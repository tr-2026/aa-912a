// Saving a calendar file from a button. Shared by the Schedule screen (dates) and the Notes screen (reminders).
import { allRecipes } from "./recipebook.js";
import { getSchedule } from "./schedulecache.js";
import { ingredients } from "../seed/ingredients.js";
import { buildGroceryList } from "../logic/grocery.js";
import { planEvents, reminderEvents, calendarText } from "../logic/calendar.js";
import { downloadText } from "./dom.js";

/** "20261112T150400Z": the time a calendar file was made, which the format asks for. */
export function utcStamp(date) {
  return `${date.toISOString().replace(/[-:]/g, "").slice(0, 15)}Z`;
}

/** The dates file: all-day entries for the jobs before Thursday, the shopping trips and dinner. */
export function saveDatesFile(plan, schedule) {
  const events = planEvents(plan, schedule, buildGroceryList(plan, allRecipes(), ingredients), allRecipes());
  downloadText("birdbrain-dates.ics", calendarText(events, utcStamp(new Date())), "text/calendar");
}

/** The reminders file: timed entries with an alarm, including the oven reminders on Thursday. */
export function saveRemindersFile(plan) {
  const schedule = getSchedule(plan);
  const events = reminderEvents(plan, schedule, buildGroceryList(plan, allRecipes(), ingredients), allRecipes());
  downloadText("birdbrain-reminders.ics", calendarText(events, utcStamp(new Date()), "birdbrain-reminder"), "text/calendar");
  return events.length;
}