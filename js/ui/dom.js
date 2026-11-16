// Tiny DOM helpers shared by the screens. Text always goes in via textContent, never innerHTML.

/** Build an element: el("p", {class: "subtle", text: "hi"}, [children]). */
export function el(tag, props = {}, children = []) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (key === "text") node.textContent = value;
    else if (key === "class") node.className = value;
    else if (key.startsWith("on")) node.addEventListener(key.slice(2), value);
    else if (value === true) node.setAttribute(key, "");
    else if (value !== false && value !== null && value !== undefined) node.setAttribute(key, value);
  }
  node.append(...children);
  return node;
}

/** A label wrapping a text, followed by the input, so clicking the text focuses the input. */
export function field(labelText, input, hint) {
  const children = [el("span", { class: "field-label", text: labelText }), input];
  if (hint) children.push(el("span", { class: "subtle field-hint", text: hint }));
  return el("label", { class: "field" }, children);
}

/** True while the user is typing in a text box inside `container` (so we must not rebuild it under them). */
export function isTyping(container) {
  const a = document.activeElement;
  if (!a || !container.contains(a)) return false;
  return a.tagName === "TEXTAREA" || (a.tagName === "INPUT" && !["checkbox", "radio", "button"].includes(a.type));
}

/**
 * Rebuild a screen and put keyboard focus back on the same control (found by its data-focus attribute),
 * so ticking a box or pressing "+" does not drop the user out of the page.
 */
export function rebuildKeepingFocus(container, build) {
  const a = document.activeElement;
  const focusKey = container.contains(a) && a.dataset ? a.dataset.focus : null;
  build();
  if (focusKey) {
    const again = container.querySelector(`[data-focus="${CSS.escape(focusKey)}"]`);
    if (again) again.focus();
  }
}

/**
 * Makes a screen rebuild only when someone can see it. Hidden screens just note that they are out of date and
 * rebuild the moment they are shown (app.js fires "screenshown"). Returns the function to call when the plan changes.
 * @param {HTMLElement} container  the element that holds the screen's content
 * @param {() => void} build       builds the content
 * @param {HTMLElement} [typingScope] skip the refresh while the host is typing inside this element
 */
export function lazyScreen(container, build, typingScope = container) {
  const screen = container.closest(".screen");
  let stale = true; // nothing built yet
  const render = () => { stale = false; rebuildKeepingFocus(container, build); };
  document.addEventListener("screenshown", (event) => {
    if (event.detail === screen.dataset.screen && stale) render();
  });
  return function refresh() {
    if (screen.hidden) { stale = true; return; }
    if (!isTyping(typingScope)) render();
  };
}

/**
 * A list that shows the first `max` items and, when there are more, a button ("and 2 more") that shows the rest.
 * Returns the elements to put on the page: the list, then the button if there is one.
 * @param {any[]} items
 * @param {number} max
 * @param {(item: any) => HTMLElement} makeItem builds one <li>
 * @param {() => void} [onExpand] called once the rest is shown
 */
export function listWithMore(items, max, makeItem, onExpand = () => {}) {
  const list = el("ul", {}, items.slice(0, max).map(makeItem));
  if (items.length <= max) return [list];
  const more = el("button", {
    type: "button", class: "link", text: `and ${items.length - max} more`,
    onclick: () => { list.replaceChildren(...items.map(makeItem)); more.remove(); onExpand(); },
  });
  return [list, more];
}

/** Hand the browser a text file to save, as if the user had downloaded it. */
export function downloadText(fileName, text, type) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const link = el("a", { href: url, download: fileName });
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

/** Parse a number input's value. Returns null for blank or non-numeric input. */
export function readNumber(input) {
  if (input.value.trim() === "") return null;
  const n = Number(input.value);
  return Number.isFinite(n) ? n : null;
}
