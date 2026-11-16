// The "Add a dish" pop-up, for a dish that is not in the list. Used by the menu question and the Dishes screen.
// It asks for a name and where the dish belongs. If the dish bakes, it also asks for a temperature and times.
// Things to buy are optional and folded away, so nobody has to deal with them.
import { updatePlan } from "../state.js";
import { addOwnDish, ownDishProblem, OWN_CATEGORIES, OWN_NAME_MAX, SHOPPING_MAX_LINES } from "../logic/dishes.js";
import { el, field, readNumber } from "./dom.js";
import { CATEGORIES } from "./format.js";

const OVEN_START = { tempF: 350, minutes: 30, prepMin: 10 };
let dialog = null;

/** The oven questions, shown only when the dish goes in the oven. */
function ovenPart() {
  const temp = el("input", { type: "number", min: "150", step: "5", value: String(OVEN_START.tempF) });
  const minutes = el("input", { type: "number", min: "1", step: "1", value: String(OVEN_START.minutes) });
  const prep = el("input", { type: "number", min: "0", step: "1", value: String(OVEN_START.prepMin) });
  const hot = el("input", { type: "checkbox" });
  hot.checked = true;
  const box = el("div", {}, [
    el("div", { class: "fields" }, [
      field("Oven temperature (°F)", temp),
      field("Minutes in the oven", minutes),
      field("Minutes to get it ready first", prep, "Use 0 if it's ready to go in."),
    ]),
    el("label", { class: "check" }, [hot, el("span", { text: "Serve it hot, straight from the oven" })]),
  ]);
  box.hidden = true;
  return { box, answers: () => ({ tempF: readNumber(temp), minutes: readNumber(minutes), prepMin: readNumber(prep) ?? 0, hot: hot.checked }) };
}

/** Rows for the optional things to buy. A row with no name is ignored. */
function shoppingPart() {
  const rows = [];
  const list = el("div", { class: "shop-rows" });
  const addRow = () => {
    if (rows.length >= SHOPPING_MAX_LINES) return;
    const row = {
      name: el("input", { type: "text", maxlength: String(OWN_NAME_MAX), "aria-label": `Thing to buy ${rows.length + 1}`, placeholder: "For example: butter" }),
      qty: el("input", { type: "number", min: "0", step: "any", value: "1", "aria-label": "How many" }),
      unit: el("input", { type: "text", maxlength: "20", "aria-label": "Unit, such as cups or lb", placeholder: "cups, lb…" }),
    };
    rows.push(row);
    list.append(el("div", { class: "shop-row" }, [row.name, row.qty, row.unit]));
  };
  addRow();
  const more = el("button", { type: "button", class: "link", text: "Add another", onclick: addRow });
  const box = el("details", { class: "guide-fold" }, [
    el("summary", {}, [el("span", { text: "Things to buy for it" }), el("span", { class: "fold-note", text: "if you'd like them on your list" })]),
    el("p", { class: "subtle", text: "These go on your shopping list while the dish is on the menu." }),
    list,
    more,
  ]);
  const answers = () => rows
    .filter((r) => r.name.value.trim() !== "")
    .map((r) => ({ name: r.name.value.trim(), qty: readNumber(r.qty), unit: r.unit.value.trim() }));
  return { box, answers };
}

/**
 * Open the pop-up. `onAdded` is called after a dish has been added, so the screen behind can redraw.
 * @param {() => void} [onAdded]
 */
export function openAddDish(onAdded = () => {}) {
  if (!dialog) {
    dialog = el("dialog", { class: "card-dialog add-dish", "aria-label": "Add a dish" });
    document.body.append(dialog);
  }
  const name = el("input", { type: "text", maxlength: String(OWN_NAME_MAX), placeholder: "For example: cheesy potatoes" });
  const category = el("select", {}, CATEGORIES.filter(([id]) => OWN_CATEGORIES.includes(id)).map(([value, text]) => el("option", { value, text })));
  const oven = el("input", { type: "checkbox" });
  const ovenFields = ovenPart();
  oven.addEventListener("change", () => { ovenFields.box.hidden = !oven.checked; });
  const shopping = shoppingPart();
  const problem = el("p", { class: "error", role: "alert" });

  const submit = (event) => {
    event.preventDefault();
    const base = { name: name.value, category: category.value };
    const answers = oven.checked ? { ...base, oven: true, ...ovenFields.answers() } : { ...base, oven: false, hot: false };
    const things = shopping.answers();
    if (things.length > 0) answers.shopping = things;
    problem.textContent = ownDishProblem(answers) ?? "";
    if (problem.textContent) return;
    updatePlan((p) => addOwnDish(p, answers));
    dialog.close();
    onAdded();
  };

  // novalidate: the browser's own pop-up messages are replaced by the plain ones above.
  dialog.replaceChildren(el("form", { onsubmit: submit, novalidate: true }, [
    el("h3", { text: "Add a dish" }),
    el("p", { class: "subtle", text: "For a dish that isn't in the list, such as a family recipe." }),
    el("div", { class: "fields" }, [field("Name of the dish", name), field("Part of the menu", category)]),
    el("label", { class: "check" }, [oven, el("span", { text: "It goes in the oven on Thursday" })]),
    ovenFields.box,
    shopping.box,
    problem,
    el("div", { class: "row" }, [
      el("button", { type: "submit", text: "Add to the menu" }),
      el("button", { type: "button", class: "quiet", text: "Cancel", onclick: () => dialog.close() }),
    ]),
  ]));
  dialog.showModal();
  name.focus();
}
