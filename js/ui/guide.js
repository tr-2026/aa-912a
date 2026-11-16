// The questions asked on first use: a welcome, five short steps (guests, turkey, kitchen, menu, check) and a
// "ready" screen. One question per screen. Answers are saved as you go, and nothing is made until the host
// presses "Make my plan" on the last step.
import { getPlan, updatePlan, subscribe } from "../state.js";
import { allRecipes } from "./recipebook.js";
import { ingredients } from "../seed/ingredients.js";
import { buildGroceryList } from "../logic/grocery.js";
import { listItemCount } from "../logic/listtext.js";
import { datedChecklistItems } from "../logic/thaw.js";
import { planEquivalents, suggestedTurkeyLb, withSuggestedBatches } from "../logic/guests.js";
import { GUIDE_STEPS, NUMBERED_STEPS, STEP_TITLES, stepProblem } from "../logic/guide.js";
import { cookedHere, setGuestBringing } from "../logic/dishes.js";
import { openAddDish } from "./adddish.js";
import {
  OVEN_CHOICES, HELPER_CHOICES, APPLIANCE_TYPES, EQUIPMENT_LABELS,
  ovenCount, helperCount, applianceTypes, setAppliance, withOvenCount, withHelperCount, scrubOwners,
} from "../logic/kitchen.js";
import { listRisks } from "../logic/risks.js";
import { readiness } from "../logic/readiness.js";
import { formatTime, toMinutes, thanksgivingDate } from "../logic/time.js";
import { MAX_GUESTS, TURKEY_LB } from "../logic/limits.js";
import { el, listWithMore } from "./dom.js";
import { CATEGORIES, formatDate, plural, guestBadge } from "./format.js";
import { getSchedule } from "./schedulecache.js";
import { riskText } from "./risktext.js";
import { BRAND } from "./brand.js";

const SESSION_KEY = "birdbrain:guide-step";
const DINNER_TIMES = ["14:00", "15:00", "16:00", "17:00", "18:00"];
const MAX_RISKS_LISTED = 3;

// ---------- which step we are on ----------

function readStep() {
  try {
    const n = Number(sessionStorage.getItem(SESSION_KEY));
    return Number.isInteger(n) && n >= 0 && n < GUIDE_STEPS.length ? n : 0;
  } catch {
    return 0;
  }
}

function rememberStep(index) {
  try { sessionStorage.setItem(SESSION_KEY, String(index)); } catch { /* private mode: the step is just not remembered */ }
}

let stepIndex = readStep();
let rerender = () => {};

function goTo(index) {
  stepIndex = Math.max(0, Math.min(GUIDE_STEPS.length - 1, index));
  rememberStep(stepIndex);
  rerender();
  window.scrollTo(0, 0);
}

/** Start again from the welcome screen. Answers are kept. */
export function restartGuide() {
  stepIndex = 0;
  rememberStep(0);
  window.location.hash = "guide";
  rerender();
}

// ---------- building blocks ----------

/** A large number box with minus and plus buttons. `onSet` only ever gets a number inside the limits. */
function bigNumber({ label, value, min, max, step = 1, onSet, hint }) {
  const input = el("input", { type: "number", inputmode: step < 1 ? "decimal" : "numeric", min: String(min), max: String(max), step: String(step), value: String(value), "aria-label": label });
  const apply = (n) => {
    if (!Number.isFinite(n) || n < min || n > max) return;
    if (step >= 1 && !Number.isInteger(n)) return;
    onSet(n);
  };
  input.addEventListener("input", () => { if (input.value.trim() !== "") apply(Number(input.value)); });
  const bump = (delta) => {
    const n = Math.min(max, Math.max(min, Math.round((Number(input.value || 0) + delta) * 100) / 100));
    input.value = String(n);
    apply(n);
  };
  return el("div", { class: "big-number" }, [
    el("span", { class: "field-label", text: label }),
    el("div", { class: "big-number-row" }, [
      el("button", { type: "button", class: "step", text: "−", "aria-label": `Fewer: ${label}`, onclick: () => bump(-step) }),
      input,
      el("button", { type: "button", class: "step", text: "+", "aria-label": `More: ${label}`, onclick: () => bump(step) }),
    ]),
    hint ? el("span", { class: "subtle", text: hint }) : null,
  ].filter(Boolean));
}

/** A row of large buttons where exactly one is chosen. */
function choiceRow({ label, options, selected, onPick }) {
  const row = el("div", { class: "choice-row", role: "group", "aria-label": label });
  const draw = (current) => {
    row.replaceChildren(...options.map(([value, text]) => el("button", {
      type: "button", class: "chip choice", text, "aria-pressed": String(value === current),
      onclick: () => { onPick(value); draw(value); },
    })));
  };
  draw(selected);
  return row;
}

/** Buttons for things that can each be on or off, not one-of-many. */
function toggleRow({ label, options, isOn, onToggle }) {
  const row = el("div", { class: "choice-row", role: "group", "aria-label": label });
  const draw = () => {
    row.replaceChildren(...options.map(([value, text]) => el("button", {
      type: "button", class: "chip choice", text, "aria-pressed": String(isOn(value)),
      onclick: () => { onToggle(value, !isOn(value)); draw(); },
    })));
  };
  draw();
  return row;
}

// ---------- the frame around every step ----------

function progress(stepId) {
  if (!NUMBERED_STEPS.includes(stepId)) return null;
  const at = NUMBERED_STEPS.indexOf(stepId);
  return el("div", { class: "guide-progress" }, [
    el("p", { class: "guide-step-label", text: `Step ${at + 1} of ${NUMBERED_STEPS.length}: ${STEP_TITLES[stepId]}` }),
    el("ol", { class: "guide-dots", "aria-hidden": "true" }, NUMBERED_STEPS.map((id, i) =>
      el("li", { class: i < at ? "done" : i === at ? "current" : "" }))),
  ]);
}

/**
 * @param {string} stepId
 * @param {{heading: string, intro?: string, content: Node[], nextLabel?: string, hideBack?: boolean, onNext?: () => void}} step
 */
function frame(stepId, step) {
  const error = el("p", { class: "error guide-error", role: "alert", hidden: true });
  const next = () => {
    const problem = stepProblem(getPlan(), stepId);
    if (problem) { error.textContent = problem; error.hidden = false; return; }
    if (step.onNext) step.onNext();
    else goTo(stepIndex + 1);
  };
  // Back and Next come last and CSS pins them to the bottom of the screen, so they are always in reach.
  const nav = el("div", { class: "guide-nav" }, [
    stepIndex > 0 && !step.hideBack ? el("button", { type: "button", class: "quiet", text: "Back", onclick: () => goTo(stepIndex - 1) }) : null,
    el("button", { type: "button", class: "primary", text: step.nextLabel ?? "Next", onclick: next }),
  ].filter(Boolean));
  return el("div", { class: "guide" }, [
    progress(stepId),
    el("section", { class: "card guide-card" }, [
      el("h3", { id: "guide-heading", tabindex: "-1", text: step.heading }),
      step.intro ? el("p", { class: step.subtitle ? "guide-subtitle" : "guide-intro", text: step.intro }) : null,
      ...step.content,
      error,
      nav,
    ].filter(Boolean)),
  ].filter(Boolean));
}

// ---------- the steps ----------

function welcomeStep() {
  const done = readiness(getPlan()).ready;
  return frame("welcome", {
    heading: `Welcome to ${BRAND}`,
    intro: done
      ? "You've answered these questions before. Your answers are still here, so you can check or change them."
      : "5 minutes to a less stressful Thanksgiving plan",
    subtitle: !done, // a new host sees a tagline under the title; a returning host sees a plain sentence
    content: [
      el("p", { text: "We'll create:" }),
      el("ul", { class: "guide-list" }, [
        el("li", { text: "a shopping list" }),
        el("li", { text: "a list of jobs to do before Thursday" }),
        el("li", { text: "a timed plan for Thanksgiving day" }),
      ]),
      el("p", { text: "Feel free to make adjustments after creating the schedule" }),
      el("div", { class: "guide-links" }, [
        el("button", { type: "button", class: "link", text: "Skip to the last step", onclick: () => goTo(GUIDE_STEPS.indexOf("review")) }),
        el("button", { type: "button", class: "link", text: "Open a saved copy of my plan", onclick: () => { window.location.hash = "notes"; } }),
      ]),
    ],
    nextLabel: done ? "Check my answers" : "Start",
    hideBack: true,
  });
}

function guestsStep() {
  const plan = getPlan();
  const total = el("p", { class: "guide-live", role: "status" });
  const showTotal = () => { total.textContent = `Plan food for the equivalent of about ${planEquivalents(getPlan())} adults.`; };
  const setGuests = (change) => {
    updatePlan((p) => { Object.assign(p, change); p.menu = withSuggestedBatches(p.menu, planEquivalents(p), allRecipes()); });
    showTotal();
  };

  const dinner = el("input", { type: "time", value: plan.dinnerTime, "aria-label": "Dinner time" });
  const times = el("div", { class: "choice-row", role: "group", "aria-label": "Common dinner times" });
  const drawTimes = () => times.replaceChildren(...DINNER_TIMES.map((t) => el("button", {
    type: "button", class: "chip choice", text: formatTime(toMinutes(t)), "aria-pressed": String(getPlan().dinnerTime === t),
    onclick: () => { updatePlan((p) => { p.dinnerTime = t; }); dinner.value = t; drawTimes(); },
  })));
  dinner.addEventListener("input", () => { if (dinner.value) { updatePlan((p) => { p.dinnerTime = dinner.value; }); drawTimes(); } });
  drawTimes();
  showTotal();

  return frame("guests", {
    heading: "Who's coming?",
    content: [
      el("div", { class: "guide-pair" }, [
        bigNumber({ label: "Adults", value: plan.adults, min: 0, max: MAX_GUESTS, onSet: (n) => setGuests({ adults: n }) }),
        bigNumber({ label: "Children", value: plan.kids, min: 0, max: MAX_GUESTS, onSet: (n) => setGuests({ kids: n }), hint: "Under about 12" }),
      ]),
      total,
      el("div", { class: "guide-block" }, [
        el("span", { class: "field-label", text: "What time will you eat?" }),
        times,
        el("label", { class: "guide-time" }, [el("span", { class: "subtle", text: "Or another time: " }), dinner]),
      ]),
    ],
  });
}

/** The dates the turkey answers lead to, earliest first: when to order it and, if it is frozen, when to thaw it. */
function showTurkeyDates(box) {
  const plan = getPlan();
  const items = datedChecklistItems(plan, allRecipes()).filter((i) => i.dishId === "turkey");
  const find = (stepId) => items.find((i) => i.stepId === stepId);
  const lines = [];
  if (find("order")) lines.push(`Order by ${formatDate(find("order").date)}`);
  if (find("thaw")) lines.push(`Move the turkey from the freezer to the fridge on ${formatDate(find("thaw").date)}. A ${plan.turkey.weightLb} lb turkey takes about ${-find("thaw").dayOffset} days to thaw.`);
  if (lines.length === 0) lines.push("The turkey isn't on your menu, so there are no dates.");
  box.replaceChildren(el("h4", { text: "Reminders:" }), ...lines.map((l) => el("p", { text: l })));
}

function turkeyStep() {
  const plan = getPlan();
  const suggested = suggestedTurkeyLb(planEquivalents(plan), plan.settings.lbPerPerson);
  const dates = el("div", { class: "guide-callout" });
  const set = (change) => { updatePlan((p) => { Object.assign(p.turkey, change); }); showTurkeyDates(dates); };

  const weight = bigNumber({ label: "Turkey weight in pounds", value: plan.turkey.weightLb, min: TURKEY_LB.min, max: TURKEY_LB.max, step: 0.5, onSet: (n) => set({ weightLb: n }) });
  const useSuggested = el("button", {
    type: "button", class: "chip", text: `Use ${suggested} lb`,
    onclick: () => { set({ weightLb: suggested }); weight.querySelector("input").value = String(suggested); },
  });
  const extras = el("details", { class: "guide-fold" }, [
    el("summary", { text: "More about how you cook it" }),
    el("div", { class: "checks" }, [["stuffed", "Stuffing is cooked inside the turkey"], ["convection", "I use a convection (fan) oven"]].map(([key, text]) => {
      const box = el("input", { type: "checkbox", "aria-label": text });
      box.checked = plan.turkey[key];
      box.addEventListener("change", () => set({ [key]: box.checked }));
      return el("label", { class: "check" }, [box, el("span", { text })]);
    })),
  ]);
  showTurkeyDates(dates);

  return frame("turkey", {
    heading: "Your turkey",
    intro: "We use this to work out when to thaw it and when it goes in the oven.",
    content: [
      weight,
      el("p", { class: "subtle" }, [`For your guests, about ${suggested} lb is a good size. Enter the size you have, or plan to buy. `, useSuggested]),
      el("div", { class: "guide-block" }, [
        el("span", { class: "field-label", text: "Is it frozen or fresh?" }),
        choiceRow({ label: "Frozen or fresh", selected: plan.turkey.frozen ? "frozen" : "fresh", options: [["frozen", "Frozen"], ["fresh", "Fresh"]], onPick: (v) => set({ frozen: v === "frozen" }) }),
      ]),
      extras,
      dates,
    ],
  });
}

function kitchenStep() {
  const plan = getPlan();
  const helperBox = el("div", { class: "guide-block" });
  const setHelpers = (n) => updatePlan((p) => {
    p.helpers = withHelperCount(p.helpers, n);
    p.owners = scrubOwners(p.owners, p.helpers.cooks.map((c) => c.id));
  });
  const drawHelpers = () => {
    const p = getPlan();
    const count = helperCount(p);
    if (count === 0) { helperBox.replaceChildren(); return; }
    helperBox.replaceChildren(
      el("span", { class: "field-label", text: "How many helpers?" }),
      choiceRow({ label: "How many helpers", selected: count, options: HELPER_CHOICES.map((n) => [n, String(n)]), onPick: (n) => { setHelpers(n); drawHelpers(); } }),
      el("div", { class: "guide-names" }, p.helpers.cooks.slice(1).map((cook, i) => {
        const name = el("input", { type: "text", value: cook.name, "aria-label": `Name of helper ${i + 1}` });
        name.addEventListener("input", () => { if (name.value.trim()) updatePlan((q) => { q.helpers.cooks.find((c) => c.id === cook.id).name = name.value; }); });
        return el("label", { class: "field" }, [el("span", { class: "field-label", text: `Name of helper ${i + 1}` }), name]);
      })),
      el("p", { class: "subtle", text: "Later, on the Dishes screen, you can choose who makes each dish." }),
    );
  };
  drawHelpers();

  return frame("kitchen", {
    heading: "Your kitchen",
    intro: "Thanksgiving dinners are big, so the number of ovens at your disposal matters.",
    content: [
      el("div", { class: "guide-block" }, [
        el("span", { class: "field-label", text: "How many ovens can you use?" }),
        choiceRow({ label: "Number of ovens", selected: ovenCount(plan), options: OVEN_CHOICES.map((n) => [n, String(n)]), onPick: (n) => updatePlan((p) => { p.equipment = withOvenCount(p.equipment, n); }) }),
      ]),
      el("div", { class: "guide-block" }, [
        el("span", { class: "field-label", text: "Any other appliances you can use?" }),
        toggleRow({
          label: "Other appliances", options: APPLIANCE_TYPES.map((t) => [t, EQUIPMENT_LABELS[t]]),
          isOn: (type) => applianceTypes(getPlan()).includes(type),
          onToggle: (type, on) => updatePlan((p) => setAppliance(p, type, on)),
        }),
        el("p", { class: "subtle", text: "If the oven gets too full, we'll suggest cooking a dish in one of these." }),
      ]),
      el("div", { class: "guide-block" }, [
        el("span", { class: "field-label", text: "Will anyone help you cook on Thursday?" }),
        choiceRow({
          label: "Help in the kitchen", selected: helperCount(plan) > 0 ? "help" : "alone",
          options: [["alone", "No, just me"], ["help", "Yes"]],
          onPick: (v) => { setHelpers(v === "help" ? Math.max(1, helperCount(getPlan())) : 0); drawHelpers(); },
        }),
      ]),
      helperBox,
    ],
  });
}

function menuStep() {
  const plan = getPlan();
  const total = el("p", { class: "guide-live", role: "status" });
  const groupNotes = []; // "3 of 8" beside each section's title
  const guestBadges = []; // the "Brought by a guest" tag beside a dish's name, shown while a guest brings it
  const showCounts = () => {
    const menu = getPlan().menu;
    for (const { badge, recipeId } of guestBadges) {
      const line = menu.find((m) => m.recipeId === recipeId);
      badge.hidden = !(line && line.included && !cookedHere(line));
    }
    const fromGuests = menu.filter((m) => m.included && !cookedHere(m)).length;
    total.textContent = `${plural(menu.filter((m) => m.included).length, "dish", "dishes")} chosen.${fromGuests > 0 ? ` Guests are bringing ${fromGuests}.` : ""}`;
    guestNote.textContent = fromGuests > 0 ? `${fromGuests} chosen` : "";
    for (const { note, category } of groupNotes) {
      const inSection = menu.filter((m) => allRecipes()[m.recipeId].category === category);
      note.textContent = `${inSection.filter((m) => m.included).length} of ${inSection.length}`;
    }
  };
  // Every group starts open, on a phone too, so the whole list of dishes is in front of the host.
  const groups = CATEGORIES.map(([category, label]) => {
    const items = plan.menu.filter((m) => allRecipes()[m.recipeId].category === category);
    if (items.length === 0) return null;
    const note = el("span", { class: "fold-note" });
    groupNotes.push({ note, category });
    const section = el("details", { class: "guide-menu-group" }, [
      el("summary", {}, [el("span", { class: "fold-title", text: label }), note]),
      ...items.map((m) => {
        const recipe = allRecipes()[m.recipeId];
        const box = el("input", { type: "checkbox", "aria-label": recipe.name });
        box.checked = m.included;
        box.addEventListener("change", () => {
          // A dish that comes off the menu is no longer a guest's dish either, so ticking it again starts fresh.
          updatePlan((p) => { const line = p.menu.find((x) => x.recipeId === m.recipeId); line.included = box.checked; if (!box.checked) setGuestBringing(line, recipe, false); });
          drawGuests();
          showCounts();
        });
        const badge = guestBadge();
        guestBadges.push({ badge, recipeId: m.recipeId });
        return el("label", { class: "check" }, [box, el("span", { text: recipe.name }), badge]);
      }),
    ]);
    section.open = true;
    return section;
  }).filter(Boolean);

  // One question at the end instead of a button on every row: most hosts cook everything and never open it.
  const guestList = el("div", { class: "off-grid" });
  const guestNote = el("span", { class: "fold-note" });
  const drawGuests = () => {
    guestList.replaceChildren(...getPlan().menu.filter((m) => m.included).map((m) => {
      const recipe = allRecipes()[m.recipeId];
      const box = el("input", { type: "checkbox", "aria-label": `A guest is bringing ${recipe.name}` });
      box.checked = !cookedHere(m);
      box.addEventListener("change", () => {
        updatePlan((p) => setGuestBringing(p.menu.find((x) => x.recipeId === m.recipeId), recipe, box.checked));
        showCounts();
      });
      return el("label", { class: "check" }, [box, el("span", { text: recipe.name })]);
    }));
  };
  drawGuests();
  const guestFold = el("details", { class: "guide-fold" }, [
    el("summary", {}, [el("span", { text: "Is a guest bringing any of these?" }), guestNote]),
    el("p", { class: "subtle", text: "Tick the dishes a guest is bringing. You won't cook or shop for them." }),
    guestList,
  ]);
  showCounts();

  return frame("menu", {
    heading: "What's on the menu?",
    intro: "Tick everything that will be on the table. If a guest is bringing something, you can say so at the bottom.",
    content: [
      total,
      el("div", { class: "guide-menu" }, groups),
      guestFold,
      el("div", { class: "row" }, [el("button", {
        type: "button", class: "guide-bar", text: "Add a dish that isn't listed",
        // The page keeps its place: the step is redrawn so the new dish shows in its group.
        onclick: () => openAddDish(() => { const y = window.scrollY; rerender(); window.scrollTo(0, y); }),
      })]),
    ],
  });
}

/** "17 dishes" or "17 dishes, 2 brought by guests". */
function menuSummary(plan) {
  const chosen = plan.menu.filter((m) => m.included);
  const fromGuests = chosen.filter((m) => !cookedHere(m)).length;
  return `${plural(chosen.length, "dish", "dishes")}${fromGuests > 0 ? `, ${fromGuests} brought by guests` : ""}`;
}

function reviewStep() {
  const plan = getPlan();
  const schedule = getSchedule(plan);
  const list = buildGroceryList(plan, allRecipes(), ingredients);
  const risks = listRisks(schedule);
  const helpers = helperCount(plan);

  const answers = [
    ["Guests", `${plural(plan.adults, "adult")} and ${plural(plan.kids, "child", "children")}`, "guests"],
    ["Dinner", formatTime(toMinutes(plan.dinnerTime)), "guests"],
    ["Turkey", `${plan.turkey.weightLb} lb, ${plan.turkey.frozen ? "frozen" : "fresh"}`, "turkey"],
    ["Kitchen", `${[plural(ovenCount(plan), "oven"), ...applianceTypes(plan).map((t) => EQUIPMENT_LABELS[t].toLowerCase())].join(", ")}, ${helpers > 0 ? `you and ${plural(helpers, "helper")}` : "just you"}`, "kitchen"],
    ["Menu", menuSummary(plan), "menu"],
  ];
  const summary = el("dl", { class: "guide-summary" }, answers.flatMap(([label, value, step]) => [
    el("dt", { text: label }),
    el("dd", {}, [el("span", { text: value }), el("button", { type: "button", class: "link", text: "Change", "aria-label": `Change ${label.toLowerCase()}`, onclick: () => goTo(GUIDE_STEPS.indexOf(step)) })]),
  ]));

  const t = thanksgivingDate(plan.year);
  const firstTrip = new Date(t.getFullYear(), t.getMonth(), t.getDate() - 7);
  const firstJob = schedule.checklist[0];
  const firstTask = schedule.thursday[0];
  const youGet = [
    `A shopping list of ${listItemCount(list)} items. Plan your first trip for about ${formatDate(firstTrip)}.`,
    firstJob ? `${plural(schedule.checklist.length, "job")} to do before Thursday. The first is on ${formatDate(firstJob.date)}.` : null,
    firstTask ? `A plan for Thursday that starts at ${formatTime(firstTask.start)}, with dinner at ${formatTime(toMinutes(plan.dinnerTime))}.` : null,
  ].filter(Boolean);

  const check = risks.length === 0
    ? el("div", { class: "guide-callout good" }, [el("h4", { text: "Everything fits" }), el("p", { text: "Your ovens and your time are enough for this menu." })])
    : el("div", { class: "guide-callout" }, [
      el("h4", { text: risks.length === 1 ? "One thing to check" : `${risks.length} things to check` }),
      ...listWithMore(risks, MAX_RISKS_LISTED, (r) => el("li", { text: riskText(r, plan) })),
      el("p", { text: "This often happens with a big menu. We'll recommend fixes for each one." }),
    ].filter(Boolean));

  return frame("review", {
    heading: "Check your answers",
    content: [summary, el("div", { class: "guide-block" }, [el("h4", { text: "What you'll get" }), el("ul", {}, youGet.map((l) => el("li", { text: l })))]), check],
    nextLabel: "Make my plan",
    onNext: () => { updatePlan((p) => { p.confirmed.people = true; p.confirmed.menu = true; }); goTo(GUIDE_STEPS.indexOf("ready")); },
  });
}

function readyStep() {
  const plan = getPlan();
  const risks = listRisks(getSchedule(plan));
  const items = listItemCount(buildGroceryList(plan, allRecipes(), ingredients));
  const tile = (title, text, label, hash) => el("div", { class: "card guide-tile" }, [
    el("h4", { text: title }), el("p", { text }),
    el("button", { type: "button", text: label, onclick: () => { window.location.hash = hash; } }),
  ]);
  return frame("ready", {
    heading: "Your plan is ready",
    content: [
      el("div", { class: "guide-tiles" }, [
        tile("Shopping list", `${plural(items, "item")}, sorted by store and by when to buy.`, "See the shopping list", "shopping"),
        tile("Schedule", risks.length ? `Your jobs before Thursday and your plan for the day. ${plural(risks.length, "thing")} to check.` : "Your jobs before Thursday and your plan for the day.", "See the schedule", "schedule"),
      ]),
      el("p", { text: "On Thanksgiving day, open the Cook screen. It shows one job at a time with a timer." }),
      el("p", { text: "Your plan is saved on this device. To keep a spare copy, go to Notes and press \"Save a copy.\"" }),
      el("div", { class: "guide-links" }, [
        el("button", { type: "button", class: "link", text: "Go through the questions again", onclick: restartGuide }),
      ]),
    ],
    nextLabel: "See the schedule",
    hideBack: true,
    onNext: () => { window.location.hash = "schedule"; },
  });
}

const STEP_BUILDERS = { welcome: welcomeStep, guests: guestsStep, turkey: turkeyStep, kitchen: kitchenStep, menu: menuStep, review: reviewStep, ready: readyStep };

/** Build the questions into `container`. */
export function mountGuide(container) {
  const body = el("div");
  container.append(body);

  rerender = () => {
    // "Your plan is ready" must never show for a plan that is not confirmed (after a reset, for example).
    if (GUIDE_STEPS[stepIndex] === "ready" && !readiness(getPlan()).ready) stepIndex = 0;
    body.replaceChildren(STEP_BUILDERS[GUIDE_STEPS[stepIndex]]());
    body.querySelector("#guide-heading")?.focus({ preventScroll: true }); // a screen reader then reads the new question
  };
  document.addEventListener("screenshown", (event) => { if (event.detail === "guide") rerender(); });
  // Opening a saved copy or starting over begins the questions again from the welcome.
  subscribe((kind) => { if (kind === "replace") { stepIndex = 0; rememberStep(0); } });
}
