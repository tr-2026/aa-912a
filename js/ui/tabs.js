// In-page tabs (a segmented control). They cut scrolling: a long screen shows one part at a time.
// Every panel is built and kept in the page (hidden with a class), so Print can still show all of them.
import { el } from "./dom.js";

/**
 * @param {Object} opts
 * @param {{id: string, label: string, count?: number, content: Node, printSkip?: boolean}[]} opts.tabs
 * @param {string} opts.selected   id of the tab to show first
 * @param {(id: string) => void} opts.onSelect  called when the host picks a tab (so the screen can remember it)
 * @param {string} opts.label      accessible name of the tab list
 * @returns {{bar: HTMLElement, panels: HTMLElement[]}}
 */
export function makeTabs({ tabs, selected, onSelect, label }) {
  const active = tabs.some((t) => t.id === selected) ? selected : tabs[0].id;
  const buttons = new Map();
  const panels = new Map();

  const show = (id) => {
    for (const [tabId, button] of buttons) button.setAttribute("aria-selected", String(tabId === id));
    for (const [tabId, panel] of panels) panel.classList.toggle("tab-off", tabId !== id);
    for (const [tabId, button] of buttons) button.tabIndex = tabId === id ? 0 : -1;
  };

  const bar = el("div", { class: "tabs print-hide", role: "tablist", "aria-label": label });
  for (const tab of tabs) {
    const button = el("button", {
      type: "button", class: "tab", role: "tab", id: `tab-${tab.id}`, "aria-controls": `panel-${tab.id}`,
      "data-focus": `tab:${tab.id}`,
    }, [
      el("span", { text: tab.label }),
      tab.count !== undefined ? el("span", { class: "tab-count", text: String(tab.count) }) : null,
    ].filter(Boolean));
    button.addEventListener("click", () => { show(tab.id); onSelect(tab.id); });
    buttons.set(tab.id, button);
    bar.append(button);
  }
  // Left and right arrows move between tabs, as people expect from a tab list.
  bar.addEventListener("keydown", (event) => {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    const ids = tabs.map((t) => t.id);
    const current = ids.findIndex((id) => buttons.get(id).getAttribute("aria-selected") === "true");
    const next = ids[(current + (event.key === "ArrowRight" ? 1 : ids.length - 1)) % ids.length];
    show(next);
    onSelect(next);
    buttons.get(next).focus();
  });

  for (const tab of tabs) {
    panels.set(tab.id, el("div", {
      class: `tab-panel${tab.printSkip ? " print-skip" : ""}`, role: "tabpanel", id: `panel-${tab.id}`, "aria-labelledby": `tab-${tab.id}`,
    }, [tab.content]));
  }
  show(active);
  return { bar, panels: [...panels.values()] };
}
