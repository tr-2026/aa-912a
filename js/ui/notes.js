// Notes screen: the host's notes, saving and opening a copy of the plan, and starting over.
// Also the reminder strip that can show at the top of every screen.
import {
  getPlan, updatePlan, subscribe, resetPlan, startNextYear, downloadPlan, importPlanText,
  isChangedSinceBackup, isStorageBroken, getLoadWarning,
} from "../state.js";
import { backupReminder } from "../logic/backup.js";
import { thanksgivingDate } from "../logic/time.js";
import { el } from "./dom.js";
import { confirmDialog } from "./confirmdialog.js";
import { logo, BRAND } from "./brand.js";
import { restartGuide } from "./guide.js";
import { saveRemindersFile } from "./calendarfile.js";

function lastBackupText(lastBackupAt) {
  if (!lastBackupAt) return "You haven't saved a copy yet.";
  const when = new Date(lastBackupAt);
  if (Number.isNaN(when.getTime())) return "";
  return `You last saved a copy on ${when.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}.`;
}

/**
 * Keeps `banner` (an element near the top of the page) in step with the plan: storage trouble,
 * an unreadable saved plan, or a backup reminder.
 * @param {HTMLElement} banner
 */
export function mountBanner(banner) {
  const render = () => {
    const messages = [];
    if (getLoadWarning()) messages.push(getLoadWarning());
    if (isStorageBroken()) messages.push("This browser isn't keeping your plan. Before you close this page, go to Notes and press \"Save a copy\".");
    const reminder = backupReminder(getPlan().lastBackupAt, isChangedSinceBackup(), Date.now());
    if (reminder.show) messages.push(`${reminder.reason} Go to Notes and press "Save a copy".`);
    banner.replaceChildren(...messages.map((m) => el("p", { text: m })));
    banner.hidden = messages.length === 0;
  };
  render();
  subscribe(render);
}

let afterRebuildMessage = "";
let statusLine = null; // the "Last backup" line currently on screen

const MAX_PLAN_FILE_BYTES = 1_000_000;

function backupCard() {
  const status = el("p", { class: "subtle" });
  const message = el("p", { role: "status", class: afterRebuildMessage ? "ok" : "", text: afterRebuildMessage });
  afterRebuildMessage = "";
  const fileInput = el("input", { type: "file", accept: "application/json,.json", hidden: true, "aria-label": "Choose a saved copy of your plan" });

  // mountNotes keeps this line up to date. Subscribing here would add one more listener every time the
  // screen is rebuilt.
  statusLine = status;
  status.textContent = lastBackupText(getPlan().lastBackupAt);

  fileInput.addEventListener("change", async () => {
    const file = fileInput.files[0];
    fileInput.value = ""; // so choosing the same file again still fires "change"
    if (!file) return;
    if (file.size > MAX_PLAN_FILE_BYTES) { // a real plan is a few thousand bytes: anything this big is not one
      message.className = "error";
      message.textContent = "That file is too big to be a saved plan. Nothing was changed.";
      message.setAttribute("role", "alert");
      return;
    }
    const ok = await confirmDialog({
      title: "Replace the plan you have now?",
      message: `Opening "${file.name}" replaces everything on this device. If you want to keep the plan you have now, save a copy of it first.`,
      confirmText: "Yes, replace it",
    });
    if (!ok) return;
    // Opening a file replaces the plan, which rebuilds this screen, so the message is kept for the new screen.
    afterRebuildMessage = "Your saved plan is open.";
    let text;
    try {
      text = await file.text();
    } catch {
      afterRebuildMessage = "";
      message.className = "error";
      message.textContent = "That file couldn't be read. Nothing was changed.";
      return;
    }
    const result = importPlanText(text);
    if (result.ok) return;
    afterRebuildMessage = "";
    message.className = "error";
    message.textContent = result.error;
    message.setAttribute("role", "alert");
  });

  return el("div", { class: "card" }, [
    el("h3", { text: "Keep a copy of your plan" }),
    el("p", { class: "subtle", text: "Your plan is kept on this device only. Save a copy so you can't lose it, or to move it to another computer or phone." }),
    status,
    el("div", { class: "row" }, [
      el("button", { type: "button", text: "Save a copy", onclick: () => { downloadPlan(); message.className = "ok"; message.textContent = "Saved. Look in your Downloads folder for birdbrain-plan.json."; } }),
      el("button", { type: "button", class: "quiet", text: "Open a saved copy", onclick: () => fileInput.click() }),
      el("button", {
        type: "button", class: "quiet", text: "Save reminders for my calendar",
        onclick: () => {
          try {
            const count = saveRemindersFile(getPlan());
            message.className = "ok";
            message.textContent = `Saved birdbrain-reminders.ics with ${count} reminders. Open that file to put them in your calendar app, which will ring them.`;
          } catch {
            message.className = "error";
            message.setAttribute("role", "alert");
            message.textContent = "The reminders couldn't be made. Answer the questions first, then try again.";
          }
        },
      }),
      fileInput,
    ]),
    message,
  ]);
}

function notesCard() {
  const area = el("textarea", { rows: "8", "aria-label": "Your notes", placeholder: "Anything you want to remember about this year" });
  area.value = getPlan().notes;
  area.addEventListener("input", () => updatePlan((p) => { p.notes = area.value; }));
  return el("div", { class: "card" }, [el("h3", { text: "Your notes" }), area]);
}

function resetCard() {
  return el("div", { class: "card" }, [
    el("h3", { text: "Start over" }),
    el("p", { class: "subtle", text: "This clears your plan and starts again from the example. Save a copy first if you might want it back." }),
    el("button", {
      type: "button", class: "danger", text: "Start over",
      onclick: async () => {
        const ok = await confirmDialog({
          title: "Start over?",
          message: "This clears your guests, menu, notes and everything you've ticked off. You can't undo it. Save a copy first if you might want it back.",
          confirmText: "Yes, start over",
        });
        if (!ok) return;
        resetPlan();
        restartGuide(); // a fresh plan starts with the questions, from the first one
      },
    }),
  ]);
}

/** For after the holiday: carry this plan into next year instead of starting from the example. */
function nextYearCard() {
  const year = getPlan().year;
  const next = year + 1;
  // Until this year's dinner has happened there is nothing to carry over, and pressing the button early would
  // move every date (and the countdown) a year ahead with no way back. So the button waits for the day itself.
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (today < thanksgivingDate(year)) {
    return el("div", { class: "card" }, [
      el("h3", { text: "When Thanksgiving is over" }),
      el("p", { class: "subtle", text: `From Thanksgiving day, a button here turns this plan into your plan for ${next}, with your guests, kitchen and menu kept.` }),
    ]);
  }
  return el("div", { class: "card" }, [
    el("h3", { text: "When Thanksgiving is over" }),
    el("p", { class: "subtle", text: `Keep this plan for ${next}. Your guests, kitchen and menu stay as they are. Each dish's note is kept under "Past years", so write down what you would change while you remember. Everything you ticked off is cleared.` }),
    el("button", {
      type: "button", text: `Start my ${next} plan`,
      onclick: async () => {
        const ok = await confirmDialog({
          title: `Start your ${next} plan?`,
          message: `This turns your ${next - 1} plan into a plan for ${next}. You can't undo it. Save a copy first if you want to keep this year's plan as it is.`,
          confirmText: `Yes, start ${next}`,
        });
        if (!ok) return;
        startNextYear();
        window.location.hash = "guide"; // the questions come back with last year's answers filled in
      },
    }),
  ]);
}

function aboutCard() {
  return el("div", { class: "card about" }, [
    el("div", { class: "row" }, [
      logo("48px"),
      el("div", {}, [
        el("h3", { text: `About ${BRAND}` }),
        el("p", { class: "subtle", text: "Your whole Thanksgiving in one place: the guests, the menu, who cooks what, the oven schedule, the jobs before Thursday and the shopping." }),
        el("button", { type: "button", class: "link", text: "Answer the questions again", onclick: restartGuide }),
      ]),
    ]),
  ]);
}

/** Build the Notes screen into `container`. It is rebuilt after "Open a saved copy" or "Start over" so the notes box is current. */
export function mountNotes(container) {
  const build = () => container.replaceChildren(notesCard(), backupCard(), resetCard(), nextYearCard(), aboutCard());
  build();
  subscribe((kind) => {
    if (kind === "replace") build();
    else if (statusLine) statusLine.textContent = lastBackupText(getPlan().lastBackupAt);
  });
}
