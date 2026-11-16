// Turkey calculator (DESIGN 5.1). Pure: turkey options in, cooking stages out.
// The turkey's other steps (temper, rest, carve, probe reminder) are seed data in recipes.js;
// its cook step says `stagesFrom: "turkey"` and the scheduler fills the stages from here.

// Method 1: one steady oven temperature. Roasting times follow the USDA chart for a whole turkey at 325°F
// ("Turkey Roasting Chart", USDA Food Safety and Inspection Service). Each pair is [pounds, minutes]. The chart
// gives a range of weights and a range of times; the low end of one range is the high end of the one before, so
// the points join up, and a weight between two points gets a time between them.
// These are estimates for planning the day. The bird is done when the thermometer says so (165°F).
export const USDA_CHART = {
  unstuffed: [[8, 165], [12, 180], [14, 225], [18, 255], [20, 270], [24, 300]],
  stuffed: [[8, 180], [12, 210], [14, 240], [18, 255], [20, 285], [24, 315]],
};

// Our own adjustment: USDA has no chart for a convection oven. The workbook's Turkey Calc tab roasted at 300°F
// on convection and allowed 12 minutes a pound against 15, which is 0.8 of the time. TODO(host): confirm.
export const OVEN = {
  normal: { tempF: 325, timeFactor: 1 },
  convection: { tempF: 300, timeFactor: 0.8 },
};

// Method 2: low-and-slow profile from the 2023 Tasks tab. Kept as data, not logic.
// A null `minutes` means "the rest of the total time". UNCONFIRMED, see OPEN_QUESTIONS #1.
export const STEP_DOWN_PROFILE = [
  { tempF: 400, minutes: 30 },
  { tempF: 300, minutes: 30 },
  { tempF: 250, minutes: 30 },
  { tempF: 200, minutes: null },
];

// If the total is this short or shorter there is no room for the profile, so method 1 is used.
export const STEP_DOWN_MIN_TOTAL = 90;

/**
 * Minutes from a chart for one weight.
 * Lighter than the chart's first weight: in proportion to that first point (the chart does not cover it).
 * Heavier than its last weight: carries on at the rate of the last stretch.
 */
function chartMinutes(chart, weightLb) {
  const [firstLb, firstMin] = chart[0];
  if (weightLb <= firstLb) return firstMin * (weightLb / firstLb);
  for (let i = 1; i < chart.length; i++) {
    const [lb, minutes] = chart[i];
    const [prevLb, prevMinutes] = chart[i - 1];
    const isLast = i === chart.length - 1;
    if (weightLb <= lb || isLast) return prevMinutes + (weightLb - prevLb) * ((minutes - prevMinutes) / (lb - prevLb));
  }
  return firstMin; // not reached: the loop always returns
}

/** Total roasting minutes for method 1 (also the target total for method 2). 12 lb unstuffed = 180. */
export function roastMinutes(turkey) {
  const oven = turkey.convection ? OVEN.convection : OVEN.normal;
  const chart = turkey.stuffed ? USDA_CHART.stuffed : USDA_CHART.unstuffed;
  return Math.max(1, Math.round(chartMinutes(chart, turkey.weightLb) * oven.timeFactor)); // never a zero-minute cook stage
}

function steadyStages(turkey) {
  const oven = turkey.convection ? OVEN.convection : OVEN.normal;
  return [{ tempF: oven.tempF, minutes: roastMinutes(turkey) }];
}

function stepDownStages(turkey) {
  const total = roastMinutes(turkey);
  if (total <= STEP_DOWN_MIN_TOTAL) return steadyStages(turkey);
  const fixed = STEP_DOWN_PROFILE.reduce((sum, s) => sum + (s.minutes ?? 0), 0);
  return STEP_DOWN_PROFILE.map((s) => ({ tempF: s.tempF, minutes: s.minutes ?? total - fixed }));
}

/**
 * The oven stages for this bird, in order.
 * @param {import("../types.js").TurkeyOptions} turkey
 * @returns {import("../types.js").Stage[]}
 */
export function turkeyStages(turkey) {
  return turkey.method === "step_down" ? stepDownStages(turkey) : steadyStages(turkey);
}

/**
 * Fills in any cook step that says `stagesFrom: "turkey"`. Other steps are returned unchanged.
 * @param {import("../types.js").Step[]} steps
 * @param {import("../types.js").TurkeyOptions} turkey
 * @returns {import("../types.js").Step[]}
 */
export function resolveTurkeyStages(steps, turkey) {
  return steps.map((s) => {
    if (s.kind !== "cook" || s.cook.stagesFrom !== "turkey") return s;
    return { ...s, cook: { ...s.cook, stages: turkeyStages(turkey) } };
  });
}
