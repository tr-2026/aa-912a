// Cook screen, for Thanksgiving day: the job to do now with a timer, what comes next, what is late, reminders,
// and big Done buttons. It follows the device clock, or a practice clock started with ?now=HH:MM.
// No sounds and no notifications. The screen stays awake where the browser allows it.
import { getPlan, updatePlan, subscribe } from "../state.js";
import { getSchedule } from "./schedulecache.js";
import { cookView, parseFakeNow } from "../logic/cookmode.js";
import { isThanksgiving } from "../logic/home.js";
import { LATE_CHOICES_MIN, canMoveLater, movedLater } from "../logic/late.js";
import { cookName, helpersOn, mainCookId } from "../logic/owners.js";
import { formatTime, toMinutes, toClock, thanksgivingDate } from "../logic/time.js";
import { el, rebuildKeepingFocus } from "./dom.js";
import { dishName, formatCountdown, plural } from "./format.js";
import { gateCard } from "./gate.js";
import { offerUndo } from "./undo.js";

const FULL_REDRAW_EVERY_S = 10;  // jobs move between the lists as time passes, so redraw this often
const MAX_OVERDUE_SHOWN = 5;

// ---------- the clock ----------

function realMinutes() {
  const d = new Date();
  return d.getHours() * 60 + d.getMinutes() + d.getSeconds() / 60;
}

/** The device clock, or a practice clock that starts at ?now=HH:MM, keeps ticking and can be moved. */
function makeClock(search) {
  const fake = parseFakeNow(search);
  if (fake === null) return { rehearsing: false, now: realMinutes, jump() {} };
  const startedAt = performance.now();
  let offset = 0;
  return {
    rehearsing: true,
    now: () => fake + offset + (performance.now() - startedAt) / 60000,
    jump(minutes) { offset += minutes; },
  };
}

// ---------- keeping the screen awake ----------

let wakeLock = null;

async function keepAwake() {
  try {
    if ("wakeLock" in navigator && !wakeLock) {
      wakeLock = await navigator.wakeLock.request("screen");
      wakeLock.addEventListener("release", () => { wakeLock = null; });
    }
  } catch {
    wakeLock = null; // not supported, or the browser said no. The screen may dim; nothing else changes.
  }
}

function letSleep() {
  try { wakeLock?.release(); } catch { /* ignore */ }
  wakeLock = null;
}

// ---------- pieces of the screen ----------

/** A span whose text is a live countdown to `untilMinute`; the 1-second tick updates it. */
function countdown(untilMinute, now, prefix = "") {
  return el("span", { class: "countdown", "data-until": String(untilMinute), "data-prefix": prefix, text: `${prefix}${formatCountdown(untilMinute - now)}` });
}

/** Every job is ticked off. The falling leaves are CSS shapes and stop for people who ask for less motion. */
function celebration() {
  const leaves = [0, 1, 2, 3, 4].map((i) => {
    const node = el("span", { class: "leaf", "aria-hidden": "true" });
    node.style.left = `${10 + i * 20}%`;
    node.style.animationDelay = `${i * 0.7}s`;
    return node;
  });
  return el("div", { class: "celebrate", role: "status" }, [
    ...leaves,
    el("h3", { text: "All done. Enjoy your dinner!" }),
    el("p", { class: "subtle", text: "Every job is ticked off." }),
  ]);
}

function ownerText(plan, task) {
  // A job with no badge is the host's own, so "Me" is never shown alone.
  if (!helpersOn(plan) || !task.owners || task.owners.every((id) => id === mainCookId(plan))) return null;
  return el("span", { class: "badge owner", text: task.owners.map((id) => cookName(plan, id)).join(" + ") });
}

function doneButton(task, label = "Done") {
  return el("button", {
    type: "button", class: "big-done", text: label, "data-focus": `cookdone:${task.key}`,
    "aria-label": `${label}: ${task.label}`,
    onclick: () => updatePlan((p) => { p.done[task.key] = true; }),
  });
}

/** The job to do right now: what to do, a timer to its end, and a big Done button. */
function taskCard(task, now, plan) {
  return el("div", { class: "cook-task current" }, [
    el("div", { class: "cook-task-head" }, [
      el("h3", { text: task.label }),
      ownerText(plan, task),
    ].filter(Boolean)),
    el("p", { class: "subtle", text: `${dishName(task.dishId)} · ${formatTime(task.start)} to ${formatTime(task.end)}` }),
    el("p", { text: task.instructions }),
    el("p", { class: "cook-countdown" }, [el("span", { text: "Time left: " }), countdown(task.end, now)]),
    doneButton(task),
  ]);
}

function overdueCard(task, now, plan) {
  const late = el("span", { class: "late", "data-since": String(task.end), text: formatCountdown(now - task.end) });
  return el("div", { class: "cook-task overdue" }, [
    el("div", { class: "cook-task-head" }, [el("h3", { text: task.label }), ownerText(plan, task)].filter(Boolean)),
    el("p", { class: "subtle", text: `${dishName(task.dishId)} · was due ${formatTime(task.start)} to ${formatTime(task.end)}` }),
    el("p", { class: "overdue-note" }, [el("span", { text: "Late by " }), late]),
    doneButton(task, "Done"),
  ]);
}

function reminderBanner(reminder, soon) {
  return el("div", { class: `reminder-banner ${reminder.kind}${soon ? " soon" : ""}`, role: soon ? "status" : "alert" }, [
    el("span", { class: "reminder-time", text: soon ? `Coming up at ${formatTime(reminder.at)}` : `Since ${formatTime(reminder.at)}` }),
    el("span", { class: "reminder-text", text: reminder.text }),
    el("button", {
      type: "button", text: "Got it", "data-focus": `rem:${reminder.key}`, "aria-label": `Got it: ${reminder.text}`,
      onclick: () => updatePlan((p) => { p.done[reminder.key] = true; }),
    }),
  ]);
}

function runningRow(run, now) {
  const detail = run.kind === "oven"
    ? `${run.temps.map((t) => `${t}°F`).join(" then ")} in ${getPlan().equipment.find((e) => e.id === run.equipmentId)?.name ?? "the oven"}`
    : "nothing to do, just wait";
  return el("li", { class: "tl" }, [
    el("span", { class: "tl-body" }, [el("span", { text: `${run.label} (${dishName(run.dishId)})` }), el("span", { class: "subtle", text: detail })]),
    el("span", { class: "tl-time" }, [el("span", { text: "ready in " }), countdown(run.end, now)]),
  ]);
}

function nextRow(task, now, plan) {
  return el("li", { class: "tl" }, [
    el("span", { class: "tl-time", text: formatTime(task.start) }),
    el("span", { class: "tl-body" }, [
      el("span", {}, [el("span", { text: task.label }), ownerText(plan, task)].filter(Boolean)),
      el("span", { class: "subtle", text: `${dishName(task.dishId)} · in ${Math.max(1, Math.round(task.start - now))} min` }),
    ]),
  ]);
}

let lateOpen = false; // the screen is redrawn every few seconds, so remember whether this is open

/**
 * "Running late?": moves dinner, and with it every job and reminder, 15 or 30 minutes later. Ticks are kept.
 * Use it when the turkey needs longer or the day has slipped. Undo puts the old times back.
 */
function lateCard(plan) {
  const move = (minutes) => {
    const before = { dinnerTime: plan.dinnerTime, done: { ...plan.done } };
    const after = movedLater(plan, minutes);
    updatePlan((p) => Object.assign(p, after));
    offerUndo(`Dinner is now at ${formatTime(toMinutes(after.dinnerTime))}.`, () => updatePlan((p) => Object.assign(p, before)));
  };
  const details = el("details", { class: "card fold" }, [
    el("summary", {}, [el("span", { class: "fold-title", text: "Running late?" }), el("span", { class: "fold-note", text: "move dinner later" })]),
    el("p", { text: `Dinner is planned for ${formatTime(toMinutes(plan.dinnerTime))}. If the turkey needs longer, or the day has slipped, move dinner and every job with it.` }),
    el("div", { class: "row" }, LATE_CHOICES_MIN.map((m) => el("button", {
      type: "button", class: "quiet", text: `${m} minutes later`, "data-focus": `late:${m}`, disabled: !canMoveLater(plan, m), onclick: () => move(m),
    }))),
  ]);
  details.open = lateOpen;
  details.addEventListener("toggle", () => { lateOpen = details.open; });
  return details;
}

// ---------- the whole screen ----------

function notThursday(plan, schedule, startRehearsal) {
  const date = thanksgivingDate(plan.year).toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" });
  const first = schedule.thursday.length ? Math.min(...schedule.thursday.map((e) => e.start)) : toMinutes(plan.settings.wakeTime);
  return el("section", { class: "card" }, [
    el("h3", { text: "This screen is for Thanksgiving day" }),
    el("p", { text: `On ${date} it shows one job at a time, with a timer. You can try it now with a practice clock that starts at ${formatTime(first)}.` }),
    el("button", { type: "button", text: "Try it now", onclick: () => startRehearsal(first) }),
  ]);
}

function rehearsalBar(clock, redraw) {
  const jump = (m, label) => el("button", { type: "button", class: "quiet", text: label, onclick: () => { clock.jump(m); redraw(); } });
  return el("div", { class: "rehearsal" }, [
    el("strong", { text: "Practice" }),
    el("span", { class: "subtle", text: "The clock below isn't the real time. Use the buttons to move through the day." }),
    el("div", { class: "row" }, [jump(-5, "Back 5 min"), jump(5, "Forward 5 min"), jump(30, "Forward 30 min")]),
  ]);
}

function personPicker(plan, state, redraw) {
  if (!helpersOn(plan)) return null;
  const select = el("select", { "aria-label": "Show jobs for" }, [
    el("option", { value: "", text: "Everyone" }),
    ...plan.helpers.cooks.map((c) => el("option", { value: c.id, text: c.name })),
  ]);
  select.value = state.personId;
  select.addEventListener("change", () => { state.personId = select.value; redraw(); });
  return el("label", { class: "field" }, [el("span", { class: "field-label", text: "Show jobs for" }), select]);
}

/** Build the Cook screen into `container`. */
export function mountCook(container) {
  const content = el("div");
  container.append(content);
  const clock = makeClock(window.location.search);
  const state = { personId: "" };
  let tick = 0;
  let timer = null;

  const startRehearsal = (minute) => {
    window.location.href = `${window.location.pathname}?now=${toClock(minute)}#cook`;
  };

  const draw = () => {
    const plan = getPlan();
    const gate = gateCard("plan for the day");
    if (gate) { content.replaceChildren(gate); return; }

    let schedule;
    try {
      schedule = getSchedule(plan);
    } catch (err) {
      content.replaceChildren(el("p", { class: "error", role: "alert", text: `Something went wrong making the schedule: ${err.message}` }));
      return;
    }
    if (!clock.rehearsing && !isThanksgiving(plan, new Date())) { content.replaceChildren(notThursday(plan, schedule, startRehearsal)); return; }

    const now = clock.now();
    const dinnerMin = toMinutes(plan.dinnerTime);
    const v = cookView(schedule, now, plan.done, { personId: state.personId || undefined, dinnerMin });
    const redraw = () => rebuildKeepingFocus(content, draw);
    const nothingAtAll = v.total === 0 && schedule.thursday.length === 0;
    const missing = schedule.conflicts.filter((c) => !c.placed).length; // dishes that are not on today's plan

    content.replaceChildren(...[
      clock.rehearsing ? rehearsalBar(clock, redraw) : null,
      el("div", { class: "cook-top" }, [
        el("div", {}, [
          el("p", { class: "cook-clock", "data-clock": "1", text: formatTime(now) }),
          el("p", { class: "subtle", text: `${v.total - v.remaining} of ${v.total} jobs done` }),
        ]),
        el("div", { class: "cook-dinner" }, [
          el("span", { class: "subtle", text: v.dinnerIn > 0 ? "Dinner in" : "Dinner time" }),
          v.dinnerIn > 0 ? countdown(dinnerMin, now) : null,
        ].filter(Boolean)),
      ]),
      personPicker(plan, state, redraw),
      missing > 0
        ? el("p", { class: "cook-risk", role: "status", text: `${plural(missing, "dish isn't", "dishes aren't")} in this plan because ${missing === 1 ? "it doesn't" : "they don't"} fit. See "Things to check" on the Schedule screen.` })
        : null,
      ...v.remindersDue.map((r) => reminderBanner(r, false)),
      ...v.remindersSoon.map((r) => reminderBanner(r, true)),
      nothingAtAll ? el("p", { class: "subtle", text: "There's nothing to cook on Thursday. Add dishes on the Dishes screen." }) : null,
      v.overdue.length > 0 ? el("section", { class: "card overdue-card" }, [
        el("h3", { text: `Running late (${v.overdue.length})` }),
        ...v.overdue.slice(0, MAX_OVERDUE_SHOWN).map((t) => overdueCard(t, now, plan)),
        v.overdue.length > MAX_OVERDUE_SHOWN ? el("p", { class: "subtle", text: `and ${v.overdue.length - MAX_OVERDUE_SHOWN} more` }) : null,
        el("button", {
          type: "button", class: "danger", text: "I have done all of these",
          // No "are you sure?" box. Undo puts the ticks back exactly as they were.
          onclick: () => {
            const before = { ...getPlan().done };
            updatePlan((p) => { for (const k of v.pastKeys) p.done[k] = true; });
            offerUndo(`Ticked off ${plural(v.pastKeys.length, "job")}.`, () => updatePlan((p) => { p.done = before; }));
          },
        }),
      ].filter(Boolean)) : null,
      el("section", { class: "card now-card" }, [
        el("h3", { text: "Now" }),
        ...(v.current.length > 0
          ? v.current.map((t) => taskCard(t, now, plan))
          : [v.remaining === 0 && v.total > 0
            ? celebration()
            : el("p", { class: "subtle", text: v.next[0] ? `Nothing to do right now. The next job is at ${formatTime(v.next[0].start)}.` : "Nothing to do right now." })]),
      ]),
      v.running.length > 0 ? el("section", { class: "card" }, [el("h3", { text: "Cooking or waiting" }), el("ul", { class: "timeline" }, v.running.map((r) => runningRow(r, now)))]) : null,
      v.next.length > 0 ? el("section", { class: "card" }, [el("h3", { text: "Next up" }), el("ul", { class: "timeline" }, v.next.map((t) => nextRow(t, now, plan)))]) : null,
      v.remaining > 0 ? lateCard(plan) : null,
    ].filter(Boolean));
  };

  /** Once a second: update the clock and countdowns in place; redraw fully every few seconds. */
  const onTick = () => {
    tick += 1;
    if (tick % FULL_REDRAW_EVERY_S === 0) { rebuildKeepingFocus(content, draw); return; }
    const now = clock.now();
    for (const span of content.querySelectorAll("[data-until]")) {
      span.textContent = `${span.dataset.prefix}${formatCountdown(Number(span.dataset.until) - now)}`;
    }
    for (const span of content.querySelectorAll("[data-since]")) span.textContent = formatCountdown(now - Number(span.dataset.since));
    const clockText = content.querySelector("[data-clock]");
    if (clockText) clockText.textContent = formatTime(now);
  };

  const onCookScreen = () => window.location.hash === "#cook";
  const sync = () => {
    if (onCookScreen()) {
      if (!timer) { rebuildKeepingFocus(content, draw); timer = setInterval(onTick, 1000); }
      keepAwake();
    } else {
      clearInterval(timer);
      timer = null;
      letSleep();
    }
  };

  window.addEventListener("hashchange", sync);
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible" && onCookScreen()) keepAwake(); });
  subscribe(() => { if (onCookScreen()) rebuildKeepingFocus(content, draw); });
  sync();
}
