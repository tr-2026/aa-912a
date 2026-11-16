// Words and formatting shared by the screens.
import { allRecipes } from "./recipebook.js";
import { cookName } from "../logic/owners.js";
import { el } from "./dom.js";

export { formatQty } from "../logic/quantity.js";

/** Menu sections, in the order they are shown: the turkey first, then roughly the order people eat. */
export const CATEGORIES = [
  ["main", "Main"], ["appetizer", "Appetizers"], ["side", "Sides"],
  ["bread", "Bread"], ["dessert", "Desserts"], ["other", "Other"],
];

/** A dish's name, or its id if the recipe is gone. */
export function dishName(id) {
  return allRecipes()[id]?.name ?? id;
}

/**
 * True when a dish's name is plural ("Garlic Mashed Potatoes", "Dinner Rolls"), so sentences can say "don't fit"
 * and "brings them". A guess from the spelling: the name ends in "s", but not in "ss", "us" or "is" (Hummus,
 * Couscous, Swiss). Anything in brackets at the end is ignored: "Pumpkin Pie (Sally's)" is one pie.
 */
export function isPluralName(name) {
  const bare = name.replace(/\s*\([^)]*\)\s*$/, "").trim().toLowerCase();
  return /s$/.test(bare) && !/(ss|us|is)$/.test(bare);
}

/** The small tag shown beside a dish that a guest is bringing. One look everywhere. */
export function guestBadge() {
  return el("span", { class: "badge guest", text: "Brought by a guest" });
}

/** plural(1, "dish", "dishes") -> "1 dish"; plural(3, "oven") -> "3 ovens". */
export function plural(n, one, many = `${one}s`) {
  return `${n} ${n === 1 ? one : many}`;
}

/**
 * How to talk about a cook in a sentence. The main cook is called "Me" unless renamed, and "Me has no break"
 * reads badly, so that name becomes "You".
 * @returns {{name: string, has: string, possessive: string}} e.g. { name: "Ann", has: "Ann has", possessive: "Ann's" }
 */
export function speak(plan, cookId) {
  const name = cookName(plan, cookId);
  if (name.trim().toLowerCase() === "me") return { name: "You", has: "You have", possessive: "your" };
  return { name, has: `${name} has`, possessive: `${name}'s` };
}

/** 125.5 minutes -> "2:05:30"; 3.2 minutes -> "3:12". Under zero is shown as zero. */
export function formatCountdown(minutes) {
  const total = Math.max(0, Math.round(minutes * 60));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

/** A Date as "Sat, Nov 21". */
export function formatDate(date) {
  return date.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
}
