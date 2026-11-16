// A calendar file (.ics) with the dates that matter before Thanksgiving, for the host's own calendar app.
// Pure: the "made at" stamp is passed in. Format: RFC 5545. Lines end in CRLF and are folded at 75 characters.
import { thanksgivingDate, toMinutes, formatTime } from "./time.js";

const DINNER_LENGTH_MIN = 120;
const SHOPPING_TRIPS = [
  { buyWhen: "week_before", daysBefore: 7, title: "Thanksgiving shopping: the week-before list" },
  { buyWhen: "day_before", daysBefore: 1, title: "Thanksgiving shopping: the day-before list" },
];

const pad = (n) => String(n).padStart(2, "0");
const dayStamp = (date) => `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}`;
const nextDay = (date) => new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1);

/**
 * The dates worth putting in a calendar, earliest first.
 * @param {import("../types.js").Plan} plan
 * @param {{checklist: Object[], thursday: Object[]}} schedule  from buildSchedule
 * @param {{groups: Object[]}} groceryList                       from buildGroceryList
 * @param {Object<string, import("../types.js").Recipe>} recipes
 * @returns {{date: Date, title: string, notes: string, startMin?: number}[]} startMin only on the dinner itself
 */
export function planEvents(plan, schedule, groceryList, recipes) {
  const t = thanksgivingDate(plan.year);
  const before = (days) => new Date(t.getFullYear(), t.getMonth(), t.getDate() - days);
  const events = [];

  for (const offset of [...new Set(schedule.checklist.map((c) => c.dayOffset))]) {
    const jobs = schedule.checklist.filter((c) => c.dayOffset === offset);
    const lines = jobs.map((j) => `${j.label} (${recipes[j.dishId]?.name ?? j.dishId})`);
    events.push({
      date: before(-offset),
      title: jobs.length === 1 ? `Thanksgiving: ${jobs[0].label}` : `Thanksgiving: ${jobs.length} jobs to do`,
      notes: lines.join("\n"),
    });
  }
  for (const trip of SHOPPING_TRIPS) {
    const group = groceryList.groups.find((g) => g.buyWhen === trip.buyWhen);
    const count = group ? group.stores.reduce((n, s) => n + s.rows.length, 0) : 0;
    if (count > 0) events.push({ date: before(trip.daysBefore), title: trip.title, notes: `${count} things to buy. The list is in BirdBrain.` });
  }
  const firstJob = schedule.thursday.length ? Math.min(...schedule.thursday.map((e) => e.start)) : null;
  events.push({
    date: t, title: "Thanksgiving dinner", startMin: toMinutes(plan.dinnerTime),
    notes: firstJob === null ? "" : `Cooking starts at ${formatTime(firstJob)}. Open the Cook screen in BirdBrain.`,
  });
  return events.sort((a, b) => a.date - b.date);
}

// ---------- the reminders file ----------
// The same dates, but each one is a timed entry with an alarm, so the calendar app itself taps the host on the
// shoulder. BirdBrain sends nothing: the alarm is stored in the file and belongs to the calendar app.
const DAY_REMINDER_MIN = 9 * 60;   // jobs and shopping before Thursday remind at 9:00 AM. TODO(host): confirm.
const START_ALARM_MIN = 15;        // "start cooking" rings 15 minutes ahead
const DINNER_ALARM_MIN = 60;       // dinner rings an hour ahead
const SHORT_EVENT_MIN = 15;

/**
 * Timed entries with an alarm, earliest first: the jobs and shopping trips before Thursday (9:00 AM that day), the
 * first job on Thursday, every oven reminder on Thursday (preheat, raise or lower, probe) and dinner.
 * @returns {{date: Date, title: string, notes: string, startMin: number, lengthMin?: number, alarmMin: number}[]}
 */
export function reminderEvents(plan, schedule, groceryList, recipes) {
  const t = thanksgivingDate(plan.year);
  const name = (id) => recipes[id]?.name ?? id;
  const events = [];

  for (const e of planEvents(plan, schedule, groceryList, recipes)) {
    if (e.startMin !== undefined) {
      events.push({ ...e, alarmMin: DINNER_ALARM_MIN }); // dinner
    } else {
      events.push({ ...e, startMin: DAY_REMINDER_MIN, lengthMin: SHORT_EVENT_MIN, alarmMin: 0 });
    }
  }
  if (schedule.thursday.length > 0) {
    const first = schedule.thursday.reduce((a, b) => (b.start < a.start ? b : a));
    events.push({
      date: t, startMin: first.start, lengthMin: SHORT_EVENT_MIN, alarmMin: START_ALARM_MIN,
      title: "Thanksgiving: start cooking", notes: `${first.label} (${name(first.dishId)})`,
    });
  }
  for (const r of schedule.reminders) {
    if (r.at < 0 || r.at >= 24 * 60) continue; // a reminder has to fall on Thursday itself
    events.push({
      date: t, startMin: Math.round(r.at), lengthMin: SHORT_EVENT_MIN, alarmMin: 0,
      title: r.text.replace(/\.$/, ""), notes: name(r.dishId),
    });
  }
  return events.sort((a, b) => a.date - b.date || a.startMin - b.startMin);
}

/** Commas, semicolons, backslashes and line breaks have special meaning in a calendar file. */
function escapeText(text) {
  return String(text).replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
}

/** A line longer than 75 characters continues on the next line, which starts with a space. */
function fold(line) {
  const parts = [];
  let rest = line;
  while (rest.length > 75) {
    parts.push(rest.slice(0, 75));
    rest = ` ${rest.slice(75)}`;
  }
  return [...parts, rest];
}

function eventLines(event, index, stamp, uidPrefix) {
  const day = dayStamp(event.date);
  const clock = (min) => `${pad(Math.floor(min / 60))}${pad(min % 60)}00`;
  // Times have no time zone on purpose: "4:00 PM wherever this calendar is".
  const when = event.startMin === undefined
    ? [`DTSTART;VALUE=DATE:${day}`, `DTEND;VALUE=DATE:${dayStamp(nextDay(event.date))}`]
    : [`DTSTART:${day}T${clock(event.startMin)}`, `DTEND:${day}T${clock(Math.min(event.startMin + (event.lengthMin ?? DINNER_LENGTH_MIN), 23 * 60 + 59))}`];
  return [
    "BEGIN:VEVENT",
    `UID:${uidPrefix}-${day}-${index}@birdbrain.invalid`,
    `DTSTAMP:${stamp}`,
    ...when,
    `SUMMARY:${escapeText(event.title)}`,
    ...(event.notes ? [`DESCRIPTION:${escapeText(event.notes)}`] : []),
    // An alarm: the calendar app shows the title `alarmMin` minutes before the start (0 = at the start).
    ...(event.alarmMin === undefined ? [] : [
      "BEGIN:VALARM", "ACTION:DISPLAY", `DESCRIPTION:${escapeText(event.title)}`,
      `TRIGGER:${event.alarmMin === 0 ? "PT0S" : `-PT${event.alarmMin}M`}`, "END:VALARM",
    ]),
    "END:VEVENT",
  ];
}

/**
 * @param {{date: Date, title: string, notes: string, startMin?: number}[]} events
 * @param {string} stamp when the file was made, in UTC, like "20261112T150400Z"
 * @param {string} [uidPrefix] start of every entry's id. The dates file and the reminders file use different ones, so a
 *   calendar app that has both keeps both and does not treat one as an update of the other.
 * @returns {string} the text of an .ics file
 */
export function calendarText(events, stamp, uidPrefix = "birdbrain") {
  const lines = [
    "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//BirdBrain//Thanksgiving Planner//EN", "CALSCALE:GREGORIAN",
    ...events.flatMap((e, i) => eventLines(e, i, stamp, uidPrefix)),
    "END:VCALENDAR",
  ];
  return `${lines.flatMap(fold).join("\r\n")}\r\n`;
}
