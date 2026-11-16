// Shown in place of the Schedule, Shopping and Cook screens until the questions have been answered.
import { getPlan } from "../state.js";
import { readiness } from "../logic/readiness.js";
import { el } from "./dom.js";
import { logo } from "./brand.js";

const toQuestions = () => { window.location.hash = "guide"; };

/**
 * @param {string} what what the host is waiting for: "schedule", "shopping list" ...
 * @returns {HTMLElement|null} null once the plan is confirmed
 */
export function gateCard(what) {
  if (readiness(getPlan()).ready) return null;
  return el("section", { class: "card gate" }, [
    logo("72px"),
    el("h3", { text: "A few questions first" }),
    el("p", { text: `We need to know who's coming and what you're cooking before we can make your ${what}.` }),
    el("button", { type: "button", class: "primary", text: "Answer the questions", onclick: toQuestions }),
  ]);
}

/** A short reminder for the Setup and Dishes screens while the questions are unfinished. Null once they are done. */
export function unfinishedNote() {
  if (readiness(getPlan()).ready) return null;
  return el("div", { class: "card unfinished" }, [
    el("p", { text: "You haven't finished the questions yet, so there is no schedule or shopping list." }),
    el("button", { type: "button", text: "Go to the questions", onclick: toQuestions }),
  ]);
}
