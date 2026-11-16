// Ingredient catalog: one row per thing you can buy. Data only, read-only at runtime.
// Source: workbook tabs "RecipeCalc" (units) and "Grocery List" (store, brand, buy-when, sort).
// Anything the workbook does not say is grouped under TODO(host) below.
//
// Two optional flags beyond DESIGN 4.5 (logged in OPEN_QUESTIONS.md):
//   skipShopping: true         never appears on the list (water)
//   qtyFromTurkeyWeight: true  the list shows plan.turkey.weightLb instead of a scaled quantity

const row = (id, name, groceryUnit, extra = {}) => ({
  id, name, groceryUnit, roundTo: 1,
  store: "Grocery store", brand: "", buyWhen: "anytime", sort: 3, staple: false,
  ...extra,
});

const FRESH = "Fresh market";

/** @type {Object<string, import("../types.js").Ingredient>} */
export const ingredients = Object.fromEntries([
  // ---- From the workbook's Grocery List tab ----
  row("celery", "Celery", "bunch", { store: FRESH, brand: "Organic", buyWhen: "day_before", sort: 1 }),
  row("orange", "Orange (for zest)", "orange", { store: FRESH, buyWhen: "day_before", sort: 1 }),
  row("sour_cream", "Sour cream", "pint", { buyWhen: "week_before", sort: 2 }),
  row("rosemary", "Rosemary (fresh)", "pkg", { buyWhen: "week_before", sort: 2 }),
  row("thyme", "Thyme (fresh)", "pkg", { buyWhen: "week_before", sort: 2 }),
  row("carrot", "Giant carrots", "carrot", { store: "Grocery store", buyWhen: "week_before", sort: 2 }),
  row("onion", "Onion (medium white)", "onion", { store: FRESH, buyWhen: "week_before", sort: 2 }),
  row("grated_swiss", "Grated Swiss cheese", "lb", { store: "Grocery store", buyWhen: "week_before", sort: 2 }),
  row("heavy_cream", "Heavy cream", "pint", { store: "Grocery store", buyWhen: "week_before", sort: 2 }),
  row("egg", "Eggs", "dozen", { store: FRESH, buyWhen: "week_before", sort: 2 }),
  row("fresh_cranberries", "Fresh cranberries", "bag", { store: FRESH, buyWhen: "week_before", sort: 2 }),
  // Bought in packages of 4 sticks (last year's list said "3 packages"); recipe lines convert sticks to packages.
  row("butter", "Butter (4-stick package)", "pkg", { brand: "Land O Lakes Salt Free" }),
  row("cherry_jello", "Cherry Jello", "pkg", { brand: "Jello" }),
  row("corn_bread_mix", "Corn bread mix", "pkg", { brand: "Jiffy" }),
  row("corn_flakes", "Corn flakes", "box", { brand: "Kelloggs" }),
  row("crushed_pineapple", "Crushed pineapple (8 oz can)", "can"),
  row("evaporated_milk", "Evaporated milk (12 oz can)", "can", { brand: "Nestle Carnation" }),
  row("mandarin_oranges", "Mandarin oranges", "can"),
  row("nf_dry_milk", "Non-fat dry milk", "pkg"),
  row("dark_brown_sugar", "Dark brown sugar", "pkg"),
  row("coarse_sugar", "Coarse sugar (Sugar in the Raw)", "box"),
  row("pumpkin_can", "Pure pumpkin (15 oz can)", "can", { brand: "Libby's" }),
  row("pie_crust", "Deep dish pie crust (9 inch, unbaked)", "crust"),
  row("green_beans", "French-style green beans", "can"),
  row("yeast", "Yeast (bread machine)", "packet"),
  row("bread_flour", "Bread flour (5 lb bag)", "bag"),
  row("chicken_broth", "Chicken broth", "box", { brand: "Organic" }),
  row("applesauce", "Applesauce (plain, no added sugar)", "jar"),

  // ---- Pantry staples: shown under "Check your pantry". One jar/bag covers any amount we use. ----
  row("salt", "Salt", "jar", { sort: 4, staple: true }),
  row("pepper", "Pepper", "jar", { sort: 4, staple: true }),
  row("poultry_seasoning", "Poultry seasoning", "jar", { sort: 4, staple: true }),
  row("cinnamon", "Ground cinnamon", "jar", { sort: 4, staple: true }),
  row("ginger", "Ground ginger", "jar", { sort: 4, staple: true }),
  row("nutmeg", "Ground nutmeg", "jar", { sort: 4, staple: true }),
  row("cloves", "Ground cloves", "jar", { sort: 4, staple: true }),
  row("minced_onion", "Minced onion (spice jar)", "jar", { sort: 4, staple: true }),
  row("sage", "Sage", "jar", { sort: 4, staple: true }),
  row("orange_flavor", "Orange extract", "jar", { sort: 4, staple: true }),
  row("kosher_salt", "Kosher salt", "box", { sort: 4, staple: true }),
  row("sugar", "Sugar", "bag", { sort: 4, staple: true }),
  row("flour", "All-purpose flour (5 lb bag)", "bag", { sort: 4, staple: true }),
  row("cornstarch", "Cornstarch", "box", { sort: 4, staple: true }),

  // ---- TODO(host): confirm store, buy-when and units. Not in the workbook's Grocery List tab. ----
  row("turkey", "Turkey", "lb", { store: "Butcher (order ahead)", buyWhen: "week_before", sort: 1, qtyFromTurkeyWeight: true }),
  row("bacon", "Thick-sliced bacon", "pkg"),
  row("bread_cubes", "Bread (cubed and dried for stuffing)", "loaf", { buyWhen: "day_before", sort: 1 }),
  row("lemon", "Lemon", "lemon", { store: FRESH, buyWhen: "week_before", sort: 2 }),
  row("garlic", "Garlic", "head", { store: FRESH, buyWhen: "week_before", sort: 2 }),
  row("parsley", "Parsley (fresh)", "bunch", { store: FRESH, buyWhen: "day_before", sort: 1 }),
  row("russet_potatoes", "Russet potatoes", "lb", { buyWhen: "day_before", sort: 1 }),
  row("half_and_half", "Half and half", "pint", { buyWhen: "day_before", sort: 1 }),
  row("parmesan", "Grated Parmesan", "oz", { buyWhen: "week_before", sort: 2 }),
  row("milk", "Milk", "carton"),
  row("shortening", "Vegetable shortening", "can"),
  row("water", "Water", "cup", { skipShopping: true }),
].map((ing) => [ing.id, ing]));
