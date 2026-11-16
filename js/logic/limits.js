// Sane limits for numbers the host can type or import. They stop typos and hand-edited files from producing
// nonsense (an "Invalid Date" thaw day, a 1,000,000-guest list, a turkey of 0 lb). Pure data.

export const MAX_GUESTS = 500;
export const MAX_BATCHES = 200;
export const MAX_SLOTS = 100;
export const MAX_STEP_MINUTES = 1440;   // one day, for any single step or stage
export const MAX_TEMP_F = 700;
export const TURKEY_LB = { min: 1, max: 60 };

/** [min, max] for each advanced setting. A thaw rate of 0 would divide by zero, so its minimum is above 0. */
export const SETTING_LIMITS = {
  readyBufferMin: [0, 240],
  loadMin: [0, 120],
  unloadMin: [0, 120],
  tempToleranceF: [0, 300],
  transitionMin: [0, 240],
  preheatMin: [0, 240],
  kidFactor: [0, 1],
  lbPerPerson: [0.25, 5],
  thawLbPerDay: [0.5, 50],
  thawBufferDays: [0, 14],
};

/** True when `value` is a finite number within [min, max]. */
export function inRange(value, min, max) {
  return typeof value === "number" && Number.isFinite(value) && value >= min && value <= max;
}
