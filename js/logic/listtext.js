// The shopping list as plain text, for pasting into a message or a notes app. Pure.
import { formatQty } from "./quantity.js";
import { BUY_WHEN_ORDER } from "./grocery.js";

const WHEN_TITLES = { week_before: "WEEK BEFORE", day_before: "DAY BEFORE", anytime: "ANYTIME" };

function line(row) {
  const amount = [formatQty(row.qty), row.unit].filter(Boolean).join(" ");
  const brand = row.brand ? ` (${row.brand})` : "";
  return `  [${row.checked ? "x" : " "}] ${row.name}: ${amount}${brand}`;
}

/**
 * @param {{groups: Object[], staples: Object[], haveIt: Object[]}} list from buildGroceryList
 * @param {{title: string, hints?: Object<string, string>}} options  hints: buy-when -> text like "around Thu, Nov 19"
 * @returns {string}
 */
export function shoppingListText(list, { title, hints = {} }) {
  const out = [title, ""];
  for (const buyWhen of BUY_WHEN_ORDER) {
    const group = list.groups.find((g) => g.buyWhen === buyWhen);
    if (!group) continue;
    out.push(`${WHEN_TITLES[buyWhen]}${hints[buyWhen] ? ` (${hints[buyWhen]})` : ""}`);
    for (const store of group.stores) {
      out.push(store.store);
      out.push(...store.rows.map(line));
    }
    out.push("");
  }
  if (list.staples.length > 0) {
    out.push("CHECK YOUR PANTRY (buy only what you're out of)");
    out.push(...list.staples.map(line), "");
  }
  out.push("Made with BirdBrain");
  return out.join("\n");
}

/** How many items are in the text (main list plus pantry), for the "Copied N items" message. */
export function listItemCount(list) {
  return list.groups.reduce((n, g) => n + g.stores.reduce((m, s) => m + s.rows.length, 0), 0) + list.staples.length;
}
