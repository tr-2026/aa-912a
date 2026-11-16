// Ovens, other equipment and helper cooks: adding, removing and counting them. Pure functions.
// The Setup screen and the first questions both use these, so there is one set of rules.

// Starting values for each kind of equipment. Only the oven is in DESIGN 4.2; the rest are guesses.
// TODO(host): confirm
export const EQUIPMENT_DEFAULTS = {
  oven: { slots: 4, minTempF: 170, maxTempF: 500 },
  air_fryer: { slots: 1, minTempF: 170, maxTempF: 450 },
  slow_cooker: { slots: 1, minTempF: 200, maxTempF: 300 },
  stovetop: { slots: 4, minTempF: null, maxTempF: null },
  other: { slots: 1, minTempF: null, maxTempF: null },
};
export const EQUIPMENT_LABELS = {
  oven: "Oven", air_fryer: "Air fryer", slow_cooker: "Slow cooker", stovetop: "Stovetop", other: "Other",
};

const MAX_OVENS = 4;
const MAX_HELPERS = 3;

// Small appliances a dish can be sent to instead of the oven (plan.cookWith: dish id -> one of these).
export const APPLIANCE_TYPES = ["air_fryer", "slow_cooker"];
export const OVEN_CHOICES = [1, 2, 3, MAX_OVENS];
export const HELPER_CHOICES = [1, 2, MAX_HELPERS];

/** The first id like "oven3" or "cook2" that nothing in `items` uses yet. */
function freeId(prefix, items) {
  const used = new Set(items.map((x) => x.id));
  let n = 1;
  while (used.has(`${prefix}${n}`)) n += 1;
  return `${prefix}${n}`;
}

/**
 * A new piece of equipment of this type, named like "Oven 3".
 * @param {string} type one of the EQUIPMENT_DEFAULTS keys
 * @param {import("../types.js").Equipment[]} equipment what the plan already has
 */
export function newEquipment(type, equipment) {
  const number = equipment.filter((e) => e.type === type).length + 1;
  return { id: freeId(type, equipment), name: `${EQUIPMENT_LABELS[type]} ${number}`, type, ...EQUIPMENT_DEFAULTS[type] };
}

/** How many ovens the plan has. */
export function ovenCount(plan) {
  return plan.equipment.filter((e) => e.type === "oven").length;
}

/**
 * The equipment list with exactly `count` ovens. The first ovens are kept, new ones are added with the standard
 * size, and anything that is not an oven (an air fryer, say) is left alone.
 */
export function withOvenCount(equipment, count) {
  const wanted = Math.max(0, Math.min(MAX_OVENS, Math.round(count)));
  const ovens = equipment.filter((e) => e.type === "oven").slice(0, wanted);
  const others = equipment.filter((e) => e.type !== "oven");
  while (ovens.length < wanted) ovens.push(newEquipment("oven", [...ovens, ...others]));
  return [...ovens, ...others];
}

/** The kinds of small appliance the plan has, in the order APPLIANCE_TYPES lists them. */
export function applianceTypes(plan) {
  return APPLIANCE_TYPES.filter((type) => plan.equipment.some((e) => e.type === type));
}

/**
 * Switch a small appliance on or off. On adds one if there is none. Off removes every one of that type and
 * sends the dishes that were cooking in it back to the oven. Changes `plan`.
 */
export function setAppliance(plan, type, on) {
  const has = plan.equipment.some((e) => e.type === type);
  if (on && !has) plan.equipment.push(newEquipment(type, plan.equipment));
  if (!on) {
    plan.equipment = plan.equipment.filter((e) => e.type !== type);
    for (const [dishId, where] of Object.entries(plan.cookWith)) if (where === type) delete plan.cookWith[dishId];
  }
}

/** True when a dish has a heating step that could move to a small appliance. The turkey is too big and is left out. */
export function canUseAppliance(recipe) {
  return !recipe.thaw && recipe.steps.some((s) => s.kind === "cook");
}

/**
 * The small appliance a dish cooks in, or null for the oven. A choice only counts while the plan still has that
 * appliance, so removing it quietly sends its dishes back to the oven.
 * @returns {"air_fryer"|"slow_cooker"|null}
 */
export function applianceFor(plan, recipe) {
  const type = plan.cookWith?.[recipe.id];
  if (!APPLIANCE_TYPES.includes(type) || !canUseAppliance(recipe)) return null;
  return plan.equipment.some((e) => e.type === type) ? type : null;
}

/**
 * The small appliances this dish could move to: the ones the plan has, if the dish can use them and is not
 * already in one. Empty when there is nothing to suggest.
 */
export function applianceOptions(plan, recipe) {
  if (!canUseAppliance(recipe) || applianceFor(plan, recipe)) return [];
  return applianceTypes(plan);
}

/** How many helpers (besides the main cook) are switched on. */
export function helperCount(plan) {
  return plan.helpers?.enabled ? Math.max(0, plan.helpers.cooks.length - 1) : 0;
}

/** A new helper, named like "Helper 2". */
export function newCook(cooks) {
  return { id: freeId("cook", cooks), name: `Helper ${cooks.length}` };
}

/**
 * The helper setup for "me plus N helpers". 0 switches helpers off (the list is kept in case they come back).
 * @param {import("../types.js").Helpers} helpers
 * @param {number} count
 * @returns {import("../types.js").Helpers}
 */
export function withHelperCount(helpers, count) {
  const wanted = Math.max(0, Math.min(MAX_HELPERS, Math.round(count)));
  if (wanted === 0) return { ...helpers, enabled: false };
  const cooks = helpers.cooks.slice(0, 1 + wanted).map((c) => ({ ...c }));
  while (cooks.length < 1 + wanted) cooks.push(newCook(cooks));
  return { enabled: true, cooks };
}

/** Owner lists with any cook that no longer exists taken out. A dish with nobody left goes back to the main cook. */
export function scrubOwners(owners, validIds) {
  const valid = new Set(validIds);
  const out = {};
  for (const [key, ids] of Object.entries(owners)) {
    const left = ids.filter((id) => valid.has(id));
    if (left.length > 0) out[key] = left;
  }
  return out;
}

/**
 * Take one cook out. Returns the new cook list and owner lists; the inputs are not changed.
 * The main cook (the first one) cannot be removed.
 */
export function withoutCook(helpers, owners, cookId) {
  if (helpers.cooks[0]?.id === cookId) return { helpers, owners };
  const cooks = helpers.cooks.filter((c) => c.id !== cookId);
  return { helpers: { ...helpers, cooks }, owners: scrubOwners(owners, cooks.map((c) => c.id)) };
}
