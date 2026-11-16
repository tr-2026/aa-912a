// Notices about problems in the plan. After any change the schedule is worked out again.
//  - A pop-up says which problems are new, or have just gone away, because of that change.
//  - A button in the header shows how many there are in total.
// The app never changes the plan by itself. The Schedule screen recommends fixes for each problem.
import { getPlan, subscribe } from "../state.js";
import { getSchedule } from "./schedulecache.js";
import { listRisks, diffRisks } from "../logic/risks.js";
import { readiness } from "../logic/readiness.js";
import { el, listWithMore } from "./dom.js";
import { plural } from "./format.js";
import { riskText, fixedText } from "./risktext.js";

const CHECK_DELAY_MS = 350;      // wait for the host to stop typing before checking
const NEW_RISK_SHOWN_MS = 14000;
const CLEARED_SHOWN_MS = 6000;
const MAX_LISTED = 3;

/** The current risks, or null if the schedule could not be built at all (the Schedule screen explains that). */
function currentRisks() {
  try {
    return listRisks(getSchedule(getPlan()));
  } catch {
    return null;
  }
}

/**
 * @param {{chip: HTMLButtonElement, toast: HTMLElement}} parts
 */
export function mountRiskNotice({ chip, toast }) {
  let previous = currentRisks() ?? [];
  let checkTimer = null;
  let hideTimer = null;

  // The list is folded on the Schedule screen; asking to see it unfolds it (ui/schedule.js listens for "showrisks").
  const goToSchedule = () => { window.location.hash = "schedule"; hideToast(); document.dispatchEvent(new Event("showrisks")); };

  function hideToast() {
    clearTimeout(hideTimer);
    toast.hidden = true;
    toast.replaceChildren();
  }

  function showToast(added, resolved) {
    const plan = getPlan();
    // Opening "and 2 more" gives the host more to read, so the pop-up stays a little longer.
    const keepOpen = () => { clearTimeout(hideTimer); hideTimer = setTimeout(hideToast, NEW_RISK_SHOWN_MS); };
    const parts = [];
    if (added.length > 0) {
      parts.push(el("p", { class: "toast-title", text: added.length === 1 ? "That change caused a problem" : `That change caused ${added.length} problems` }));
      parts.push(...listWithMore(added, MAX_LISTED, (r) => el("li", { text: riskText(r, plan) }), keepOpen));
    }
    if (resolved.length > 0) {
      parts.push(el("p", { class: "toast-title ok", text: resolved.length === 1 ? "That fixed a problem" : `That fixed ${resolved.length} problems` }));
      parts.push(...listWithMore(resolved, MAX_LISTED, (r) => el("li", { text: fixedText(r, plan) }), keepOpen));
    }
    parts.push(el("div", { class: "row" }, [
      added.length > 0 ? el("button", { type: "button", text: "Show me", onclick: goToSchedule }) : null,
      el("button", { type: "button", class: "link", text: "Close", onclick: hideToast }),
    ].filter(Boolean)));

    toast.replaceChildren(...parts);
    toast.classList.toggle("bad", added.length > 0);
    toast.hidden = false;
    clearTimeout(hideTimer);
    hideTimer = setTimeout(hideToast, added.length > 0 ? NEW_RISK_SHOWN_MS : CLEARED_SHOWN_MS);
  }

  function refreshChip(risks) {
    const show = readiness(getPlan()).ready && risks.length > 0;
    chip.hidden = !show;
    chip.textContent = `${plural(risks.length, "thing")} to check`;
  }

  /** quiet = remember the new list without a pop-up (used after opening a saved copy or starting over). */
  function check(quiet) {
    const risks = currentRisks();
    if (risks === null) return;
    // Nothing pops up during the first questions. Their last step lists any problems in one place.
    const guiding = document.body.classList.contains("guide-mode");
    if (!quiet && !guiding) {
      const { added, resolved } = diffRisks(previous, risks);
      if (added.length > 0 || resolved.length > 0) showToast(added, resolved);
    } else {
      hideToast();
    }
    previous = risks; // remembered either way, so nothing the host has already read pops up later
    refreshChip(risks);
  }

  chip.addEventListener("click", goToSchedule);
  refreshChip(previous);
  subscribe((kind) => {
    clearTimeout(checkTimer);
    checkTimer = setTimeout(() => check(kind === "replace"), CHECK_DELAY_MS);
  });
}
