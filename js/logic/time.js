// Time helpers. Pure functions only (no Date.now, no DOM).
// All times in the app are integers: minutes since midnight Thursday (4:00 PM = 960).

/**
 * "16:00" -> 960. Throws on bad input so a typo is caught early instead of becoming NaN.
 * @param {string} hhmm 24-hour time
 * @returns {number}
 */
export function toMinutes(hhmm) {
  const match = /^(\d{1,2}):(\d{2})$/.exec(String(hhmm).trim());
  if (!match) throw new Error(`Bad time "${hhmm}", expected HH:MM`);
  const h = Number(match[1]);
  const m = Number(match[2]);
  if (h > 23 || m > 59) throw new Error(`Bad time "${hhmm}", out of range`);
  return h * 60 + m;
}

/**
 * 960 -> "16:00", the form saved in the plan. The opposite of toMinutes. Fractions are dropped.
 * @param {number} minutes 0..1439
 * @returns {string}
 */
export function toClock(minutes) {
  const whole = Math.floor(minutes);
  return `${String(Math.floor(whole / 60)).padStart(2, "0")}:${String(whole % 60).padStart(2, "0")}`;
}

/**
 * 960 -> "4:00 PM". Minutes outside 0..1439 wrap around the day, so a
 * Wednesday time (negative) still shows a clock time.
 * @param {number} minutes
 * @returns {string}
 */
export function formatTime(minutes) {
  const wrapped = ((Math.round(minutes) % 1440) + 1440) % 1440;
  const h24 = Math.floor(wrapped / 60);
  const m = wrapped % 60;
  const suffix = h24 < 12 ? "AM" : "PM";
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h12}:${String(m).padStart(2, "0")} ${suffix}`;
}

/**
 * Thanksgiving is the fourth Thursday of November: find the first Thursday,
 * add 21 days. Uses local-time Date parts only (never Date.parse).
 * @param {number} year
 * @returns {Date} local midnight on Thanksgiving
 */
export function thanksgivingDate(year) {
  const THURSDAY = 4; // Date#getDay(): Sunday = 0
  const firstOfNov = new Date(year, 10, 1);
  const daysToFirstThursday = (THURSDAY - firstOfNov.getDay() + 7) % 7;
  return new Date(year, 10, 1 + daysToFirstThursday + 21);
}
