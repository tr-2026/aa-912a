// Soft risks: things that are not conflicts (everything fits) but leave no room for anything to run late.
// Pure: hands-on intervals in, structured warnings out. The screen turns them into sentences.

export const BUSY_WINDOW_MIN = 60;    // look at any stretch this long...
export const BUSY_THRESHOLD_MIN = 50; // ...and warn when a cook is busy this many minutes of it
const STEP_MIN = 5;

/** Minutes of `intervals` that fall inside [from, to). */
function busyIn(intervals, from, to) {
  return intervals.reduce((sum, i) => sum + Math.max(0, Math.min(i.end, to) - Math.max(i.start, from)), 0);
}

/** The busiest window for one cook, or null when they have no hands-on work. Earliest window wins ties. */
function busiestWindow(intervals) {
  if (intervals.length === 0) return null;
  const first = Math.min(...intervals.map((i) => i.start));
  const last = Math.max(...intervals.map((i) => i.end));
  let best = { at: first, busyMin: 0 };
  for (let at = first - (first % STEP_MIN); at <= last; at += STEP_MIN) {
    const busyMin = busyIn(intervals, at, at + BUSY_WINDOW_MIN);
    if (busyMin > best.busyMin) best = { at, busyMin };
  }
  return best;
}

/**
 * Flatten a schedule's conflicts and warnings into one list of risks, each with a stable `key` so two
 * schedules can be compared. A conflict is "this dish could not be placed"; a busy risk is "no slack".
 * @param {{conflicts: Object[], warnings: Object[]}} schedule
 * @returns {Object[]}
 */
export function listRisks(schedule) {
  // Keyed by dish only: if a dish stays in trouble but for a different reason, that is not "cleared".
  return [
    ...schedule.conflicts.map((c) => ({ key: `conflict:${c.dishId}`, kind: "conflict", dishId: c.dishId, reason: c.reason, servedHot: !!c.servedHot, placed: !!c.placed })),
    ...schedule.warnings.map((w) => ({ key: `busy:${w.cookId}`, kind: "busy", cookId: w.cookId, at: w.at, busyMin: w.busyMin, windowMin: w.windowMin })),
  ];
}

/**
 * What changed between two risk lists: new risks, and risks that went away.
 * @param {Object[]} before
 * @param {Object[]} after
 * @returns {{added: Object[], resolved: Object[]}}
 */
export function diffRisks(before, after) {
  const beforeKeys = new Set(before.map((r) => r.key));
  const afterKeys = new Set(after.map((r) => r.key));
  return {
    added: after.filter((r) => !beforeKeys.has(r.key)),
    resolved: before.filter((r) => !afterKeys.has(r.key)),
  };
}

/**
 * One warning per cook whose busiest hour is nearly full.
 * @param {Object<string, {start:number,end:number}[]>} handsByCook cook id -> hands-on intervals (non-overlapping)
 * @returns {{kind:"busy", cookId:string, at:number, busyMin:number, windowMin:number}[]}
 */
export function busyWarnings(handsByCook) {
  const out = [];
  for (const [cookId, intervals] of Object.entries(handsByCook)) {
    const best = busiestWindow(intervals);
    if (best && best.busyMin >= BUSY_THRESHOLD_MIN) {
      out.push({ kind: "busy", cookId, at: best.at, busyMin: best.busyMin, windowMin: BUSY_WINDOW_MIN });
    }
  }
  return out;
}
