// Equipment booking rules for the scheduler (DESIGN 7.3 canBook). Pure.
// A booking is { start, end, tempF, toleranceF, slots }, all minutes since midnight Thursday.
// Equipment bookings hold what is already committed; nothing here changes them.

/** Why a booking was refused. "temp" covers range, overlap tolerance and the transition gap. */
export const REFUSED = { SLOTS: "slots", TEMP: "temp" };

/** True when two time ranges share at least a minute. Ranges that only touch do not overlap. */
export const overlaps = (a, b) => a.start < b.end && b.start < a.end;

function tempAllowed(equipment, tempF) {
  if (equipment.minTempF === null || equipment.maxTempF === null) return true; // stovetop, "other"
  return tempF >= equipment.minTempF && tempF <= equipment.maxTempF;
}

/** Most slots in use at any moment inside `interval` by existing bookings, plus `slots` requested. */
function slotsFit(equipment, existing, interval, slots) {
  if (slots > equipment.slots) return false;
  // Usage only rises when a booking starts, so check the interval start and each overlapping start.
  const moments = [interval.start, ...existing.filter((b) => overlaps(b, interval)).map((b) => b.start)];
  return moments.every((t) => {
    if (t < interval.start || t >= interval.end) return true;
    const used = existing.filter((b) => b.start <= t && t < b.end).reduce((sum, b) => sum + b.slots, 0);
    return used + slots <= equipment.slots;
  });
}

/**
 * Can this interval be booked on this equipment?
 * @param {import("../types.js").Equipment} equipment
 * @param {Object[]} existing bookings already on this equipment
 * @param {{start:number,end:number}} interval
 * @param {{tempF:number, toleranceF:number, slots:number}} want
 * @param {number} transitionMin gap needed when temperatures differ by more than the tolerance
 * @returns {{ok:true} | {ok:false, reason:string}}
 */
export function canBook(equipment, existing, interval, want, transitionMin) {
  if (!tempAllowed(equipment, want.tempF)) return { ok: false, reason: REFUSED.TEMP };

  for (const b of existing) {
    const tolerance = Math.min(want.toleranceF, b.toleranceF);
    const tooDifferent = Math.abs(want.tempF - b.tempF) > tolerance;
    if (overlaps(b, interval)) {
      if (tooDifferent) return { ok: false, reason: REFUSED.TEMP };
    } else if (tooDifferent) {
      const gap = b.end <= interval.start ? interval.start - b.end : b.start - interval.end;
      if (gap < transitionMin) return { ok: false, reason: REFUSED.TEMP };
    }
  }
  if (!slotsFit(equipment, existing, interval, want.slots)) return { ok: false, reason: REFUSED.SLOTS };
  return { ok: true };
}
