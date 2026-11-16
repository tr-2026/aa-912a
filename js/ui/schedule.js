// Schedule screen, in tabs: Before Thursday (jobs to tick off), Thursday (the timed plan), Appliance snapshot and, with
// helpers, Cooking responsibilities. Things to check sit in one box above the tabs. Printing shows every tab (print.css).
import { getPlan, updatePlan, subscribe } from "../state.js";
import { allRecipes } from "./recipebook.js";
import { CONFLICT } from "../logic/scheduler.js";
import { getSchedule } from "./schedulecache.js";
import { formatTime, toMinutes, thanksgivingDate } from "../logic/time.js";
import { isThanksgiving } from "../logic/home.js";
import { cookName, helpersOn, mainCookId } from "../logic/owners.js";
import { ingredients } from "../seed/ingredients.js";
import { findHoldFix } from "../logic/autofix.js";
import { startChoices } from "../logic/startfix.js";
import { saveDatesFile } from "./calendarfile.js";
import { applianceOptions, EQUIPMENT_LABELS } from "../logic/kitchen.js";
import { setGuestBringing } from "../logic/dishes.js";
import { offerUndo } from "./undo.js";
import { scheduleKey } from "../logic/schedulekey.js";
import { el, lazyScreen, rebuildKeepingFocus } from "./dom.js";
import { dishName, formatDate, plural, speak } from "./format.js";
import { showStepDetail } from "./stepdetail.js";
import { busyText, conflictText } from "./risktext.js";
import { holdControl, hasHoldTime } from "./holdcontrol.js";
import { gateCard } from "./gate.js";
import { makeTabs } from "./tabs.js";
import { personSheet } from "../logic/personsheet.js";
import { BRAND } from "./brand.js";

const CONFLICT_WAKE = CONFLICT.wake.reason;
const range = (e) => `${formatTime(e.start)} to ${formatTime(e.end)}`;

// The screen is rebuilt after every change, so the host's choices are remembered here.
let selectedTab = null; // null = not chosen yet: "Before Thursday" until the day itself, then "Thursday"
let risksOpen = false;  // "Things to check" starts folded, so the schedule itself is the first thing seen

// The "things to check" button in the header and "Show me" on a notice ask to see the list, so they unfold it.
document.addEventListener("showrisks", () => {
  risksOpen = true;
  for (const details of document.querySelectorAll("details.risks")) details.open = true;
});
let fixOffer = null;    // the answer from "Find a fix for me", and the plan it was worked out for

/**
 * "Find a fix for me": works out the smallest longer waits that let more dishes fit, shows them, and changes
 * nothing until the host presses "Use these". The offer is dropped as soon as the plan changes some other way.
 */
function fixSection(plan, redraw) {
  const key = scheduleKey(plan);
  if (fixOffer && fixOffer.key !== key) fixOffer = null;
  if (!fixOffer) {
    return el("div", { class: "fix-offer print-hide" }, [el("button", {
      type: "button", text: "Find a fix for me", "data-focus": "fix:find",
      onclick: () => { fixOffer = { key, ...findHoldFix(plan, allRecipes(), ingredients) }; redraw(); },
    })]);
  }
  const forget = () => { fixOffer = null; redraw(); };
  if (fixOffer.changes.length === 0) {
    return el("div", { class: "fix-offer print-hide" }, [
      el("p", { text: "Letting dishes wait longer doesn't solve this. Try one of the ideas under each dish." }),
      el("button", { type: "button", class: "link", text: "OK", "data-focus": "fix:ok", onclick: forget }),
    ]);
  }
  const fixed = fixOffer.before - fixOffer.after;
  const { changes } = fixOffer;
  return el("div", { class: "fix-offer print-hide" }, [
    el("p", { class: "fix-title", text: `This would make ${plural(fixed, "more dish", "more dishes")} fit${fixOffer.after ? `, with ${fixOffer.after} still left out` : ""}:` }),
    el("ul", {}, changes.map((c) => el("li", { text: `Let ${dishName(c.dishId)} wait, covered, for up to ${c.to} minutes. It's ${c.from} now.` }))),
    el("p", { class: "subtle", text: "A dish that waits is made earlier and kept covered. Keep hot dishes somewhere warm." }),
    el("div", { class: "row" }, [
      el("button", { type: "button", text: "Use these", "data-focus": "fix:use", onclick: () => { fixOffer = null; updatePlan((p) => { for (const c of changes) p.holds[c.dishId] = c.to; }); } }),
      el("button", { type: "button", class: "link", text: "No thanks", "data-focus": "fix:no", onclick: forget }),
    ]),
  ]);
}

/** True when this entry points at a real seed step the host can open (thaw and order items have none). */
const hasStep = (dishId, stepId) => !!allRecipes()[dishId]?.steps.some((s) => s.id === stepId);

/** A small "Ann" badge saying who does a task. A job with no badge is the host's own, so "Me" is never shown alone. */
function ownerBadge(plan, owners) {
  if (!helpersOn(plan) || !owners || owners.every((id) => id === mainCookId(plan))) return null;
  return el("span", { class: "badge owner", text: owners.map((id) => cookName(plan, id)).join(" + ") });
}

/**
 * "Things to check", in one box that opens and closes. A dish that does not fit is NOT on the plan below, so it is
 * shown in red. A cook with no break is shown in amber.
 */
function risksSection(schedule, plan, redraw) {
  const { conflicts, warnings } = schedule;
  const total = conflicts.length + warnings.length;
  if (total === 0) return null;
  const missing = conflicts.filter((c) => !c.placed).length;
  const item = (cls, titleClass, title, suggestions, extras = []) => el("div", { class: cls }, [
    el("p", { class: titleClass, text: title }),
    el("ul", {}, suggestions.map((s) => el("li", { text: s }))),
    ...extras,
  ]);
  // Letting a dish sit longer means it can be made earlier, which often makes it fit. That does not help a dish
  // that already starts too early.
  const holdFix = (c) => {
    const recipe = allRecipes()[c.dishId];
    if (!recipe || !hasHoldTime(recipe) || c.reason === CONFLICT_WAKE) return null;
    return el("div", { class: "hold-fix" }, [el("p", { class: "subtle", text: "If this dish can wait safely, let it sit covered longer:" }), holdControl(recipe)]);
  };

  // When the oven is the problem and the host has an air fryer or slow cooker, offer to move the dish there.
  const moveFix = (c) => {
    if (c.placed || (c.reason !== CONFLICT.slots.reason && c.reason !== CONFLICT.temp.reason)) return null;
    const recipe = allRecipes()[c.dishId];
    const options = recipe ? applianceOptions(plan, recipe) : [];
    if (options.length === 0) return null;
    return el("div", { class: "hold-fix" }, [
      el("p", { class: "subtle", text: "To free up the oven:" }),
      el("div", { class: "row" }, options.map((type) => el("button", {
        type: "button", class: "quiet", text: `Cook it in the ${EQUIPMENT_LABELS[type].toLowerCase()}`, "data-focus": `move:${c.dishId}:${type}`,
        onclick: () => {
          updatePlan((p) => { p.cookWith[c.dishId] = type; });
          offerUndo(`${dishName(c.dishId)} will cook in the ${EQUIPMENT_LABELS[type].toLowerCase()}.`, () => updatePlan((p) => { delete p.cookWith[c.dishId]; }));
        },
      }))),
    ]);
  };
  // The same choice as "A guest is bringing this" on the Dishes screen, here as one press. Undo puts the dish back.
  const guestFix = (c) => {
    if (c.placed) return null;
    return el("div", { class: "hold-fix" }, [
      el("p", { class: "subtle", text: "Or let someone else make it:" }),
      el("div", { class: "row" }, [el("button", {
        type: "button", class: "quiet", text: "A guest will bring it", "data-focus": `guest:${c.dishId}`,
        onclick: () => {
          updatePlan((p) => setGuestBringing(p.menu.find((m) => m.recipeId === c.dishId), allRecipes()[c.dishId], true));
          offerUndo(`A guest will bring ${dishName(c.dishId)}.`, () => updatePlan((p) => setGuestBringing(p.menu.find((m) => m.recipeId === c.dishId), allRecipes()[c.dishId], false)));
        },
      })]),
    ]);
  };
  // A dish that would have to start too early: say what time that is, and offer the changes that would let it fit.
  const startFix = (c) => {
    if (c.placed || c.reason !== CONFLICT_WAKE) return null;
    const found = startChoices(plan, allRecipes(), ingredients, c.dishId);
    if (!found) return null;
    const name = dishName(c.dishId);
    const choice = (label, focus, apply, done) => el("button", {
      type: "button", class: "quiet", text: label, "data-focus": `start:${c.dishId}:${focus}`,
      onclick: () => {
        const before = JSON.parse(JSON.stringify({ dinnerTime: plan.dinnerTime, wakeTime: plan.settings.wakeTime, stuffed: plan.turkey.stuffed }));
        updatePlan(apply);
        offerUndo(done, () => updatePlan((p) => { p.dinnerTime = before.dinnerTime; p.settings.wakeTime = before.wakeTime; p.turkey.stuffed = before.stuffed; }));
      },
    });
    const buttons = found.options.map((o) => {
      if (o.kind === "wake") {
        const at = formatTime(toMinutes(o.wakeTime));
        return choice(`Start my day at ${at}`, "wake", (p) => { p.settings.wakeTime = o.wakeTime; }, `Your day now starts at ${at}.`);
      }
      if (o.kind === "dinner") {
        const at = formatTime(toMinutes(o.dinnerTime));
        return choice(`Eat at ${at} instead`, "dinner", (p) => { p.dinnerTime = o.dinnerTime; }, `Dinner is now at ${at}.`);
      }
      return choice("Bake the stuffing outside the turkey", "unstuffed", (p) => { p.turkey.stuffed = false; }, "The turkey is now roasted without stuffing inside.");
    });
    return el("div", { class: "hold-fix" }, [
      el("p", { text: `${name} would have to start at ${formatTime(found.needStart)}. Your earliest start time is ${formatTime(found.wake)}.` }),
      buttons.length ? el("p", { class: "subtle", text: "Choose one of these to make it fit:" }) : null,
      buttons.length ? el("div", { class: "row" }, buttons) : null,
    ].filter(Boolean));
  };
  const fixesFor = (c) => [startFix(c), moveFix(c), holdFix(c), guestFix(c)].filter(Boolean);

  const details = el("details", { class: `risks${missing ? " has-conflicts" : ""}`, role: missing ? "alert" : "status" }, [
    el("summary", { text: `${plural(total, "thing")} to check${missing ? ` (${plural(missing, "dish doesn't", "dishes don't")} fit yet)` : ""}` }),
    el("p", { class: "subtle", text: "Please look at these before Thursday. Under each one we recommend ways to fix it." }),
    missing > 0 ? fixSection(plan, redraw) : null,
    ...conflicts.map((c) => item("conflict", "conflict-title", conflictText(c), c.suggestions, fixesFor(c))),
    ...warnings.map((w) => item("warning", "warning-title", busyText(w, plan), w.suggestions)),
  ].filter(Boolean));
  details.open = risksOpen;
  details.addEventListener("toggle", () => { risksOpen = details.open; });
  return details;
}

/** Each person's jobs (only with helpers): what they do before Thursday and on the day. */
function peopleSection(schedule, plan, openStep, onPrint) {
  const people = plan.helpers.cooks.map((cook) => {
    const { ahead, thursday: mine, handsOnMin: minutes } = personSheet(schedule, plan, cook.id);
    const whose = speak(plan, cook.id).possessive;
    return el("div", { class: "person" }, [
      el("div", { class: "row between" }, [
        el("h4", { text: `${cook.name}: ${minutes} minutes of work on Thursday` }),
        el("button", { type: "button", class: "quiet print-hide", text: `Print ${whose} page`, "aria-label": `Print a page with only ${whose} jobs`, onclick: () => onPrint(cook.id) }),
      ]),
      ahead.length ? el("p", { class: "subtle", text: `Before Thursday: ${ahead.map((c) => c.label).join(", ")}` }) : null,
      mine.length
        ? el("ul", { class: "timeline" }, mine.map((e) => dayRow(e, plan, openStep, false))) // the heading already says whose jobs these are
        : el("p", { class: "subtle", text: "No jobs on Thursday." }),
    ].filter(Boolean));
  });
  return el("section", { class: "card print-page day" }, [el("h3", { text: "Cooking responsibilities" }), ...people]);
}

/**
 * A page for one person. It is never shown on screen, only printed by "Print Ann's page". It has their jobs
 * before Thursday, their jobs on the day and the reminders for their dishes, in time order.
 */
function personSheetEl(schedule, plan, cook) {
  const sheet = personSheet(schedule, plan, cook.id);
  const whose = speak(plan, cook.id).possessive;
  const t = thanksgivingDate(plan.year);
  const when = t.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric", year: "numeric" });
  const rows = [
    ...sheet.thursday.map((e) => ({ at: e.start, label: e.label, detail: `${range(e)} · ${dishName(e.dishId)}` })),
    ...sheet.reminders.map((r) => ({ at: r.at, label: `Reminder: ${r.text}`, detail: formatTime(r.at) })),
  ].sort((a, b) => a.at - b.at);
  const row = (x) => el("li", { class: "tl" }, [el("span", { class: "tl-time", text: x.detail }), el("span", { class: "tl-body", text: x.label })]);
  return el("section", { class: "person-sheet", "data-person": cook.id }, [
    el("p", { class: "print-title", text: `${BRAND} · ${whose.charAt(0).toUpperCase()}${whose.slice(1)} Thanksgiving` }),
    el("p", { class: "subtle", text: `${when} · dinner at ${formatTime(toMinutes(plan.dinnerTime))} · ${sheet.handsOnMin} minutes of work on Thursday` }),
    el("h3", { text: "Before Thursday" }),
    sheet.ahead.length
      ? el("ul", { class: "timeline" }, sheet.ahead.map((c) => el("li", { class: "tl" }, [
        el("span", { class: "tl-time", text: formatDate(c.date) }), el("span", { class: "tl-body", text: `${c.label} · ${dishName(c.dishId)}` })])))
      : el("p", { class: "subtle", text: "Nothing to do before Thursday." }),
    el("h3", { text: "Thursday" }),
    rows.length ? el("ul", { class: "timeline" }, rows.map(row)) : el("p", { class: "subtle", text: "No jobs on Thursday." }),
  ]);
}

/** Print only one person's page (CSS hides everything else while body has the print-one-person class). */
function printPerson(list, cookId) {
  const sheet = list.querySelector(`.person-sheet[data-person="${cookId}"]`);
  if (!sheet) return;
  sheet.classList.add("printing");
  document.body.classList.add("print-one-person");
  window.addEventListener("afterprint", () => {
    sheet.classList.remove("printing");
    document.body.classList.remove("print-one-person");
  }, { once: true });
  window.print();
}

function checklistRow(item, plan, openStep) {
  const key = `${item.dishId}.${item.stepId}`;
  const box = el("input", { type: "checkbox", "data-focus": `done:${key}`, "aria-label": `Done: ${item.label}` });
  box.checked = !!plan.done[key];
  box.addEventListener("change", () => updatePlan((p) => { if (box.checked) p.done[key] = true; else delete p.done[key]; }));
  const minutes = item.durationMin ? `${item.durationMin} min` : "";
  // The same look as a Thursday line: the job in bold, one grey line of detail, then how to do it.
  const body = el("span", { class: "day-body" }, [
    el("span", { class: "day-title" }, [el("span", { text: item.label }), item.edited ? el("span", { class: "badge edited", text: "changed" }) : null, ownerBadge(plan, item.owners)].filter(Boolean)),
    el("span", { class: "day-detail", text: `${dishName(item.dishId)}${minutes ? ` · ${minutes}` : ""}` }),
    item.instructions !== item.label ? el("span", { class: "day-detail todo-how", text: item.instructions }) : null,
  ].filter(Boolean));
  // Pressing the job opens its step; the tick box beside it stays its own control.
  const main = hasStep(item.dishId, item.stepId)
    ? el("button", { type: "button", class: "todo-open", "data-focus": `step:${key}.${item.dayOffset}`, onclick: () => openStep(item) }, [body, el("span", { class: "day-arrow", "aria-hidden": "true", text: "›" })])
    : el("div", { class: "todo-open" }, [body]);
  return el("li", { class: `todo${box.checked ? " done" : ""}` }, [el("label", { class: "todo-tick" }, [box]), main]);
}

/** Saves a calendar file with the jobs before Thursday, the shopping trips and dinner itself. */
function calendarButton(schedule, plan) {
  const status = el("span", { class: "subtle", role: "status" });
  const save = () => {
    saveDatesFile(plan, schedule);
    status.textContent = "Saved birdbrain-dates.ics. Open that file to put the dates in your calendar.";
  };
  return el("div", { class: "row print-hide" }, [
    el("button", { type: "button", class: "quiet", text: "Add these dates to my calendar", "data-focus": "calendar", onclick: save }),
    status,
  ]);
}

function checklistSection(schedule, plan, openStep) {
  const days = [...new Set(schedule.checklist.map((c) => c.dayOffset))];
  const body = days.length === 0
    ? [el("p", { class: "subtle", text: "Nothing to do before Thursday." })]
    : days.map((d) => {
      const items = schedule.checklist.filter((c) => c.dayOffset === d);
      return el("div", {}, [
        el("h4", { text: formatDate(items[0].date) }),
        el("ul", { class: "items" }, items.map((i) => checklistRow(i, plan, openStep))),
      ]);
    });
  const crowded = days.some((d) => schedule.checklist.filter((c) => c.dayOffset === d).length > 1);
  const orderNote = crowded ? el("p", { class: "subtle", text: "Jobs on the same day are in a good order: the ones that take hours by themselves (soaking, chilling) come first, so they work while you do the rest." }) : null;
  return el("section", { class: "card print-page" }, [el("h3", { text: "Before Thursday" }), orderNote, ...body, calendarButton(schedule, plan)].filter(Boolean));
}

/** "4 dishes will be waiting, covered, at 3:45 PM": the most dishes sitting finished at once, so you can find room. */
function holdingLine(holding) {
  if (holding.length === 0) return null;
  let best = { count: 0, at: 0 };
  for (const h of holding) {
    const count = holding.filter((o) => o.from <= h.from && h.from < o.to).length;
    if (count > best.count) best = { count, at: h.from };
  }
  return el("p", { class: "subtle", text: `${plural(best.count, "dish", "dishes")} will be waiting, covered, at ${formatTime(best.at)}.` });
}

// Things that happen by themselves (roasting, cooling, the bread machine running) are left out of the Thursday list
// until the host asks for them, so the list is only what someone has to do. Printing always shows everything.
let showBackground = false;
const isJob = (entry) => ["hands_on", "load", "unload"].includes(entry.kind);

/**
 * One line of the Thursday list: the start time in a fixed column, then what to do and one grey line of detail.
 * A job says how long it takes; something that runs by itself says when it ends. Facts the title already
 * gives (the dish, the oven, the temperature) are not repeated.
 */
function dayRow(entry, plan, openStep, showOwner = true) {
  if (entry.reminder) {
    return el("li", { class: `tl reminder ${entry.kind}` }, [el("div", { class: "day-line" }, [
      el("span", { class: "tl-time", text: formatTime(entry.at) }),
      el("span", { class: "day-body" }, [el("span", { class: "day-title", text: entry.text })]),
    ])]);
  }
  const where = entry.equipmentId ? plan.equipment.find((e) => e.id === entry.equipmentId)?.name : "";
  const facts = [dishName(entry.dishId), where, entry.tempF ? `${entry.tempF}°F` : ""].filter((f) => f && !entry.label.includes(f));
  const length = isJob(entry) ? `${entry.end - entry.start} min` : `until ${formatTime(entry.end)}`;
  const title = [el("span", { text: entry.label }), entry.edited ? el("span", { class: "badge edited", text: "changed" }) : null, showOwner ? ownerBadge(plan, entry.owners) : null].filter(Boolean);
  const parts = [
    el("span", { class: "tl-time", text: formatTime(entry.start) }),
    el("span", { class: "day-body" }, [el("span", { class: "day-title" }, title), el("span", { class: "day-detail", text: [...facts, length].join(" · ") })]),
  ];
  const cls = `tl ${entry.kind} ${isJob(entry) ? "job" : "background"}`;
  // The whole line opens the step, where its time and temperature can be changed.
  if (!hasStep(entry.dishId, entry.stepId)) return el("li", { class: cls }, [el("div", { class: "day-line" }, parts)]);
  return el("li", { class: cls }, [el("button", {
    type: "button", class: "day-line", "data-focus": `step:${entry.dishId}.${entry.stepId}.${entry.start}.${entry.kind}`, onclick: () => openStep(entry),
  }, [...parts, el("span", { class: "day-arrow", "aria-hidden": "true", text: "›" })])]);
}

function daySection(schedule, plan, openStep, redraw) {
  const all = [
    ...schedule.thursday.map((e) => ({ ...e, sort: e.start, order: 1 })),
    ...schedule.reminders.map((r) => ({ ...r, reminder: true, sort: r.at, order: 0 })),
  ].sort((a, b) => a.sort - b.sort || a.order - b.order);
  const rows = all.filter((r) => showBackground || r.reminder || isJob(r));
  const hidden = all.length - all.filter((r) => r.reminder || isJob(r)).length;

  const box = el("input", { type: "checkbox", "data-focus": "day:background" });
  box.checked = showBackground;
  box.addEventListener("change", () => { showBackground = box.checked; redraw(); });

  return el("section", { class: "card print-page day" }, [
    el("div", { class: "row between" }, [
      el("h3", { text: "Thursday" }),
      el("button", { type: "button", class: "quiet print-hide", text: "Print", onclick: () => window.print() }),
    ]),
    el("p", { class: "subtle", text: "What to do, and when to start it. Press a job to see how, or to change its time." }),
    rows.length ? el("ul", { class: "timeline" }, rows.map((r) => dayRow(r, plan, openStep)))
      : el("p", { class: "subtle", text: "Nothing's planned for Thursday yet." }),
    holdingLine(schedule.holding),
    hidden > 0 ? el("label", { class: "check print-hide" }, [box, el("span", { text: "Also show what cooks, cools or rests by itself" })]) : null,
  ].filter(Boolean));
}

/** One column per piece of equipment. */
function lanesSection(schedule, plan, openStep) {
  const lanes = plan.equipment.map((eq) => {
    const entries = schedule.thursday.filter((e) => e.equipmentId === eq.id);
    return el("div", { class: "lane" }, [
      el("h4", { text: eq.name }),
      entries.length
        ? el("ul", { class: "timeline" }, entries.map((e) => dayRow(e, plan, openStep)))
        : el("p", { class: "subtle", text: "Not used" }),
    ]);
  });
  if (lanes.length === 0) return el("section", { class: "card" }, [el("p", { class: "subtle", text: "You have no ovens yet. Add one on the Setup screen." })]);
  return el("section", { class: "card day" }, [el("h3", { text: "Appliance snapshot" }), el("div", { class: "lanes" }, lanes)]);
}

/** Build the Schedule screen into `container`. */
export function mountSchedule(container) {
  const list = el("div");
  const dialog = el("dialog", { class: "card-dialog", "aria-label": "Step details" });
  container.append(list, dialog);

  // The instruction text does not change when only a time or temperature is edited, so the entry's copy is fine.
  const openStep = (entry) => showStepDetail(dialog, entry.dishId, entry.stepId, entry.instructions);

  const build = () => {
    const plan = getPlan();
    const gate = gateCard("schedule");
    if (gate) { list.replaceChildren(gate); return; }
    let schedule;
    try {
      schedule = getSchedule(plan);
    } catch (err) {
      list.replaceChildren(el("p", { class: "error", role: "alert", text: `Something went wrong making the schedule: ${err.message}` }));
      return;
    }
    const t = thanksgivingDate(plan.year);
    const printTitle = el("p", {
      class: "print-only print-title",
      text: `${BRAND} · Thanksgiving ${t.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric", year: "numeric" })} · dinner at ${formatTime(toMinutes(plan.dinnerTime))}`,
    });

    const tabs = [
      { id: "before", label: "Before Thursday", count: schedule.checklist.length, content: checklistSection(schedule, plan, openStep) },
      { id: "thursday", label: "Thursday", content: daySection(schedule, plan, openStep, () => rebuildKeepingFocus(list, build)) },
      { id: "ovens", label: "Appliance snapshot", content: lanesSection(schedule, plan, openStep), printSkip: true },
    ];
    if (helpersOn(plan)) tabs.push({ id: "people", label: "Cooking responsibilities", content: peopleSection(schedule, plan, openStep, (id) => printPerson(list, id)) });

    // Until Thanksgiving day the useful tab is the list of jobs to do first; on the day it is the timed plan.
    const startTab = isThanksgiving(plan, new Date()) ? "thursday" : "before";
    const { bar, panels } = makeTabs({ tabs, selected: selectedTab ?? startTab, label: "Parts of the schedule", onSelect: (id) => { selectedTab = id; } });
    const sheets = helpersOn(plan) ? plan.helpers.cooks.map((cook) => personSheetEl(schedule, plan, cook)) : [];
    const redraw = () => rebuildKeepingFocus(list, build);
    list.replaceChildren(...[printTitle, risksSection(schedule, plan, redraw), bar, ...panels, ...sheets].filter(Boolean));
  };

  // The printout always shows the whole day, whatever filter is picked on screen.
  let restoreAfterPrint = false;
  window.addEventListener("beforeprint", () => {
    if (showBackground) return;
    restoreAfterPrint = true;
    showBackground = true;
    build();
  });
  window.addEventListener("afterprint", () => {
    if (!restoreAfterPrint) return;
    restoreAfterPrint = false;
    showBackground = false;
    build();
  });

  // Only the list is rebuilt, never the dialog, so typing in the step dialog updates the timeline live.
  subscribe(lazyScreen(list, build));
}
