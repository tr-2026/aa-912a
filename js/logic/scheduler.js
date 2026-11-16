// The scheduler (DESIGN section 7): a greedy backward planner. Deliberately simple and predictable, not optimal.
// Pure: plan + seed data in, a schedule object out. All times are minutes since midnight Thursday.
//
// How it works, in short:
//   1. Collect included dishes with Thursday steps, merge the host's overrides, fill in the turkey stages.
//   2. Place the hardest dishes first (most oven slot-minutes). For each, try finishing at the ideal time,
//      then up to `serve.holdMin` earlier in 5-minute shifts, and keep the first layout that fits.
//   3. Place floating prep steps in free gaps, then add reminders and the holding list.
import { toMinutes, thanksgivingDate } from "./time.js";
import { mergedSteps, stepKey } from "./overrides.js";
import { resolveTurkeyStages } from "./turkey.js";
import { renderInstructions } from "./instructions.js";
import { canBook, overlaps, REFUSED } from "./bookings.js";
import { datedChecklistItems } from "./thaw.js";
import { ownersFor, helpersOn } from "./owners.js";
import { holdFor } from "./holds.js";
import { busyWarnings } from "./risks.js";
import { cookedHere } from "./dishes.js";
import { applianceFor } from "./kitchen.js";

const SHIFT_STEP_MIN = 5;
const MAX_RETRIES = 6; // extra tries with the dishes that did not fit placed first
const LONG_GAP_MIN = 60; // a gap this long (or longer) in an oven means it cooled: remind to preheat again

const ASK_A_GUEST = "Ask a guest to bring this dish instead.";

/**
 * The fixed set of conflict messages (DESIGN 7.4), in everyday words because the screens show them as they are.
 * They say "this dish", never "it", so they read correctly after a plural name such as "Garlic Mashed Potatoes".
 * Code and tests should compare against CONFLICT.x.reason, never against the text itself.
 */
// A hot dish can only wait covered for a short while, so it has to come out of the oven close to dinner. When that
// is why it does not fit, the problem is its temperature at the table, not the oven's temperature.
const HOT_REASON = "There's no oven space close enough to dinner to serve this dish hot";

export const CONFLICT = {
  slots: {
    reason: "There's no room in the oven at the right time",
    hotReason: HOT_REASON, // shown instead when the dish is served hot
    // An air fryer or slow cooker is offered by the screen as a button, and only when the host has one.
    suggestions: ["Make this dish the day before, if the recipe allows.", "Take a dish off the menu.", ASK_A_GUEST],
  },
  temp: {
    reason: "There's no oven space at the right temperature",
    hotReason: HOT_REASON,
    suggestions: ["Let this dish sit covered longer, so it can bake earlier.", ASK_A_GUEST],
  },
  hands: {
    reason: "You may not have the time to prepare this dish",
    suggestions: ["Let this dish sit covered longer, so it can be made earlier.", "Do some of the work on Wednesday.", ASK_A_GUEST],
  },
  wake: {
    reason: "This dish would have to start before your earliest start time",
    suggestions: ["Choose an earlier start time. It's on the Setup screen, under Fine tuning.", "Take a dish off the menu, or pick a simpler one.", ASK_A_GUEST],
  },
  after: {
    reason: "This dish has to wait for another one",
    suggestions: ["Check the turkey's time, or the dish this one waits for.", ASK_A_GUEST],
  },
};
// A dish is tried at several finish times. When the attempts fail for different reasons, report the one that
// still blocks it at the times that satisfy the others: equipment first, then hands, and only then the
// `after` and wake-time limits (those usually just mean "this attempt was too early"). If `after` or wake is
// the ONLY reason, it is reported.
const REASON_PRIORITY = ["slots", "temp", "hands", "after", "wake"];

// A job with no `dayOrder` goes in the middle of its day.
const DEFAULT_DAY_ORDER = 50;

const isHandsOn = (block) => block.kind === "hands_on" || block.kind === "load" || block.kind === "unload";

// ---------- step 1: dishes ----------

/** One included dish with its steps split by when they happen. Each step knows its owners (cook ids). */
function buildDish(item, recipe, plan) {
  const appliance = applianceFor(plan, recipe);
  // A dish sent to a small appliance books one place in it, whatever room the oven recipe asks for. Its oven
  // temperature is kept as written and is not checked against the appliance's range: the host decides what the
  // right setting is (the step's time and temperature can be changed on the Schedule screen).
  const toAppliance = (s) => (appliance && s.kind === "cook"
    ? { ...s, appliance: true, cook: { ...s.cook, equipmentType: appliance, slots: 1 } }
    : s);
  const steps = resolveTurkeyStages(mergedSteps(recipe, plan.overrides), plan.turkey)
    .map((s) => toAppliance({ ...s, owners: ownersFor(plan, recipe.id, s.id) }));
  return {
    recipe, item,
    holdMin: holdFor(plan, recipe), // the host's choice for this plan, or the seed's standard
    thursday: steps.filter((s) => s.dayOffset === 0 && !s.floating),
    floating: steps.filter((s) => s.dayOffset === 0 && s.floating),
    ahead: steps.filter((s) => s.dayOffset < 0),
  };
}

function buildDishes(plan, recipes) {
  return plan.menu
    .filter((item) => item.included && cookedHere(item) && recipes[item.recipeId])
    .map((item) => buildDish(item, recipes[item.recipeId], plan));
}

function cookStages(step) {
  return step.cook.stages;
}

function slotMinutes(dish) {
  return dish.thursday
    .filter((s) => s.kind === "cook")
    .reduce((sum, s) => sum + cookStages(s).reduce((m, st) => m + st.minutes, 0) * s.cook.slots, 0);
}

const dependencyDishIds = (dish) => dish.thursday.filter((s) => s.after).map((s) => s.after.split(".")[0]);

/** Keeps the order given, except that a dish always comes after the dish it waits on (2b). */
function dependenciesFirst(dishes) {
  const remaining = [...dishes];
  const ordered = [];
  while (remaining.length > 0) {
    const waitingOn = (d) => dependencyDishIds(d).some((id) => remaining.some((r) => r !== d && r.recipe.id === id));
    const index = remaining.findIndex((d) => !waitingOn(d));
    ordered.push(...remaining.splice(index === -1 ? 0 : index, 1));
  }
  return ordered;
}

// The main dish (the turkey) always gets first pick of the oven and of the cooks' time. Dinner can lose a side
// dish; it cannot lose the turkey.
const isMain = (dish) => dish.recipe.category === "main";

/** The main dish first, then hardest first (2a), hot before room/cold (2c), and a dish after the dish it waits on (2b). */
function orderDishes(dishes) {
  const mainRank = (d) => (isMain(d) ? 0 : 1);
  const hotRank = (d) => (d.recipe.serve.temp === "hot" ? 0 : 1);
  return dependenciesFirst([...dishes].sort((a, b) => mainRank(a) - mainRank(b) || slotMinutes(b) - slotMinutes(a) || hotRank(a) - hotRank(b)));
}

const missingIds = (ctx) => new Set(ctx.conflicts.filter((c) => !c.placed).map((c) => c.dishId));

/**
 * The same dishes with the ones that did not fit moved forward, so they get an earlier pick next time.
 * The main dish stays in front whatever happened: a retry must never trade the turkey for a side dish.
 */
function retryOrder(order, ctx) {
  const failed = missingIds(ctx);
  return dependenciesFirst([
    ...order.filter(isMain),
    ...order.filter((d) => !isMain(d) && failed.has(d.recipe.id)),
    ...order.filter((d) => !isMain(d) && !failed.has(d.recipe.id)),
  ]);
}

// ---------- step 3: laying a dish out backward ----------

function blockFor(step, start, end, kind, extra = {}) {
  return { start, end, kind, stepId: step.id, owners: step.owners, ...extra };
}

// ---------- hands-on time, per cook ----------
// Each cook can do one hands-on task at a time. Passive time and oven time need nobody.

const handsOf = (ctx, cookId) => (ctx.handsOn[cookId] ||= []);
const isBusy = (ctx, owners, interval) => owners.some((c) => handsOf(ctx, c).some((h) => overlaps(interval, h)));
const addHands = (ctx, owners, interval) => owners.forEach((c) => handsOf(ctx, c).push({ start: interval.start, end: interval.end }));

/** Blocks for one cook step, working backward from `end` (the end of unloading). Chronological. */
function cookBlocks(step, end, settings) {
  const blocks = [blockFor(step, end - settings.unloadMin, end, "unload")];
  let cursor = end - settings.unloadMin;
  const stages = cookStages(step);
  for (let i = stages.length - 1; i >= 0; i--) {
    const { tempF, minutes, toleranceF } = stages[i];
    blocks.push(blockFor(step, cursor - minutes, cursor, "cook", {
      tempF, toleranceF: toleranceF ?? settings.tempToleranceF, slots: step.cook.slots, stageIndex: i,
    }));
    cursor -= minutes;
  }
  blocks.push(blockFor(step, cursor - settings.loadMin, cursor, "load"));
  return blocks.reverse();
}

/** The whole Thursday chain of a dish, back to back, ending at `readyAt`. Chronological. */
function layOutBackward(dish, readyAt, settings) {
  const chain = [];
  let end = readyAt;
  for (const step of [...dish.thursday].reverse()) {
    const blocks = step.kind === "cook"
      ? cookBlocks(step, end, settings)
      : [blockFor(step, end - step.durationMin, end, step.kind)];
    chain.unshift(...blocks);
    end = blocks[0].start;
  }
  return chain;
}

// ---------- step 3: does the chain fit? ----------

function newContext(plan, settings) {
  return {
    plan, settings,
    dinner: toMinutes(plan.dinnerTime),
    wake: toMinutes(settings.wakeTime),
    handsOn: {},            // cook id -> committed hands-on blocks
    bookings: {},           // equipmentId -> bookings
    stepEnds: {},           // "dish.step" -> minute the step is completely finished
    unplaced: new Set(),    // dishes that could not be placed
    thursday: [], reminders: [], holding: [], conflicts: [],
  };
}

/** Equipment bookings for one cook step: one per stage; load is part of the first, unload of the last. */
function stageBookings(blocks, equipmentId, dishId) {
  const stages = blocks.filter((b) => b.kind === "cook");
  const load = blocks.find((b) => b.kind === "load");
  const unload = blocks.find((b) => b.kind === "unload");
  return stages.map((b, i) => ({
    start: i === 0 ? load.start : b.start,
    end: i === stages.length - 1 ? unload.end : b.end,
    tempF: b.tempF, toleranceF: b.toleranceF, slots: b.slots, stage: b.stageIndex,
    equipmentId, dishId, stepId: b.stepId,
  }));
}

/** Try every piece of equipment of the right type; the first that takes every stage wins. */
function findEquipment(ctx, step, blocks, working, dishId) {
  const candidates = ctx.plan.equipment.filter((e) => e.type === step.cook.equipmentType);
  let sawSlots = candidates.length === 0; // no equipment at all counts as "no slot free"
  for (const equipment of candidates) {
    const existing = [...(ctx.bookings[equipment.id] || []), ...(working[equipment.id] || [])];
    const wanted = stageBookings(blocks, equipment.id, dishId);
    const rules = step.appliance ? { ...equipment, minTempF: null, maxTempF: null } : equipment; // see buildDish
    const results = wanted.map((w) => canBook(rules, existing, w, w, ctx.settings.transitionMin));
    const failed = results.find((r) => !r.ok);
    if (!failed) return { equipment, bookings: wanted };
    if (failed.reason === REFUSED.SLOTS) sawSlots = true;
  }
  return { reason: sawSlots ? REFUSED.SLOTS : REFUSED.TEMP };
}

/** Wake time, `after` dependencies, and one-cook overlap. Returns a reason key or null. */
function checkTimes(ctx, dish, chain) {
  if (chain[0].start < ctx.wake) return "wake";
  for (const step of dish.thursday.filter((s) => s.after)) {
    const dependencyDish = step.after.split(".")[0];
    if (ctx.unplaced.has(dependencyDish)) return "after";
    const dependencyEnd = ctx.stepEnds[step.after];
    if (dependencyEnd !== undefined && chain[0].start < dependencyEnd) return "after";
  }
  if (chain.filter(isHandsOn).some((b) => isBusy(ctx, b.owners, b))) return "hands";
  return null;
}

/** All checks from DESIGN 7.3. Returns { ok: true, picks } or { ok: false, reason }. */
function fits(ctx, dish, chain) {
  const timeProblem = checkTimes(ctx, dish, chain);
  if (timeProblem) return { ok: false, reason: timeProblem };

  const picks = {}; // stepId -> { equipment, bookings }
  const working = {};
  for (const step of dish.thursday.filter((s) => s.kind === "cook")) {
    const blocks = chain.filter((b) => b.stepId === step.id);
    const found = findEquipment(ctx, step, blocks, working, dish.recipe.id);
    if (!found.equipment) return { ok: false, reason: found.reason };
    picks[step.id] = found;
    working[found.equipment.id] = [...(working[found.equipment.id] || []), ...found.bookings];
  }
  return { ok: true, picks };
}

// ---------- step 3: committing a chain ----------

function entryFor(ctx, dish, step, block, equipment) {
  const { recipe, item } = dish;
  const text = renderInstructions(step.instructions || "", recipe, item.batches, ctx.ingredients);
  const base = {
    start: block.start, end: block.end, dishId: recipe.id, stepId: step.id, kind: block.kind, instructions: text,
    ...(step.edited ? { edited: true } : {}), // so the screen can show an "edited" badge
  };
  // Named after the dish ("Put Stuffing in Oven 2"), not the step ("Put Bake stuffing in Oven 2").
  if (block.kind === "load") return { ...base, label: `Put ${recipe.name} in ${equipment.name}`, equipmentId: equipment.id, instructions: `Put it in ${equipment.name} (preheated).` };
  if (block.kind === "unload") return { ...base, label: `Take ${recipe.name} out of ${equipment.name}`, equipmentId: equipment.id, instructions: `Take it out of ${equipment.name}.` };
  if (block.kind === "cook") return { ...base, label: `${step.name} at ${block.tempF}°F`, equipmentId: equipment.id, tempF: block.tempF };
  return { ...base, label: step.name };
}

/** Who is busy during this entry: only hands-on work (including loading and unloading) needs a person. */
function withOwners(entry, block) {
  return isHandsOn(block) ? { ...entry, owners: block.owners } : entry;
}

function commitChain(ctx, dish, chain, picks) {
  for (const block of chain) {
    const step = dish.thursday.find((s) => s.id === block.stepId);
    const equipment = picks[block.stepId]?.equipment;
    ctx.thursday.push(withOwners(entryFor(ctx, dish, step, block, equipment), block));
    if (isHandsOn(block)) addHands(ctx, block.owners, block);
  }
  for (const { equipment, bookings } of Object.values(picks)) {
    ctx.bookings[equipment.id] = [...(ctx.bookings[equipment.id] || []), ...bookings];
  }
  for (const step of dish.thursday) {
    const last = chain.filter((b) => b.stepId === step.id).pop();
    ctx.stepEnds[stepKey(dish.recipe.id, step.id)] = last.end;
    addStepReminder(ctx, dish, step, chain);
  }
  const readyAt = chain[chain.length - 1].end;
  if (readyAt < ctx.dinner) ctx.holding.push({ dishId: dish.recipe.id, from: readyAt, to: ctx.dinner });
}

/** A step's own reminder fires `offsetMin` from the end of the cooking (or of the step, if it is not a cook step). */
function addStepReminder(ctx, dish, step, chain) {
  if (!step.reminder) return;
  const blocks = chain.filter((b) => b.stepId === step.id);
  const anchor = step.kind === "cook"
    ? blocks.filter((b) => b.kind === "cook").pop().end
    : blocks[blocks.length - 1].end;
  ctx.reminders.push({
    at: anchor + step.reminder.offsetMin, kind: step.reminder.kind || "custom",
    dishId: dish.recipe.id, text: step.reminder.text,
  });
}

// ---------- step 3: placing one dish ----------

/** The conflict for a dish. The fixed suggestions come first; a hands-on conflict also points at helper cooks. */
function conflictFor(ctx, dishId, reasons, servedHot = false) {
  const key = REASON_PRIORITY.find((r) => reasons.has(r)) || "hands";
  const suggestions = [...CONFLICT[key].suggestions];
  if (key === "hands") {
    suggestions.push(helpersOn(ctx.plan)
      ? "Give this dish, or one step of it, to another cook."
      : "Ask someone to help. Add a helper on the Setup screen and give them this dish.");
  }
  // `servedHot`: the dish is eaten hot and its oven problem is the short time it may wait. Screens say so.
  return { dishId, reason: CONFLICT[key].reason, suggestions, ...(servedHot && CONFLICT[key].hotReason ? { servedHot: true } : {}) };
}

/** Try the ideal finish time, then earlier ones, up to holdMin earlier. Returns the chain or null. */
function placeChain(ctx, dish) {
  const { serve } = dish.recipe;
  const base = ctx.dinner - (serve.temp === "hot" ? ctx.settings.readyBufferMin : 0);
  const reasons = new Set();
  for (let shift = 0; shift <= dish.holdMin; shift += SHIFT_STEP_MIN) {
    const chain = layOutBackward(dish, base - shift, ctx.settings);
    const result = fits(ctx, dish, chain);
    if (result.ok) {
      commitChain(ctx, dish, chain, result.picks);
      return { chain };
    }
    reasons.add(result.reason);
  }
  ctx.conflicts.push(conflictFor(ctx, dish.recipe.id, reasons, serve.temp === "hot"));
  ctx.unplaced.add(dish.recipe.id);
  return null;
}

// ---------- step 4: floating steps ----------

/** Find a gap of `duration` minutes ending at or before `latestEnd` where all `owners` are free, not before wake time. */
function findGap(ctx, duration, latestEnd, owners) {
  for (let end = latestEnd; end - duration >= ctx.wake; end -= SHIFT_STEP_MIN) {
    const candidate = { start: end - duration, end };
    if (!isBusy(ctx, owners, candidate)) return candidate;
  }
  return null;
}

function placeFloating(ctx, dish, anchor) {
  let latestEnd = anchor;
  for (const step of [...dish.floating].reverse()) {
    const gap = findGap(ctx, step.durationMin, latestEnd, step.owners);
    if (!gap) {
      ctx.conflicts.push(conflictFor(ctx, dish.recipe.id, new Set(["hands"])));
      return;
    }
    const block = blockFor(step, gap.start, gap.end, "hands_on");
    ctx.thursday.push(withOwners(entryFor(ctx, dish, step, block, null), block));
    addHands(ctx, step.owners, gap);
    latestEnd = gap.start;
  }
}

// ---------- step 5: reminders ----------

function equipmentName(ctx, id) {
  return ctx.plan.equipment.find((e) => e.id === id).name;
}

/** Preheat before an oven's first booking and after long gaps; "raise/lower" when the temperature changes. */
function addEquipmentReminders(ctx, equipmentId) {
  const name = equipmentName(ctx, equipmentId);
  const sorted = [...ctx.bookings[equipmentId]].sort((a, b) => a.start - b.start);
  let prevEnd = null;
  let prevTemp = null;
  for (const b of sorted) {
    const needsPreheat = prevEnd === null || b.start - prevEnd > LONG_GAP_MIN;
    if (needsPreheat) {
      const at = b.start - ctx.settings.preheatMin;
      ctx.reminders.push({ at, kind: "preheat", equipmentId, dishId: b.dishId, text: `Preheat ${name} to ${b.tempF}°F.` });
      // The dish itself fits, but its oven would have to be turned on before the earliest start time.
      // `placed: true` tells the screens the dish IS on the plan, so they do not say it is missing.
      if (at < ctx.wake && !ctx.conflicts.some((c) => c.dishId === b.dishId)) {
        ctx.conflicts.push({ ...conflictFor(ctx, b.dishId, new Set(["wake"])), placed: true });
      }
    } else if (b.start >= prevEnd && b.tempF !== prevTemp) {
      const verb = b.tempF > prevTemp ? "Raise" : "Lower";
      ctx.reminders.push({ at: b.start, kind: "transition", equipmentId, dishId: b.dishId, text: `${verb} ${name} to ${b.tempF}°F.` });
    }
    if (prevEnd === null || b.end >= prevEnd) { prevEnd = b.end; prevTemp = b.tempF; }
  }
}

// ---------- the checklist (days before) ----------

function checklistFromSteps(ctx, dishes) {
  const thanksgiving = thanksgivingDate(ctx.plan.year);
  const items = [];
  for (const dish of dishes) {
    for (const step of dish.ahead) {
      const date = new Date(thanksgiving.getFullYear(), thanksgiving.getMonth(), thanksgiving.getDate() + step.dayOffset);
      items.push({
        dayOffset: step.dayOffset, dayOrder: step.dayOrder ?? DEFAULT_DAY_ORDER, date, dishId: dish.recipe.id, stepId: step.id, label: step.name,
        durationMin: step.durationMin || 0, owners: step.owners,
        instructions: renderInstructions(step.instructions || "", dish.recipe, dish.item.batches, ctx.ingredients),
        ...(step.edited ? { edited: true } : {}),
      });
    }
  }
  return items;
}

// ---------- placing every dish ----------

/** Place every dish in the order given. Returns the filled-in context. */
function placeAll(plan, ingredients, order) {
  const ctx = newContext(plan, plan.settings);
  ctx.ingredients = ingredients;
  for (const dish of order) {
    if (dish.thursday.length > 0) {
      const placed = placeChain(ctx, dish);
      if (placed && dish.floating.length > 0) placeFloating(ctx, dish, placed.chain[0].start);
    } else if (dish.floating.length > 0) {
      const base = ctx.dinner - (dish.recipe.serve.temp === "hot" ? ctx.settings.readyBufferMin : 0);
      placeFloating(ctx, dish, base);
    }
  }
  for (const equipmentId of Object.keys(ctx.bookings)) addEquipmentReminders(ctx, equipmentId);
  return ctx;
}

/**
 * Dishes are placed one at a time and never moved, so an early dish can take the only spot a later one could
 * use. When something does not fit, try again with those dishes first, and keep the try that fits the most.
 * No rule is relaxed, and the same plan always gives the same answer.
 */
function bestPlacement(plan, ingredients, dishes) {
  let order = orderDishes(dishes);
  let latest = placeAll(plan, ingredients, order);
  let best = latest;
  for (let i = 0; i < MAX_RETRIES && missingIds(best).size > 0; i++) {
    order = retryOrder(order, latest);
    latest = placeAll(plan, ingredients, order);
    if (missingIds(latest).size < missingIds(best).size) best = latest;
  }
  return best;
}

// ---------- the public function ----------

/**
 * Build the whole schedule.
 * @param {import("../types.js").Plan} plan
 * @param {Object<string, import("../types.js").Recipe>} recipes
 * @param {Object<string, import("../types.js").Ingredient>} ingredients used to fill {placeholders}
 * @returns {import("../types.js").Schedule}
 */
export function buildSchedule(plan, recipes, ingredients) {
  const dishes = buildDishes(plan, recipes);
  const ctx = bestPlacement(plan, ingredients, dishes);

  const checklist = [...datedChecklistItems(plan, recipes), ...checklistFromSteps(ctx, dishes)]
    // Within one day, the jobs that run by themselves (soaking, chilling) come first, so they work while you do the rest.
    .sort((a, b) => a.dayOffset - b.dayOffset || (a.dayOrder ?? DEFAULT_DAY_ORDER) - (b.dayOrder ?? DEFAULT_DAY_ORDER));
  return {
    thursday: ctx.thursday.sort((a, b) => a.start - b.start || a.end - b.end),
    reminders: ctx.reminders.sort((a, b) => a.at - b.at),
    holding: ctx.holding,
    checklist,
    conflicts: ctx.conflicts,
    warnings: riskWarnings(ctx),
  };
}

/** Soft risks: a cook whose busiest hour is nearly full leaves no room for anything to run late. */
function riskWarnings(ctx) {
  const later = "Let some dishes sit covered longer, so they can be made earlier.";
  const suggestions = helpersOn(ctx.plan)
    ? ["Give one of these jobs to another cook.", later]
    : ["Ask someone to help. Add a helper on the Setup screen.", later];
  return busyWarnings(ctx.handsOn).map((w) => ({ ...w, suggestions: [...suggestions] }));
}
