// Setup screen: guests, dinner time, turkey, then three folded cards for things that rarely change
// (equipment, helper cooks, fine tuning). Each box saves as you type. A blank or impossible number is
// ignored, so the plan keeps its last good value.
import { getPlan, updatePlan, subscribe } from "../state.js";
import { allRecipes } from "./recipebook.js";
import { planEquivalents, suggestedTurkeyLb, withSuggestedBatches } from "../logic/guests.js";
import { MAX_GUESTS, MAX_SLOTS, TURKEY_LB, SETTING_LIMITS, inRange } from "../logic/limits.js";
import { EQUIPMENT_LABELS, newEquipment, newCook, withoutCook, ovenCount } from "../logic/kitchen.js";
import { el, field, readNumber } from "./dom.js";
import { plural } from "./format.js";
import { unfinishedNote } from "./gate.js";
import { offerUndo } from "./undo.js";

// [setting, label, kind of box]
const FINE_TUNING = [
  ["wakeTime", "Earliest start on Thursday", "time"],
  ["readyBufferMin", "Hot dishes ready this many minutes before dinner", "number"],
  ["loadMin", "Minutes to put a dish in the oven", "number"],
  ["unloadMin", "Minutes to take a dish out", "number"],
  ["tempToleranceF", "Dishes can share an oven if their temperatures are this close (F)", "number"],
  ["transitionMin", "Minutes for an oven to change temperature", "number"],
  ["preheatMin", "Minutes to preheat an oven", "number"],
  ["kidFactor", "A child eats this much of an adult's share", "number"],
  ["lbPerPerson", "Pounds of turkey per person", "number"],
  ["thawLbPerDay", "Pounds of turkey that thaw in a day", "number"],
  ["thawBufferDays", "Extra thawing days, to be safe", "number"],
];

function numberInput(value, min = 0, step = "1", max) {
  return el("input", { type: "number", inputmode: "decimal", min, ...(max !== undefined ? { max } : {}), step, value: String(value) });
}

/** After the guest count changes, update "how many to make" for every dish still on the suggested amount. */
function refreshBatches(plan) {
  plan.menu = withSuggestedBatches(plan.menu, planEquivalents(plan), allRecipes());
}

function guestsCard(refresh) {
  const plan = getPlan();
  const adults = numberInput(plan.adults, 0, "1", MAX_GUESTS);
  const kids = numberInput(plan.kids, 0, "1", MAX_GUESTS);
  const dinner = el("input", { type: "time", value: plan.dinnerTime, required: true });

  const onGuests = (key, input) => () => {
    const n = readNumber(input);
    if (n === null || !Number.isInteger(n) || n < 0 || n > MAX_GUESTS) return;
    updatePlan((p) => { p[key] = n; refreshBatches(p); });
    refresh();
  };
  adults.addEventListener("input", onGuests("adults", adults));
  kids.addEventListener("input", onGuests("kids", kids));
  dinner.addEventListener("input", () => { if (dinner.value) updatePlan((p) => { p.dinnerTime = dinner.value; }); });

  return el("div", { class: "card" }, [
    el("h3", { text: "Guests and dinner" }),
    el("div", { class: "fields" }, [field("Adults", adults), field("Children", kids), field("Dinner time", dinner)]),
    el("p", { class: "subtle", "data-note": "guests" }),
  ]);
}

function turkeyCard(refresh) {
  const t = getPlan().turkey;
  const weight = numberInput(t.weightLb, TURKEY_LB.min, "0.5", TURKEY_LB.max);
  const method = el("select", {}, [
    el("option", { value: "per_lb", text: "One steady temperature" }),
    el("option", { value: "step_down", text: "Start hot, then low and slow" }),
  ]);
  method.value = t.method;

  const checkbox = (key, label) => {
    const box = el("input", { type: "checkbox" });
    box.checked = t[key];
    box.addEventListener("change", () => updatePlan((p) => { p.turkey[key] = box.checked; }));
    return el("label", { class: "check" }, [box, el("span", { text: label })]);
  };

  weight.addEventListener("input", () => {
    const n = readNumber(weight);
    if (n === null || !inRange(n, TURKEY_LB.min, TURKEY_LB.max)) return;
    updatePlan((p) => { p.turkey.weightLb = n; });
    refresh();
  });
  method.addEventListener("change", () => updatePlan((p) => { p.turkey.method = method.value; }));

  return el("div", { class: "card" }, [
    el("h3", { text: "Turkey" }),
    el("div", { class: "fields" }, [field("Weight (lb)", weight), field("How you roast it", method)]),
    el("div", { class: "checks" }, [
      checkbox("frozen", "Frozen (needs thawing)"),
      checkbox("stuffed", "Stuffed"),
      checkbox("convection", "Convection oven"),
    ]),
    el("p", { class: "subtle", "data-note": "turkey" }),
  ]);
}

/** A card that opens and closes. The note beside its title shows the answer without opening it. */
function foldCard(title, noteKey, body) {
  return el("details", { class: "card fold" }, [
    el("summary", {}, [el("span", { class: "fold-title", text: title }), el("span", { class: "fold-note", "data-note": noteKey })]),
    ...body,
  ]);
}

function equipmentRow(item, rebuild) {
  const name = el("input", { type: "text", value: item.name, "aria-label": `Name of ${item.name}` });
  const slots = numberInput(item.slots, 0, "1", MAX_SLOTS);
  slots.setAttribute("aria-label", `Space inside ${item.name}`);
  const save = (apply) => updatePlan((p) => { apply(p.equipment.find((e) => e.id === item.id)); });

  name.addEventListener("input", () => { if (name.value.trim()) save((e) => { e.name = name.value; }); });
  slots.addEventListener("input", () => {
    const n = readNumber(slots);
    if (n !== null && Number.isInteger(n) && n >= 0 && n <= MAX_SLOTS) save((e) => { e.slots = n; });
  });
  const remove = el("button", {
    type: "button", class: "danger", text: "Remove", "aria-label": `Remove ${item.name}`,
    // No "are you sure?" box. Undo puts it back in the same place.
    onclick: () => {
      const index = getPlan().equipment.findIndex((e) => e.id === item.id);
      const removed = { ...item };
      updatePlan((p) => { p.equipment = p.equipment.filter((e) => e.id !== item.id); });
      rebuild();
      offerUndo(`Removed ${removed.name}.`, () => {
        updatePlan((p) => { p.equipment.splice(Math.min(index, p.equipment.length), 0, removed); });
        rebuild();
      });
    },
  });
  return el("div", { class: "equipment-row" }, [
    el("span", { class: "badge", text: EQUIPMENT_LABELS[item.type] }),
    field("Name", name), field("Space inside", slots), remove,
  ]);
}

function equipmentCard(refresh) {
  const list = el("div");
  const typeSelect = el("select", { "aria-label": "Kind of equipment to add" },
    Object.entries(EQUIPMENT_LABELS).map(([value, text]) => el("option", { value, text })));

  const rebuild = () => {
    const equipment = getPlan().equipment;
    list.replaceChildren(...equipment.map((e) => equipmentRow(e, rebuild)));
    if (equipment.length === 0) list.append(el("p", { class: "subtle", text: "Nothing here yet. Dishes that need an oven won't fit until you add one." }));
    refresh();
  };
  const add = el("button", {
    type: "button", text: "Add",
    onclick: () => { updatePlan((p) => { p.equipment.push(newEquipment(typeSelect.value, p.equipment)); }); rebuild(); },
  });
  rebuild();
  return foldCard("Ovens and equipment", "equipment", [
    el("p", { class: "subtle", text: "\"Space inside\" is how much fits at once. A full oven is 4. A pie or a pan takes 1 or 2, and the turkey takes all 4." }),
    list,
    el("div", { class: "row" }, [typeSelect, add]),
  ]);
}

function cookRow(cook, index, rebuild) {
  const name = el("input", { type: "text", value: cook.name, "aria-label": index === 0 ? "Your name" : `Name of helper ${index}` });
  name.addEventListener("input", () => {
    if (name.value.trim()) updatePlan((p) => { p.helpers.cooks.find((c) => c.id === cook.id).name = name.value; });
  });
  const remove = index === 0 ? null : el("button", {
    type: "button", class: "danger", text: "Remove", "aria-label": `Remove ${cook.name}`,
    // Their jobs go back to the main cook. Undo brings back the helper and their jobs.
    onclick: () => {
      const before = { helpers: structuredClone(getPlan().helpers), owners: structuredClone(getPlan().owners) };
      updatePlan((p) => Object.assign(p, withoutCook(p.helpers, p.owners, cook.id)));
      rebuild();
      offerUndo(`Removed ${cook.name}. Their jobs went back to ${before.helpers.cooks[0].name}.`, () => {
        updatePlan((p) => Object.assign(p, before));
        rebuild();
      });
    },
  });
  return el("div", { class: "cook-row" }, [field(index === 0 ? "You" : `Helper ${index}`, name), remove].filter(Boolean));
}

function helpersCard(refresh) {
  const body = el("div");
  const toggle = el("input", { type: "checkbox", "aria-label": "I'll have help in the kitchen" });
  toggle.checked = getPlan().helpers.enabled;

  const rebuild = () => {
    const { enabled, cooks } = getPlan().helpers;
    refresh();
    if (!enabled) { body.replaceChildren(); return; }
    body.replaceChildren(
      el("p", { class: "subtle", text: "Choose who makes each dish on the Dishes screen. Each person does one job at a time. The ovens are shared." }),
      ...cooks.map((c, i) => cookRow(c, i, rebuild)),
      el("div", { class: "row" }, [el("button", {
        type: "button", text: "Add a helper",
        onclick: () => { updatePlan((p) => { p.helpers.cooks.push(newCook(p.helpers.cooks)); }); rebuild(); },
      })]),
    );
  };

  toggle.addEventListener("change", () => {
    updatePlan((p) => {
      p.helpers.enabled = toggle.checked;
      // With nobody to help, turning this on would change nothing, so start with one helper.
      if (toggle.checked && p.helpers.cooks.length === 1) p.helpers.cooks.push(newCook(p.helpers.cooks));
    });
    rebuild();
  });
  rebuild();
  return foldCard("Helpers", "helpers", [
    el("label", { class: "check" }, [toggle, el("span", { text: "I'll have help in the kitchen" })]),
    body,
  ]);
}

function fineTuningCard(refresh) {
  const settings = getPlan().settings;
  const fields = FINE_TUNING.map(([key, label, type]) => {
    if (type === "time") {
      const input = el("input", { type: "time", value: settings[key] });
      input.addEventListener("input", () => { if (input.value) updatePlan((p) => { p.settings[key] = input.value; }); });
      return field(label, input);
    }
    const [min, max] = SETTING_LIMITS[key];
    const input = numberInput(settings[key], min, "any", max);
    input.addEventListener("input", () => {
      const n = readNumber(input);
      if (n === null || !inRange(n, min, max)) return;
      updatePlan((p) => { p.settings[key] = n; if (key === "kidFactor") refreshBatches(p); });
      refresh();
    });
    return field(label, input);
  });
  return foldCard("Fine tuning", "tuning", [el("div", { class: "fields" }, fields)]);
}

/** Fill in the short notes: under the guests and turkey cards, and beside the folded cards' titles. */
function updateNotes(container) {
  const plan = getPlan();
  const suggested = suggestedTurkeyLb(planEquivalents(plan), plan.settings.lbPerPerson);
  const others = plan.equipment.length - ovenCount(plan);
  const notes = {
    guests: `Plan food for the equivalent of about ${planEquivalents(plan)} adults.`,
    turkey: `For your guests, about ${suggested} lb is a good size.${plan.turkey.weightLb < suggested ? ` Yours is ${plan.turkey.weightLb} lb.` : ""}`,
    equipment: `${plural(ovenCount(plan), "oven")}${others > 0 ? ` and ${others} other` : ""}`,
    helpers: plan.helpers.enabled ? plural(plan.helpers.cooks.length - 1, "helper") : "just you",
    tuning: "most people can skip this",
  };
  for (const [key, text] of Object.entries(notes)) {
    const node = container.querySelector(`[data-note="${key}"]`);
    if (node) node.textContent = text;
  }
}

/** Build the Setup screen into `container`. */
export function mountSetup(container) {
  const screen = container.closest(".screen");
  const noteBox = el("div");
  let stale = true; // the boxes on screen no longer match the plan (it changed while this screen was hidden)

  const refresh = () => {
    updateNotes(container);
    noteBox.replaceChildren(...[unfinishedNote()].filter(Boolean));
  };
  const build = () => {
    stale = false;
    // Two columns on a laptop (everyday answers | things you rarely change), one on a phone.
    container.replaceChildren(
      noteBox,
      el("div", { class: "setup-grid" }, [
        el("div", {}, [guestsCard(refresh), turkeyCard(refresh)]),
        el("div", {}, [equipmentCard(refresh), helpersCard(refresh), fineTuningCard(refresh)]),
      ]),
    );
    refresh();
  };

  // While this screen is open its own boxes make the changes, so only the notes need refreshing. A rebuild would
  // interrupt typing. When another screen changes the plan (the questions, an import), rebuild on the way back in.
  subscribe((kind) => {
    if (screen.hidden) { stale = true; return; }
    if (kind === "replace") build();
    else refresh();
  });
  document.addEventListener("screenshown", (event) => { if (event.detail === "setup" && stale) build(); });
}
