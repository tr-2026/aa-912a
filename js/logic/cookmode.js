// Cook mode (Thursday): what to do now, what is next, what is overdue, which reminders are showing.
// Pure: the schedule, the clock (minutes since midnight Thursday, may have a fraction), and the done map come in.

export const NEXT_COUNT = 6;          // how many upcoming tasks to list
export const REMINDER_SOON_MIN = 10;  // a reminder shows as "coming up" this long before it is due
export const REMINDER_DUE_MIN = 30;   // ...and stays on screen this long after, unless acknowledged

const PERSON_KINDS = ["hands_on", "load", "unload"]; // tasks that need a person
const STAGE_SUFFIX = /\s+at \d+°F$/;                   // "Bake pie at 425°F" -> "Bake pie"

/** The id used in plan.done for one Thursday task. Whole steps use "dish.step"; loading and unloading add a suffix. */
export function taskKey(entry) {
  const base = `${entry.dishId}.${entry.stepId}`;
  if (entry.kind === "load") return `${base}:load`;
  if (entry.kind === "unload") return `${base}:unload`;
  if (entry.kind === "cook") return `${base}:cook`;
  return base;
}

/** The id used in plan.done once the host has acknowledged a reminder. */
export function reminderKey(reminder) {
  return `reminder.${reminder.kind}.${reminder.at}.${reminder.equipmentId ?? reminder.dishId ?? ""}`;
}

/**
 * "?now=11:30" -> 690 (minutes since midnight), for rehearsal. Anything else -> null.
 * @param {string} search window.location.search
 * @returns {number|null}
 */
export function parseFakeNow(search) {
  const match = /[?&]now=(\d{1,2}):(\d{2})(?:&|$)/.exec(search || "");
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  return hours > 23 || minutes > 59 ? null : hours * 60 + minutes;
}

/** Merge the oven stages of one step into a single "run" (a pie's 425°F and 350°F stages are one bake). */
function mergeOvenRuns(entries) {
  const byStep = {};
  for (const e of entries.filter((x) => x.kind === "cook")) (byStep[`${e.dishId}.${e.stepId}`] ||= []).push(e);
  return Object.values(byStep).map((stages) => {
    stages.sort((a, b) => a.start - b.start);
    return {
      key: taskKey(stages[0]), kind: "oven", dishId: stages[0].dishId, stepId: stages[0].stepId,
      label: stages[0].label.replace(STAGE_SUFFIX, ""), start: stages[0].start, end: stages[stages.length - 1].end,
      equipmentId: stages[0].equipmentId, temps: stages.map((s) => s.tempF), instructions: stages[0].instructions,
    };
  });
}

/**
 * Split Thursday's entries into tasks that need a person (checked off) and runs that just take time
 * (waiting, or cooking in the oven).
 * @param {{thursday: Object[]}} schedule
 */
export function buildTasks(schedule) {
  const doTasks = schedule.thursday
    .filter((e) => PERSON_KINDS.includes(e.kind))
    .map((e) => ({ ...e, key: taskKey(e) }));
  const waits = schedule.thursday
    .filter((e) => e.kind === "passive")
    .map((e) => ({ ...e, key: taskKey(e), kind: "passive" }));
  return { doTasks, runs: [...waits, ...mergeOvenRuns(schedule.thursday)].sort((a, b) => a.start - b.start) };
}

/**
 * Everything the Cook screen shows at one moment.
 * @param {Object} schedule      from buildSchedule
 * @param {number} now           minutes since midnight Thursday (fractions allowed)
 * @param {Object<string, boolean>} done  plan.done
 * @param {{personId?: string, dinnerMin: number}} options  personId limits tasks to one cook
 */
export function cookView(schedule, now, done, options) {
  const { doTasks, runs } = buildTasks(schedule);
  const mine = options.personId ? doTasks.filter((t) => t.owners?.includes(options.personId)) : doTasks;
  const open = mine.filter((t) => !done[t.key]);
  const byStart = (a, b) => a.start - b.start;

  const reminders = schedule.reminders
    .filter((r) => !done[reminderKey(r)])
    .map((r) => ({ ...r, key: reminderKey(r) }));

  return {
    now,
    dinnerIn: options.dinnerMin - now,
    total: mine.length,
    remaining: open.length,
    overdue: open.filter((t) => t.end <= now).sort(byStart),
    current: open.filter((t) => t.start <= now && now < t.end).sort(byStart),
    next: open.filter((t) => t.start > now).sort(byStart).slice(0, NEXT_COUNT),
    running: runs.filter((r) => r.start <= now && now < r.end),
    remindersDue: reminders.filter((r) => r.at <= now && now < r.at + REMINDER_DUE_MIN),
    remindersSoon: reminders.filter((r) => r.at > now && r.at - now <= REMINDER_SOON_MIN),
    // for "mark everything before now as done"
    pastKeys: mine.filter((t) => t.end <= now && !done[t.key]).map((t) => t.key),
  };
}
