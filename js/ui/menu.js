// Dishes screen (the "menu" screen in the code): one quiet line per dish you are making. Pressing a line opens
// one pop-up where everything about that dish is changed and its recipe is shown.
// Dishes you are not making this year wait in one folded list at the bottom.
import { getPlan, updatePlan, subscribe } from "../state.js";
import { allRecipes } from "./recipebook.js";
import { ingredients } from "../seed/ingredients.js";
import { planEquivalents, suggestedBatches } from "../logic/guests.js";
import { dishOwners, helpersOn, mainCookId, cookName } from "../logic/owners.js";
import { EQUIPMENT_LABELS, applianceTypes, applianceFor, canUseAppliance } from "../logic/kitchen.js";
import { cookedHere, removeOwnDish, setGuestBringing } from "../logic/dishes.js";
import { pastNotesFor } from "../logic/nextyear.js";
import { el, field, lazyScreen, isTyping, rebuildKeepingFocus } from "./dom.js";
import { CATEGORIES, formatQty, plural, isPluralName, guestBadge } from "./format.js";
import { ownerPicker, saveOwners } from "./ownerpicker.js";
import { holdControl, hasHoldTime } from "./holdcontrol.js";
import { unfinishedNote } from "./gate.js";
import { offerUndo } from "./undo.js";
import { openAddDish } from "./adddish.js";

const TAG_LABELS = { gf: "Gluten-free", vegetarian: "Vegetarian", dairy_free: "Dairy-free", nut_free: "Nut-free" };

// The list is rebuilt after every change, so what is open is remembered here.
let offMenuOpen = false;

/** Change one menu line inside the plan. */
function changeItem(recipeId, change) {
  updatePlan((p) => change(p.menu.find((m) => m.recipeId === recipeId), p));
}

function chips(tags) {
  return tags.map((t) => el("span", { class: "badge", text: TAG_LABELS[t] || t }));
}

/** What one batch is called: "pan" for sweet potatoes, "batch" for a dish with a recipe. */
const unitOf = (recipe) => recipe.unit ?? { one: "batch", many: "batches" };

/** "1 pan", "1 1/2 pans", "1/2 dozen". Anything of one or less is singular. */
function countText(n, { one, many }) {
  return `${formatQty(n)} ${n <= 1 ? one : many}`;
}

/** The smallest change in the amount: half a pan for a dish with no recipe, a whole batch otherwise. */
const stepOf = (recipe) => recipe.unit?.step ?? 1;

/** True when the dish has an amount counted in batches: not the turkey (by weight) and not a dish you added. */
function hasBatches(item, recipe) {
  return !recipe.own && recipe.servesBase > 0;
}

/**
 * How much of the dish there will be: "15 lb" for the turkey, otherwise the number of batches in the dish's own
 * word ("2 batches", "1 pan", "2 dozen"). A dish you added has no amount.
 */
function amountText(item, recipe) {
  if (recipe.thaw) return cookedHere(item) ? `${formatQty(getPlan().turkey.weightLb)} lb` : "";
  if (!hasBatches(item, recipe)) return "";
  return countText(item.batches, unitOf(recipe));
}

// ---------- the list ----------

/**
 * The short grey text beside a dish's name: "2 batches", "A guest brings it", "a helper cooks it · in the air fryer".
 * "You" is never shown: a dish with no name on it is yours.
 */
function rowSummary(item, recipe) {
  const plan = getPlan();
  const it = isPluralName(recipe.name) ? "them" : "it";
  // The "Brought by a guest" tag beside the name already says it; the grey text only adds a name, if one was typed.
  if (!cookedHere(item)) return [item.who ? `${item.who} brings ${it}` : "", amountText(item, recipe)].filter(Boolean).join(" · ");
  const parts = [amountText(item, recipe)].filter(Boolean);
  const main = mainCookId(plan);
  const owners = dishOwners(plan, recipe.id);
  if (owners.some((cookId) => cookId !== main)) {
    const names = owners.map((cookId) => (cookId === main ? "you" : cookName(plan, cookId)));
    parts.push(`${names.join(" and ")} ${names.length > 1 ? "cook" : "cooks"} ${it}`);
  }
  const appliance = applianceFor(plan, recipe);
  if (appliance) parts.push(`in the ${EQUIPMENT_LABELS[appliance].toLowerCase()}`);
  return parts.join(" · ");
}

/** One dish: the whole line is a button that opens the dish's pop-up. */
function dishRow(item, recipe, openDish) {
  return el("button", { type: "button", class: "dish-row", "data-focus": `dish:${recipe.id}`, onclick: () => openDish(recipe.id) }, [
    el("span", { class: "dish-row-name" }, [recipe.name, cookedHere(item) ? null : guestBadge()].filter(Boolean)),
    el("span", { class: "dish-row-info", text: rowSummary(item, recipe) }),
    el("span", { class: "dish-row-arrow", "aria-hidden": "true", text: "›" }),
  ]);
}

function includeBox(item, recipe) {
  const box = el("input", { type: "checkbox", "data-focus": `inc:${recipe.id}`, "aria-label": `${recipe.name} is on the menu` });
  box.checked = item.included;
  box.addEventListener("change", () => changeItem(recipe.id, (m) => { m.included = box.checked; }));
  return box;
}

/** Dishes that are not on this year's menu: a tick box and a name each. */
function offMenuCard(items) {
  if (items.length === 0) return null;
  const details = el("details", { class: "card fold" }, [
    el("summary", {}, [
      el("span", { class: "fold-title", text: `Not on the menu (${items.length})` }),
      el("span", { class: "fold-note", text: "tick a dish to add it" }),
    ]),
    el("div", { class: "off-grid" }, items.map((m) => {
      const recipe = allRecipes()[m.recipeId];
      return el("label", { class: "check" }, [includeBox(m, recipe), el("span", { text: recipe.name })]);
    })),
  ]);
  details.open = offMenuOpen;
  details.addEventListener("toggle", () => { offMenuOpen = details.open; });
  return details;
}

/** A short card with one button. The form itself is a pop-up (ui/adddish.js). */
function addDishCard() {
  return el("section", { class: "card" }, [
    el("h3", { text: "Not in the list?" }),
    el("p", { class: "subtle", text: "Add a dish of your own, such as a family recipe." }),
    el("div", { class: "row" }, [el("button", { type: "button", text: "Add a dish", "data-focus": "own:add", onclick: () => openAddDish() })]),
  ]);
}

// ---------- the dish pop-up ----------

/** "− 2 batches +". BirdBrain suggests a number from the guest count; changing it keeps your number. */
function stepper(item, recipe) {
  const id = recipe.id;
  const step = stepOf(recipe);
  const set = (n) => changeItem(id, (m) => { m.batches = Math.max(step, n); m.batchesOverride = true; });
  const less = el("button", { type: "button", class: "step", "aria-label": `Make less ${recipe.name}`, "data-focus": `minus:${id}`, disabled: item.batches <= step, text: "−", onclick: () => set(item.batches - step) });
  const more = el("button", { type: "button", class: "step", "aria-label": `Make more ${recipe.name}`, "data-focus": `plus:${id}`, text: "+", onclick: () => set(item.batches + step) });
  const useSuggested = item.batchesOverride
    ? el("button", {
      type: "button", class: "link", "data-focus": `auto:${id}`, text: "use suggested",
      onclick: () => changeItem(id, (m, p) => { m.batchesOverride = false; m.batches = suggestedBatches(planEquivalents(p), recipe.servesBase, step); }),
    })
    : null;
  return el("div", { class: "stepper" }, [
    el("span", { class: "field-label", text: "How much" }),
    less, el("output", { class: "count wide", "aria-label": `How much ${recipe.name}`, text: countText(item.batches, unitOf(recipe)) }), more, useSuggested,
  ].filter(Boolean));
}

/**
 * "Cooks in: Oven / Air fryer / Slow cooker". Shown only when the plan has a small appliance and the dish has a
 * heating step. A dish sent to an appliance stops using the oven.
 */
function cookWithBox(recipe) {
  const plan = getPlan();
  const types = applianceTypes(plan);
  if (types.length === 0 || !canUseAppliance(recipe)) return null;
  const current = applianceFor(plan, recipe);
  const select = el("select", { "aria-label": `Where ${recipe.name} cooks`, "data-focus": `with:${recipe.id}` }, [
    el("option", { value: "oven", text: "Oven" }),
    ...types.map((t) => el("option", { value: t, text: EQUIPMENT_LABELS[t] })),
  ]);
  select.value = current ?? "oven";
  select.addEventListener("change", () => updatePlan((p) => {
    if (select.value === "oven") delete p.cookWith[recipe.id]; else p.cookWith[recipe.id] = select.value;
  }));
  return el("div", {}, [
    field("Cooks in", select),
    current ? el("p", { class: "subtle", text: "The recipe is written for an oven. Check the temperature and the time: open the step on the Schedule screen to change them." }) : null,
  ].filter(Boolean));
}

/** "A guest is bringing this", and then who: the dish stays on the menu, but it adds no jobs and nothing to buy. */
function guestPart(item, recipe) {
  const box = el("input", { type: "checkbox", "data-focus": `guest:${recipe.id}` });
  box.checked = !cookedHere(item);
  box.addEventListener("change", () => changeItem(recipe.id, (m) => setGuestBringing(m, recipe, box.checked)));
  const parts = [el("label", { class: "check" }, [box, el("span", { text: "A guest is bringing this (nothing to cook or buy)" })])];
  if (!cookedHere(item)) {
    const who = el("input", { type: "text", value: item.who, placeholder: "Their name", "data-focus": `who:${recipe.id}` });
    who.addEventListener("input", () => changeItem(recipe.id, (m) => { m.who = who.value; }));
    parts.push(field("Who is bringing it?", who));
  }
  return parts;
}

/** The part of the pop-up that changes this year's plan for the dish. */
function settingsFor(item, recipe) {
  const id = recipe.id;
  const plan = getPlan();
  const notes = el("input", { type: "text", value: item.notes, placeholder: "For example: make it less salty", "data-focus": `note:${id}` });
  notes.addEventListener("input", () => changeItem(id, (m) => { m.notes = notes.value; }));

  const body = [];
  if (hasBatches(item, recipe)) body.push(stepper(item, recipe));
  body.push(...guestPart(item, recipe));
  if (cookedHere(item)) {
    body.push(cookWithBox(recipe));
    if (helpersOn(plan) && recipe.steps.length > 0) {
      body.push(ownerPicker({
        label: "Who cooks it", focusKey: id, current: dishOwners(plan, id),
        onChange: (next) => saveOwners(id, next, [mainCookId(plan)]),
      }));
    }
    if (hasHoldTime(recipe)) body.push(holdControl(recipe));
  }
  body.push(field("A note for this year", notes));
  return el("div", { class: "dish-settings" }, body.filter(Boolean));
}

/** The recipe part of the pop-up: ingredients for the number of batches, notes and past years. */
function recipeParts(recipe, item) {
  const parts = [];
  if (recipe.ingredients.length > 0 && cookedHere(item)) {
    const batches = recipe.servesBase === 0 ? 1 : item.batches;
    parts.push(el("h4", { text: recipe.servesBase === 0 ? "Ingredients" : `Ingredients for ${plural(batches, "batch", "batches")}` }));
    parts.push(el("ul", {}, recipe.ingredients.map((l) => {
      const amount = [formatQty(l.qty * batches), l.unit, ingredients[l.ingredientId].name].filter(Boolean).join(" ");
      return el("li", { text: l.prep ? `${amount}, ${l.prep}` : amount });
    })));
  }
  if (recipe.own) {
    const bake = recipe.steps.find((s) => s.kind === "cook");
    parts.push(el("p", { text: bake ? bake.instructions : "Nothing to bake on Thursday." }));
  }
  if (recipe.notes) parts.push(el("p", { text: recipe.notes }));
  // Notes the host wrote in earlier years come first, then the ones that came with the recipe.
  const past = [...pastNotesFor(getPlan(), recipe.id), ...recipe.history];
  if (past.length > 0) {
    parts.push(el("h4", { text: "Past years" }));
    parts.push(el("ul", {}, past.map((h) => el("li", { text: `${h.year}: ${h.text}` }))));
  }
  return parts;
}

/** Takes the dish off this year's menu. It moves to "Not on the menu", and Undo puts it back. */
function takeOffButton(recipe, close) {
  return el("button", {
    type: "button", class: "quiet", text: "Take off the menu", "data-focus": `off:${recipe.id}`,
    onclick: () => {
      close();
      changeItem(recipe.id, (m) => { m.included = false; });
      offerUndo(`Took ${recipe.name} off the menu.`, () => changeItem(recipe.id, (m) => { m.included = true; }));
    },
  });
}

/** Only for a dish the host added. Undo puts back the dish and everything saved about it. */
function removeOwnButton(recipe, close) {
  return el("button", {
    type: "button", class: "danger", text: "Delete this dish", "data-focus": `rmown:${recipe.id}`,
    onclick: () => {
      const keys = ["ownDishes", "menu", "holds", "cookWith", "owners", "overrides", "done", "checked", "haveIt"];
      const before = JSON.parse(JSON.stringify(Object.fromEntries(keys.map((k) => [k, getPlan()[k]]))));
      close();
      updatePlan((p) => removeOwnDish(p, recipe.id));
      offerUndo(`Deleted ${recipe.name}.`, () => updatePlan((p) => Object.assign(p, before)));
    },
  });
}

/** Everything the pop-up shows for one dish. */
function dishDialogBody(recipe, item, close) {
  const meta = [`Served ${recipe.serve.temp === "room" ? "at room temperature" : recipe.serve.temp}`];
  if (hasBatches(item, recipe)) meta.push(`one ${unitOf(recipe).one} feeds ${recipe.servesBase}`);
  else if (recipe.thaw && cookedHere(item)) meta.push(`${amountText(item, recipe)} (change the weight on the Setup screen)`);
  if (recipe.own) meta.push("a dish you added");
  return [
    el("h3", { text: recipe.name }),
    el("p", { class: "subtle", text: meta.join(" · ") }),
    recipe.tags.length > 0 ? el("div", { class: "row" }, chips(recipe.tags)) : null,
    settingsFor(item, recipe),
    ...recipeParts(recipe, item),
    el("div", { class: "dish-dialog-buttons" }, [
      el("button", { type: "button", text: "Done", "data-focus": "dish:done", onclick: close }),
      takeOffButton(recipe, close),
      recipe.own ? removeOwnButton(recipe, close) : null,
    ].filter(Boolean)),
  ].filter(Boolean);
}

// ---------- the screen ----------

/** Build the Dishes screen into `container`. */
export function mountMenu(container) {
  const list = el("div", { class: "dish-page" });
  const dialog = el("dialog", { class: "card-dialog dish-dialog", "aria-label": "Dish" });
  container.append(list, dialog);

  let openId = null; // the dish whose pop-up is showing
  const close = () => dialog.close();
  dialog.addEventListener("close", () => { openId = null; });

  /** Fill the pop-up for the open dish. Closes it if the dish has gone. */
  const fillDialog = () => {
    const recipe = allRecipes()[openId];
    const item = getPlan().menu.find((m) => m.recipeId === openId && m.included);
    if (!recipe || !item) { if (dialog.open) close(); return; }
    dialog.replaceChildren(...dishDialogBody(recipe, item, close));
  };
  const openDish = (recipeId) => {
    openId = recipeId;
    fillDialog();
    if (!dialog.open && openId) dialog.showModal();
  };

  const build = () => {
    const plan = getPlan();
    const on = plan.menu.filter((m) => m.included);
    const off = plan.menu.filter((m) => !m.included);

    // One card, one column: each part of the menu is a heading followed by its dishes.
    const groups = CATEGORIES.flatMap(([category, label]) => {
      const rows = on
        .filter((m) => allRecipes()[m.recipeId].category === category)
        .map((m) => dishRow(m, allRecipes()[m.recipeId], openDish));
      return rows.length ? [el("h3", { class: "dish-group", text: label }), el("div", { class: "dish-rows" }, rows)] : [];
    });

    const intro = on.length === 0
      ? "Nothing's on the menu yet. Open \"Not on the menu\" below and tick the dishes you're making."
      : `${plural(on.length, "dish", "dishes")} on the menu. Press a dish to change it or to see its recipe.`;

    list.replaceChildren(...[
      unfinishedNote(),
      el("p", { class: "subtle", text: intro }),
      groups.length ? el("section", { class: "card dish-list" }, groups) : null,
      offMenuCard(off),
      addDishCard(),
    ].filter(Boolean));
  };

  // The list has no text boxes, so it can always be rebuilt. The pop-up is left alone while the host types in it.
  const refreshList = lazyScreen(list, build);
  subscribe(() => {
    refreshList();
    if (dialog.open && !isTyping(dialog)) rebuildKeepingFocus(dialog, fillDialog);
  });
}
