// The one place that holds the Plan and talks to localStorage / files.
// Everything else asks this module for the plan and tells it about changes.
import { defaultPlan, defaultHelpers, defaultConfirmed, SCHEMA_VERSION, STORAGE_KEY } from "./seed/defaults.js";
import { recipes } from "./seed/recipes.js";
import {
  MAX_GUESTS, MAX_BATCHES, MAX_SLOTS, MAX_STEP_MINUTES, MAX_TEMP_F, TURKEY_LB, SETTING_LIMITS, inRange,
} from "./logic/limits.js";
import { MAX_HOLD_MIN } from "./logic/holds.js";
import { ownDishProblem, isOwnDish } from "./logic/dishes.js";
import { nextYearPlan } from "./logic/nextyear.js";
import { APPLIANCE_TYPES } from "./logic/kitchen.js";

const DIRTY_KEY = `${STORAGE_KEY}:changed`; // "1" when the plan changed since the last export
const EQUIPMENT_TYPES = ["oven", "air_fryer", "slow_cooker", "stovetop", "other"];
const BUY_WHEN = ["week_before", "day_before", "anytime"];

// ---------- storage with in-memory fallback ----------
// localStorage can be missing or throw (private windows, blocked site data). Then we keep working in memory.
const memory = new Map();
let storageBroken = false;

function readRaw(key) {
  if (!storageBroken) {
    try { return window.localStorage.getItem(key); } catch { storageBroken = true; }
  }
  return memory.has(key) ? memory.get(key) : null;
}

function writeRaw(key, value) {
  memory.set(key, value); // always mirror, so a later storage failure loses nothing
  if (storageBroken) return;
  try { window.localStorage.setItem(key, value); } catch { storageBroken = true; }
}

/** Tests call this so they never touch the real saved plan (tests.html shares the app's origin). */
export function useMemoryStorageOnly() {
  storageBroken = true;
}

/** True when changes are only being kept in memory (the UI can warn). */
export function isStorageBroken() {
  return storageBroken;
}

// ---------- validation ----------
const isObj = (v) => typeof v === "object" && v !== null && !Array.isArray(v);
const isNum = (v) => typeof v === "number" && Number.isFinite(v);
const isCount = (v) => Number.isInteger(v) && v >= 0;
const isHalves = (v) => Number.isInteger(v * 2) && v >= 0; // an amount of a dish with no recipe goes up in halves (1.5 pans)
const isTime = (v) => typeof v === "string" && /^([01]?\d|2[0-3]):[0-5]\d$/.test(v);

function checkTurkey(t) {
  if (!isObj(t)) return "turkey is missing";
  if (!inRange(t.weightLb, TURKEY_LB.min, TURKEY_LB.max)) return `turkey weight must be between ${TURKEY_LB.min} and ${TURKEY_LB.max} lb`;
  for (const k of ["frozen", "stuffed", "convection"]) if (typeof t[k] !== "boolean") return `turkey.${k} must be true or false`;
  if (t.method !== "per_lb" && t.method !== "step_down") return "turkey method isn't recognised";
  return null;
}

function checkEquipment(list) {
  if (!Array.isArray(list)) return "equipment isn't a list";
  const ids = new Set();
  for (const e of list) {
    if (!isObj(e) || typeof e.id !== "string" || typeof e.name !== "string") return "an equipment entry is malformed";
    if (ids.has(e.id)) return `equipment id "${e.id}" appears twice`;
    ids.add(e.id);
    if (!EQUIPMENT_TYPES.includes(e.type)) return `equipment "${e.name}" has an unknown type`;
    if (!isCount(e.slots) || e.slots > MAX_SLOTS) return `equipment "${e.name}" needs a whole number of slots (up to ${MAX_SLOTS})`;
    for (const k of ["minTempF", "maxTempF"]) if (e[k] !== null && !isNum(e[k])) return `equipment "${e.name}" has a bad ${k}`;
  }
  return null;
}

// The host's own dishes were added after the first saved plans, so a plan without them is still valid.
function checkOwnDishes(list) {
  if (list === undefined) return null;
  if (!Array.isArray(list)) return "ownDishes isn't a list";
  const ids = new Set();
  for (const d of list) {
    if (!isObj(d) || typeof d.id !== "string" || !isOwnDish(d.id) || ids.has(d.id)) return "one of your own dishes is malformed";
    ids.add(d.id);
    if (ownDishProblem(d)) return `your own dish "${d.name}" is malformed`;
  }
  return null;
}

function checkMenu(menu, ownDishes) {
  if (!Array.isArray(menu)) return "menu isn't a list";
  const ownIds = new Set((Array.isArray(ownDishes) ? ownDishes : []).map((d) => d?.id));
  for (const m of menu) {
    if (!isObj(m) || !(recipes[m.recipeId] || ownIds.has(m.recipeId))) return `menu has an unknown dish "${isObj(m) ? m.recipeId : m}"`;
    if (typeof m.included !== "boolean" || typeof m.batchesOverride !== "boolean") return `menu line "${m.recipeId}" is malformed`;
    if (!isHalves(m.batches) || m.batches > MAX_BATCHES || typeof m.who !== "string" || typeof m.notes !== "string") return `menu line "${m.recipeId}" is malformed`;
    if (m.source !== undefined && m.source !== "guest") return `menu line "${m.recipeId}" has an unknown source`;
  }
  return null;
}

function checkPastNotes(list) {
  if (list === undefined) return null;
  const ok = Array.isArray(list) && list.every((n) =>
    isObj(n) && Number.isInteger(n.year) && typeof n.recipeId === "string" && typeof n.text === "string");
  return ok ? null : "pastNotes is malformed";
}

function checkSettings(s) {
  if (!isObj(s)) return "settings are missing";
  if (!isTime(s.wakeTime)) return "settings.wakeTime isn't a time";
  for (const [k, [min, max]] of Object.entries(SETTING_LIMITS)) {
    if (!inRange(s[k], min, max)) return `settings.${k} must be a number from ${min} to ${max}`;
  }
  return null;
}

// Host edits to step times and temperatures. A hand-edited file must not be able to feed the scheduler garbage.
function checkOverrides(overrides) {
  for (const [key, o] of Object.entries(overrides)) {
    if (!isObj(o)) return `override "${key}" is malformed`;
    if (o.durationMin !== undefined && !inRange(o.durationMin, 1, MAX_STEP_MINUTES)) return `override "${key}" has a bad duration`;
    if (o.stages !== undefined) {
      const ok = Array.isArray(o.stages) && o.stages.length > 0 && o.stages.every((s) =>
        isObj(s) && inRange(s.tempF, 1, MAX_TEMP_F) && inRange(s.minutes, 1, MAX_STEP_MINUTES));
      if (!ok) return `override "${key}" has bad oven stages`;
    }
  }
  return null;
}

function checkCustomItems(items) {
  if (!Array.isArray(items)) return "customItems isn't a list";
  for (const c of items) {
    if (!isObj(c) || typeof c.id !== "string" || typeof c.name !== "string" || typeof c.unit !== "string" || typeof c.store !== "string") return "a custom item is malformed";
    if (!isNum(c.qty) || !BUY_WHEN.includes(c.buyWhen)) return "a custom item is malformed";
  }
  return null;
}

// helpers and owners were added after the first saved plans, so a plan without them is still valid.
function checkHelpers(h) {
  if (h === undefined) return null;
  if (!isObj(h) || typeof h.enabled !== "boolean" || !Array.isArray(h.cooks) || h.cooks.length < 1) return "helpers are malformed";
  const ids = new Set();
  for (const c of h.cooks) {
    if (!isObj(c) || typeof c.id !== "string" || typeof c.name !== "string") return "a cook is malformed";
    if (ids.has(c.id)) return `cook id "${c.id}" appears twice`;
    ids.add(c.id);
  }
  return null;
}

function checkOwners(owners) {
  if (owners === undefined) return null;
  if (!isObj(owners)) return "owners is malformed";
  for (const list of Object.values(owners)) {
    if (!Array.isArray(list) || !list.every((id) => typeof id === "string")) return "an owner list is malformed";
  }
  return null;
}

function checkHolds(holds) {
  if (holds === undefined) return null;
  if (!isObj(holds)) return "holds is malformed";
  if (!Object.values(holds).every((m) => inRange(m, 0, MAX_HOLD_MIN))) return `a hold time must be from 0 to ${MAX_HOLD_MIN} minutes`;
  return null;
}

// Which small appliance a dish cooks in. Added after the first saved plans, so a plan without it is still valid.
function checkCookWith(map) {
  if (map === undefined) return null;
  if (!isObj(map) || !Object.values(map).every((type) => APPLIANCE_TYPES.includes(type))) return "cookWith is malformed";
  return null;
}

function checkConfirmed(c) {
  if (c === undefined) return null;
  if (!isObj(c) || typeof c.people !== "boolean" || typeof c.menu !== "boolean") return "confirmed is malformed";
  return null;
}

/** Menu lines (switched off) for any recipe the plan does not list, so a dish added to the app later can still be picked. */
function missingMenuLines(menu) {
  const listed = new Set(menu.map((m) => m.recipeId));
  return Object.values(recipes)
    .filter((r) => !listed.has(r.id))
    .map((r) => ({ recipeId: r.id, included: false, batches: 1, batchesOverride: false, who: "", notes: "" }));
}

/** Fills in what older saved plans or exports do not have. A plan with no `confirmed` asks again. */
function withDefaults(p) {
  return {
    ...p,
    menu: [...p.menu, ...missingMenuLines(p.menu)],
    helpers: p.helpers ?? defaultHelpers(),
    owners: p.owners ?? {},
    holds: p.holds ?? {},
    cookWith: p.cookWith ?? {},
    confirmed: p.confirmed ?? defaultConfirmed(),
    ownDishes: p.ownDishes ?? [],
    pastNotes: p.pastNotes ?? [],
  };
}

/**
 * Checks that an object has the shape of a Plan. Returns an error message, or null when it is fine.
 * @param {unknown} p
 * @returns {string|null}
 */
export function planError(p) {
  if (!isObj(p)) return "The file doesn't contain a plan.";
  if (p.schemaVersion !== SCHEMA_VERSION) return `This plan uses format version ${p.schemaVersion}, but this app expects ${SCHEMA_VERSION}.`;
  if (!Number.isInteger(p.year)) return "The plan year is missing.";
  if (!isTime(p.dinnerTime)) return "The dinner time isn't a valid time.";
  if (!isCount(p.adults) || !isCount(p.kids) || p.adults > MAX_GUESTS || p.kids > MAX_GUESTS) return `Adults and kids must be whole numbers up to ${MAX_GUESTS}.`;
  if (typeof p.notes !== "string") return "The notes are missing.";
  if (p.lastBackupAt !== null && typeof p.lastBackupAt !== "string") return "The last backup date is malformed.";
  for (const k of ["haveIt", "checked", "overrides", "done"]) if (!isObj(p[k])) return `"${k}" is missing or malformed.`;
  const problem = checkTurkey(p.turkey) || checkEquipment(p.equipment) || checkOwnDishes(p.ownDishes) ||
    checkMenu(p.menu, p.ownDishes) || checkSettings(p.settings) || checkCustomItems(p.customItems) ||
    checkHelpers(p.helpers) || checkOwners(p.owners) || checkHolds(p.holds) || checkConfirmed(p.confirmed) ||
    checkOverrides(p.overrides) || checkPastNotes(p.pastNotes) || checkCookWith(p.cookWith);
  return problem ? `Not a valid plan: ${problem}.` : null;
}

// ---------- the live plan ----------
let plan = defaultPlan();
let loadWarning = "";
const listeners = new Set();

function notify(kind) {
  for (const fn of listeners) fn(kind);
}

function persist() {
  writeRaw(STORAGE_KEY, JSON.stringify(plan));
}

/** Loads the saved plan (or defaults). Call once at startup. */
export function loadPlan() {
  const raw = readRaw(STORAGE_KEY);
  loadWarning = "";
  if (raw === null) { plan = defaultPlan(); return plan; }
  try {
    const parsed = JSON.parse(raw);
    const problem = planError(parsed);
    if (problem) throw new Error(problem);
    plan = withDefaults(parsed);
  } catch (err) {
    plan = defaultPlan();
    loadWarning = `Your plan on this device couldn't be read, so you're seeing the example plan. If you saved a copy, go to Notes and press "Open a saved copy". (${err.message})`;
  }
  return plan;
}

/** A message when the saved plan was unreadable at startup, else "". */
export function getLoadWarning() {
  return loadWarning;
}

export function getPlan() {
  return plan;
}

/** True when the plan changed since the last export. */
export function isChangedSinceBackup() {
  return readRaw(DIRTY_KEY) === "1";
}

/** Calls fn("update" | "replace") after every change. "replace" means the whole plan was swapped. */
export function subscribe(fn) {
  listeners.add(fn);
}

/**
 * Change the plan: mutate it inside `mutator`, and it is saved and everyone is told.
 * @param {(plan: import("./types.js").Plan) => void} mutator
 */
export function updatePlan(mutator) {
  mutator(plan);
  persist();
  writeRaw(DIRTY_KEY, "1");
  notify("update");
}

function replacePlan(newPlan, changed) {
  plan = newPlan;
  persist();
  writeRaw(DIRTY_KEY, changed ? "1" : "0");
  loadWarning = "";
  notify("replace");
}

/** Throws away everything and goes back to the defaults. */
export function resetPlan() {
  replacePlan(defaultPlan(), true);
}

/** Swaps in next year's plan, built from this one (see logic/nextyear.js). */
export function startNextYear() {
  replacePlan(nextYearPlan(plan), true);
}

// ---------- export / import ----------
/** Marks the plan as backed up and returns the JSON text to download. */
export function exportPlanText() {
  plan.lastBackupAt = new Date().toISOString();
  persist();
  writeRaw(DIRTY_KEY, "0");
  notify("update");
  return JSON.stringify(plan, null, 2);
}

/** Starts a browser download of birdbrain-plan.json. */
export function downloadPlan() {
  const blob = new Blob([exportPlanText()], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "birdbrain-plan.json";
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

/**
 * Replaces the plan with the contents of an exported file. A bad file leaves the plan untouched.
 * @param {string} text file contents
 * @returns {{ok: boolean, error?: string}}
 */
export function importPlanText(text) {
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { ok: false, error: "That file isn't valid JSON, so nothing was imported." };
  }
  const problem = planError(parsed);
  if (problem) return { ok: false, error: `${problem} Nothing was imported.` };
  replacePlan(withDefaults(parsed), false);
  return { ok: true };
}
