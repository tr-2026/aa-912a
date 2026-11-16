// "Removed. Undo" notices. Quicker than asking "are you sure?" for things that are easy to put back.
// One notice at a time; a new one replaces the old. It goes away by itself after a few seconds.
import { el } from "./dom.js";

const SHOWN_MS = 9000;

let box = null;
let timer = null;

/** Give the module the page's notice element (index.html has `#undo-toast`). */
export function mountUndo(element) {
  box = element;
}

function hide() {
  clearTimeout(timer);
  if (!box) return;
  box.hidden = true;
  box.replaceChildren();
}

/**
 * Show "message  Undo" for a few seconds. Pressing Undo runs `undo` once and dismisses the notice.
 * @param {string} message e.g. "Removed Oven 2."
 * @param {() => void} undo puts things back
 */
export function offerUndo(message, undo) {
  if (!box) return;
  clearTimeout(timer);
  box.replaceChildren(
    el("span", { class: "undo-text", text: message }),
    el("button", { type: "button", text: "Undo", onclick: () => { hide(); undo(); } }),
    el("button", { type: "button", class: "link", text: "Close", onclick: hide }),
  );
  box.hidden = false;
  timer = setTimeout(hide, SHOWN_MS);
}
