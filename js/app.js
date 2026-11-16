// Startup and screen switching. Each screen lives in js/ui/; the plan itself lives in state.js.
import { loadPlan, getPlan, subscribe } from "./state.js";
import { thanksgivingDate } from "./logic/time.js";
import { homeScreen } from "./logic/home.js";
import { parseFakeNow } from "./logic/cookmode.js";
import { mountUndo } from "./ui/undo.js";
import { mountSetup } from "./ui/setup.js";
import { mountMenu } from "./ui/menu.js";
import { mountShopping } from "./ui/shopping.js";
import { mountSchedule } from "./ui/schedule.js";
import { mountNotes, mountBanner } from "./ui/notes.js";
import { mountRiskNotice } from "./ui/risknotice.js";
import { mountCook } from "./ui/cook.js";
import { mountGuide } from "./ui/guide.js";

const SCREENS = ["guide", "setup", "menu", "schedule", "shopping", "notes", "cook"];
const DEFAULT_SCREEN = "schedule";

/** Which screen the address names ("#menu"). Anything unknown shows the Schedule. */
function screenFromHash() {
  const name = window.location.hash.replace("#", "");
  return SCREENS.includes(name) ? name : DEFAULT_SCREEN;
}

function showScreen(name) {
  // The first questions fill the whole page: no buttons along the bottom, no reminders, no pop-ups.
  document.body.classList.toggle("guide-mode", name === "guide");
  document.body.dataset.screen = name; // lets the stylesheet treat one screen differently (the Cook screen on a phone)
  for (const section of document.querySelectorAll(".screen")) {
    section.hidden = section.dataset.screen !== name;
  }
  for (const button of document.querySelectorAll(".tab-bar button")) {
    if (button.dataset.tab === name) button.setAttribute("aria-current", "page");
    else button.removeAttribute("aria-current");
  }
  // Hidden screens are not redrawn when the plan changes. This tells the one now showing to catch up.
  document.dispatchEvent(new CustomEvent("screenshown", { detail: name }));
}

function wireTabs() {
  for (const button of document.querySelectorAll(".tab-bar button")) {
    // Setting the hash fires "hashchange", which does the actual switching (so Back works).
    button.addEventListener("click", () => { window.location.hash = button.dataset.tab; });
  }
  window.addEventListener("hashchange", () => showScreen(screenFromHash()));
}

function body(screenName) {
  return document.querySelector(`#screen-${screenName} .screen-body`);
}

function renderCountdown() {
  const plan = getPlan();
  const target = thanksgivingDate(plan.year);
  const now = new Date();
  const todayMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  // Round, because a daylight-saving change makes a "day" 23 or 25 hours.
  const days = Math.round((target - todayMidnight) / 86400000);
  const when = days > 1 ? `${days} days to Thanksgiving`
    : days === 1 ? "Thanksgiving is tomorrow"
      : days === 0 ? "Happy Thanksgiving!" : "Thanksgiving has passed";
  const pill = document.getElementById("countdown");
  pill.textContent = when;
  pill.title = target.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric", year: "numeric" });
}

// A closed <details> prints as only its title, so open "Things to check" before printing.
window.addEventListener("beforeprint", () => {
  for (const details of document.querySelectorAll("details.risks")) details.open = true;
});

function start() {
  loadPlan();
  // With no screen named in the address, pick one: the first questions for a new plan, the Cook screen on
  // Thanksgiving day, otherwise the Schedule. This is done before the screens are built because the Cook
  // screen starts its clock from the address.
  if (!window.location.hash) {
    const home = homeScreen(getPlan(), new Date(), parseFakeNow(window.location.search) !== null);
    history.replaceState(null, "", `${window.location.pathname}${window.location.search}#${home}`);
  }
  mountUndo(document.getElementById("undo-toast"));
  mountBanner(document.getElementById("banner"));
  mountSetup(body("setup"));
  mountMenu(body("menu"));
  mountSchedule(body("schedule"));
  mountShopping(body("shopping"));
  mountNotes(body("notes"));
  mountCook(body("cook"));
  mountGuide(body("guide"));
  mountRiskNotice({ chip: document.getElementById("risk-chip"), toast: document.getElementById("risk-toast") });
  renderCountdown();
  subscribe(renderCountdown);
  wireTabs();
  showScreen(screenFromHash());
}

start();
