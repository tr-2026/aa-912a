// Quantity formatting shared by instruction text and the screens. Pure.

/**
 * Round up, ignoring floating-point noise. 0.1 + 0.2 is 0.30000000000000004 in JavaScript, and a plain
 * Math.ceil would turn 3.0000000000000004 into 4. Rounding to 6 places first removes the noise.
 */
export function cleanCeil(x) {
  return Math.ceil(Math.round(x * 1e6) / 1e6);
}

const EIGHTHS =["", "1/8", "1/4", "3/8", "1/2", "5/8", "3/4", "7/8"];

/** 1.5 -> "1 1/2", 0.125 -> "1/8", 17 -> "17". Values that are not near an eighth show up to 2 decimals. */
export function formatQty(n) {
  if (!Number.isFinite(n)) return "";
  const eighths = Math.round(n * 8);
  if (Math.abs(n * 8 - eighths) > 0.05) return String(Math.round(n * 100) / 100);
  const whole = Math.floor(eighths / 8);
  const part = EIGHTHS[eighths % 8];
  if (whole === 0 && part === "") return "0";
  return [whole > 0 ? String(whole) : "", part].filter(Boolean).join(" ");
}
