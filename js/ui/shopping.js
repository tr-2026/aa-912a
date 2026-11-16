// Shopping screen: the list by when to buy it (tabs with counts), grouped by store, with check-off,
// pantry staples and custom items. Print shows every tab.
import { getPlan, updatePlan, subscribe } from "../state.js";
import { allRecipes } from "./recipebook.js";
import { ingredients } from "../seed/ingredients.js";
import { buildGroceryList, BUY_WHEN_ORDER } from "../logic/grocery.js";
import { shoppingListText, listItemCount } from "../logic/listtext.js";
import { thanksgivingDate } from "../logic/time.js";
import { el, lazyScreen } from "./dom.js";
import { formatQty, formatDate } from "./format.js";
import { gateCard } from "./gate.js";
import { offerUndo } from "./undo.js";
import { makeTabs } from "./tabs.js";
import { BRAND } from "./brand.js";

// One-tap suggestions for things that are not in a recipe. TODO(host): confirm quantities.
const SUGGESTIONS = [
  { name: "Wine", qty: 6, unit: "bottle", buyWhen: "week_before" },
  { name: "Ice", qty: 2, unit: "bag", buyWhen: "day_before" },
  { name: "Foil", qty: 1, unit: "roll", buyWhen: "anytime" },
  { name: "Drinks", qty: 1, unit: "case", buyWhen: "anytime" },
  { name: "Paper goods", qty: 1, unit: "pack", buyWhen: "anytime" },
  { name: "Roasting pan", qty: 1, unit: "", buyWhen: "anytime" },
];
const BUY_WHEN_LABELS = { week_before: "Week before", day_before: "Day before", anytime: "Anytime" };

// The screen is rebuilt after every tick, so the host's choices are remembered here.
let selectedTab = null;
let addOpen = false;

function whenHint(buyWhen, year) {
  const t = thanksgivingDate(year);
  const daysBefore = { week_before: 7, day_before: 1 }[buyWhen];
  if (!daysBefore) return "Any time before Thursday";
  const when = `Around ${formatDate(new Date(t.getFullYear(), t.getMonth(), t.getDate() - daysBefore))}`;
  // Wednesday's jobs (turkey prep, chopping, drying the bread) use these items, so the trip comes first.
  return buyWhen === "day_before" ? `${when}. Shop before you start Wednesday's jobs.` : when;
}

function qtyText(row) {
  return [formatQty(row.qty), row.unit].filter(Boolean).join(" ");
}

function nextCustomId(items) {
  const numbers = items.map((c) => Number(String(c.id).replace("custom_", ""))).filter(Number.isFinite);
  return `custom_${Math.max(0, ...numbers) + 1}`;
}

/** A plain line on the "Already have/purchased" tab: no tick box, nothing crossed off, and a way back if it was a mistake. */
function haveRow(row) {
  const label = el("span", { class: "item-text" }, [
    el("span", { class: "item-name", text: row.name }),
    el("span", { class: "item-qty", text: qtyText(row) }),
    row.brand ? el("span", { class: "subtle", text: row.brand }) : null,
  ].filter(Boolean));
  const needIt = el("button", {
    type: "button", class: "link", "data-focus": `have:${row.key}`, text: "Need it", "aria-label": `Need ${row.name}`,
    onclick: () => updatePlan((p) => { delete p.haveIt[row.key]; delete p.checked[row.key]; }),
  });
  return el("li", { class: "item" }, [el("div", { class: "item-main" }, [label]), needIt]);
}

function itemRow(row) {
  const box = el("input", { type: "checkbox", "data-focus": `chk:${row.key}`, "aria-label": `Bought ${row.name}` });
  box.checked = row.checked;
  box.addEventListener("change", () => updatePlan((p) => { if (box.checked) p.checked[row.key] = true; else delete p.checked[row.key]; }));

  const label = el("span", { class: "item-text" }, [
    el("span", { class: "item-name", text: row.name }),
    el("span", { class: "item-qty", text: qtyText(row) }),
    row.brand ? el("span", { class: "subtle", text: row.brand }) : null,
  ].filter(Boolean));

  // Only the host's own items can be deleted. Everything else is ticked off when bought.
  const action = !row.custom ? null : el("button", {
    type: "button", class: "link", "data-focus": `del:${row.key}`, text: "Delete", "aria-label": `Delete ${row.name}`,
    onclick: () => {
      const index = getPlan().customItems.findIndex((c) => c.id === row.key);
      const removed = { ...getPlan().customItems[index] };
      const wasChecked = !!getPlan().checked[row.key];
      updatePlan((p) => { p.customItems = p.customItems.filter((c) => c.id !== row.key); delete p.checked[row.key]; });
      offerUndo(`Removed ${removed.name}.`, () => updatePlan((p) => {
        p.customItems.splice(Math.min(index, p.customItems.length), 0, removed);
        if (wasChecked) p.checked[removed.id] = true;
      }));
    },
  });
  return el("li", { class: `item${row.checked ? " done" : ""}` }, [
    el("label", { class: "item-main" }, [box, label]), action,
  ].filter(Boolean));
}
/** One buy-when tab: its stores side by side on a wide screen. */
function whenPanel(group, year) {
  return el("section", { class: "card" }, [
    el("h3", { text: `${BUY_WHEN_LABELS[group.buyWhen]}` }),
    el("p", { class: "subtle", text: whenHint(group.buyWhen, year) }),
    el("div", { class: "store-cols" }, group.stores.map((s) =>
      el("div", { class: "store-block" }, [el("h4", { text: s.store }), el("ul", { class: "items" }, s.rows.map(itemRow))]))),
  ]);
}

function plainPanel(title, note, rows, emptyText, rowFor = itemRow) {
  return el("section", { class: "card" }, [
    el("h3", { text: title }),
    note ? el("p", { class: "subtle", text: note }) : null,
    rows.length ? el("ul", { class: "items" }, rows.map((r) => rowFor(r))) : el("p", { class: "subtle", text: emptyText }),
  ].filter(Boolean));
}

function addItemCard() {
  const name = el("input", { type: "text", placeholder: "What to buy", "aria-label": "What to buy" });
  const qty = el("input", { type: "number", min: "0", step: "any", value: "1", "aria-label": "How many" });
  const unit = el("input", { type: "text", placeholder: "bottle, bag…", "aria-label": "Bottle, bag or other unit" });
  const store = el("input", { type: "text", value: "Other", "aria-label": "Store" });
  const when = el("select", { "aria-label": "Buy when" },
    Object.entries(BUY_WHEN_LABELS).map(([value, text]) => el("option", { value, text })));

  const add = (item) => updatePlan((p) => { p.customItems.push({ id: nextCustomId(p.customItems), store: "Other", ...item }); });
  const submit = () => {
    const q = Number(qty.value);
    if (!name.value.trim() || !Number.isFinite(q) || q <= 0) return;
    // The list is not redrawn while someone is typing in it. Leave the box first, or an item added with the
    // Enter key would not show up until the next change.
    name.blur();
    add({ name: name.value.trim(), qty: q, unit: unit.value.trim(), store: store.value.trim() || "Other", buyWhen: when.value });
  };
  name.addEventListener("keydown", (e) => { if (e.key === "Enter") submit(); });

  const details = el("details", { class: "card fold print-hide" }, [
    el("summary", {}, [el("span", { class: "fold-title", text: "Add an item" }), el("span", { class: "fold-note", text: "wine, ice, foil, drinks…" })]),
    el("div", { class: "chips" }, SUGGESTIONS.map((s) => el("button", {
      type: "button", class: "chip", text: s.name, "data-focus": `sug:${s.name}`, onclick: () => add(s),
    }))),
    el("div", { class: "add-row" }, [name, qty, unit, store, when, el("button", { type: "button", text: "Add", onclick: submit })]),
  ]);
  details.open = addOpen;
  details.addEventListener("toggle", () => { addOpen = details.open; });
  return details;
}

/** Put text on the clipboard. Tries the modern way, then the old way. Returns false if the browser refuses both. */
async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch { /* not allowed here (for example an insecure page): try the old way */ }
  try {
    const box = el("textarea", { "aria-hidden": "true", tabindex: "-1" });
    box.value = text;
    box.style.cssText = "position:fixed;left:-9999px;top:0";
    document.body.append(box);
    box.select();
    const ok = document.execCommand("copy");
    box.remove();
    return ok;
  } catch {
    return false;
  }
}

/** Build the Shopping screen into `container`. */
export function mountShopping(container) {
  const list = el("div");
  // Shown only when the browser will not let us copy: the text is selected so Ctrl+C or a long press finishes the job.
  const textDialog = el("dialog", { class: "card-dialog", "aria-label": "Shopping list text" });
  container.append(list, textDialog);

  const copyList = async (result, plan, status) => {
    const text = shoppingListText(result, {
      title: `${BRAND} · Thanksgiving shopping list`,
      hints: { week_before: whenHint("week_before", plan.year), day_before: whenHint("day_before", plan.year) },
    });
    if (await copyText(text)) {
      status.textContent = `Copied ${listItemCount(result)} items. Paste them into a message or notes app.`;
      return;
    }
    const area = el("textarea", { rows: "12", readonly: true, "aria-label": "Shopping list text to copy" });
    area.value = text;
    textDialog.replaceChildren(
      el("h3", { text: "Copy your list" }),
      el("p", { class: "subtle", text: "Your browser wouldn't copy it for you. Select the text and copy it." }),
      area,
      el("div", { class: "row" }, [el("button", { type: "button", text: "Close", onclick: () => textDialog.close() })]),
    );
    textDialog.showModal();
    area.select();
  };

  const build = () => {
    const plan = getPlan();
    const gate = gateCard("shopping list");
    if (gate) { list.replaceChildren(gate); return; }
    let result;
    try {
      result = buildGroceryList(plan, allRecipes(), ingredients);
    } catch (err) {
      list.replaceChildren(el("p", { class: "error", role: "alert", text: `Something went wrong making the shopping list: ${err.message}` }));
      return;
    }

    const mainRows = result.groups.flatMap((g) => g.stores.flatMap((s) => s.rows));
    const bought = mainRows.filter((r) => r.checked).length;
    const totalItems = mainRows.length;
    const countFor = (buyWhen) => result.groups.find((g) => g.buyWhen === buyWhen)?.stores.reduce((n, s) => n + s.rows.length, 0) ?? 0;

    const whenTab = (buyWhen) => {
      const group = result.groups.find((g) => g.buyWhen === buyWhen) ?? { buyWhen, stores: [] };
      return {
        id: buyWhen, label: BUY_WHEN_LABELS[buyWhen], count: countFor(buyWhen),
        content: group.stores.length
          ? whenPanel(group, plan.year)
          : plainPanel(BUY_WHEN_LABELS[buyWhen], whenHint(buyWhen, plan.year), [], "Nothing to buy for this time."),
      };
    };
    // Tab order: what is already in the house, then by how far ahead to buy, then what the host crossed off.
    const tabs = [
      { id: "pantry", label: "Pantry", count: result.staples.length, content: plainPanel("Check your pantry", "Pantry staples you likely already have.", result.staples, "Nothing to check.") },
      whenTab("anytime"), whenTab("week_before"), whenTab("day_before"),
      { id: "have", label: "Already have/purchased", count: result.haveIt.length, content: plainPanel("Already have/purchased", "Everything you have ticked off. Press \"Need it\" if you ticked one by mistake.", result.haveIt, "Nothing here yet. Items you tick off will show up here.", haveRow) },
    ];
    const firstWithItems = BUY_WHEN_ORDER.find((w) => countFor(w) > 0) ?? BUY_WHEN_ORDER[0];
    const { bar, panels } = makeTabs({ tabs, selected: selectedTab ?? firstWithItems, label: "Parts of the shopping list", onSelect: (id) => { selectedTab = id; } });

    const progress = el("progress", { max: String(Math.max(1, totalItems)), value: String(bought), "aria-label": "Items bought" });
    const status = el("span", { class: "subtle", role: "status" });
    list.replaceChildren(...[
      el("p", { class: "print-only print-title", text: `${BRAND} · Thanksgiving shopping list` }),
      el("div", { class: "row between" }, [
        el("p", { class: "subtle", text: `${bought} of ${totalItems} items bought` }),
        el("div", { class: "row print-hide" }, [
          status,
          el("button", { type: "button", class: "quiet", text: "Copy list", "data-focus": "copylist", onclick: () => copyList(result, plan, status) }),
          el("button", { type: "button", class: "quiet", text: "Print", onclick: () => window.print() }),
        ]),
      ]),
      progress,
      totalItems === 0 ? el("p", { class: "subtle", text: "Nothing to buy yet. Add dishes on the Dishes screen." }) : null,
      addItemCard(),
      bar,
      ...panels,
    ].filter(Boolean));
  };

  subscribe(lazyScreen(container, build));
}
