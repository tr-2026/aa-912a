// Recipes: data only, read-only at runtime.
//
// Ingredient quantities and groceryQty come from the workbook's RecipeCalc tab (one batch), with the
// Recipe Cards tab used where RecipeCalc has no row. groceryQty is the amount already converted into the
// ingredient's groceryUnit. Pantry staples (spices, sugar, flour) use tiny fractions of a jar or bag, so any
// total rounds up to 1 jar/bag; the helpers below say how each fraction was worked out.
//
// Steps: durations and temperatures are starter estimates (DESIGN section 9); every guess carries a
// TODO(host) comment. Instructions come from the Recipe Cards and Turkey tabs. A {ingredientId} placeholder is
// replaced by instructions.js with "qty unit name" for the whole batch count, e.g. "4 TB butter", so write the
// sentence around it without repeating the ingredient name. A placeholder uses the FIRST line for that ingredient.

const tspJar = (tsp) => tsp / 48; // ~1 oz spice jar holds about 48 tsp
const sugarBag = (cups) => cups / 9; // 4 lb bag of sugar is about 9 cups
const flourBag = (cups) => cups / 17; // 5 lb bag of flour is about 17 cups
const tbFlour = (tb) => flourBag(tb / 16);
const stickPkg = (sticks) => sticks / 4; // butter is bought in packages of 4 sticks

/** One recipe ingredient line. */
const line = (ingredientId, qty, unit, groceryQty, prep) => ({
  ingredientId, qty, unit, groceryQty, ...(prep ? { prep } : {}),
});

/**
 * A dish that is only a name (no ingredients, no steps), with the amount it comes in: `one` and `many` are the
 * word for one of it and for more ("pan", "pans"), and one of them feeds `servesBase` people. The amount shown
 * is that many for the guests coming, in steps of half a unit (1, 1.5, 2). Sizes come from the workbook's Menu tab where it has one; the others are
 * ASSUMPTIONS, marked below. TODO(host): confirm.
 */
const nameOnly = (id, name, category, one, many, servesBase = 14) => ({
  id, name, category, unit: { one, many, step: 0.5 }, // the amount goes up and down in halves
  servesBase, tags: [],
  serve: { temp: "room", holdMin: 480 },
  ingredients: [], steps: [], notes: "", history: [],
});

/** A one-slot-or-more oven step with a single temperature. */
const bake = (id, name, tempF, minutes, slots, instructions) => ({
  id, name, kind: "cook", dayOffset: 0,
  cook: { equipmentType: "oven", slots, stages: [{ tempF, minutes }] },
  instructions,
});

/** @type {Object<string, import("../types.js").Recipe>} */
export const recipes = {
  turkey: {
    id: "turkey",
    name: "Turkey",
    category: "main",
    servesBase: 0, // 0 = sized by weight in Setup, never by batches
    tags: [],
    serve: { temp: "hot", holdMin: 0 },
    thaw: true,
    // The order date has no daysBefore here: logic/thaw.js works it out from the thaw date (frozen) or from
    // Thanksgiving (fresh). TODO(host): confirm the store; past years the turkey was ordered ahead.
    orderAhead: { text: "Order the turkey" },
    ingredients: [
      line("turkey", 1, "bird", 1),
      // Aromatics from the Turkey tab. TODO(host): confirm amounts.
      line("lemon", 1, "", 1, "juiced"),
      line("onion", 0.5, "", 0.5, "peeled and quartered"),
      line("celery", 1, "bunch (tops and bottoms)", 0.25),
      line("carrot", 2, "", 2),
      line("parsley", 1, "bunch", 1),
      line("rosemary", 4, "sprigs", 0.5),
      line("thyme", 4, "sprigs", 0.5),
      line("butter", 4, "TB", stickPkg(0.5), "melted, for rubbing"),
      line("salt", 1, "TB", tspJar(3)),
      line("pepper", 1, "tsp", tspJar(1)),
    ],
    steps: [
      {
        id: "prep", name: "Prep the turkey", kind: "hands_on", dayOffset: -1, dayOrder: 90, // last: in the evening, so it is in the fridge less time
        durationMin: 45, // TODO(host): confirm
        instructions:
          "Remove the giblets, rinse the turkey inside and out and pat it dry. Rub the cavity with the juice of {lemon} and " +
          "{salt}. Put {onion}, {parsley}, {carrot} and {celery} inside, then close the cavity and tie the legs. " +
          "Rub the outside with {butter} and season with {pepper}. Set the turkey breast down on a rack in a roasting " +
          "pan, add {rosemary} and {thyme}, and refrigerate.",
      },
      {
        id: "temper", name: "Let the turkey come to room temperature", kind: "passive", dayOffset: 0,
        durationMin: 120, // from DESIGN 5.1
        instructions: "Take the turkey out of the fridge 2 to 3 hours before cooking. It cooks faster and more evenly.",
      },
      {
        id: "cook", name: "Roast the turkey", kind: "cook", dayOffset: 0,
        cook: { equipmentType: "oven", slots: 4, stagesFrom: "turkey" },
        reminder: { offsetMin: -60, kind: "probe", text: "Start probing the turkey: 165°F breast, 175°F thigh." },
        instructions:
          "Roast the turkey breast down on the rack. Take its temperature in the thickest part of the thigh, away from " +
          "the bone. It's done at 165°F in the breast and 175°F in the thigh. It keeps rising as it rests, so many cooks " +
          "pull it at 160°F and 170°F.",
      },
      {
        id: "rest", name: "Rest the turkey", kind: "passive", dayOffset: 0,
        durationMin: 30, // from DESIGN 5.1
        instructions: "Let the turkey rest, loosely covered. Keep the drippings for the gravy.",
      },
      {
        id: "carve", name: "Carve the turkey", kind: "hands_on", dayOffset: 0,
        durationMin: 15, // from DESIGN 5.1
        instructions: "Turn the turkey breast side up and carve it.",
      },
    ],
    notes: "Take the temperature in the thickest part of the thigh, away from the bone.",
    history: [
      { year: 2018, text: "Ordered ahead - 12-14 lb., pickup Wednesday" },
      { year: 2017, text: "Ordered ahead - 17/18 lb., pickup Tuesday" },
      { year: 2016, text: "Ordered ahead" },
      { year: 2015, text: "19.5 lbs - excellent" },
      { year: 2011, text: "$32.49 before a $1/lb coupon, 13.05 lbs" },
    ],
  },

  stuffing: {
    id: "stuffing",
    name: "Stuffing",
    category: "side",
    servesBase: 8, // TODO(host): confirm. Chosen so 13.5 guests -> 2 batches.
    tags: [],
    serve: { temp: "hot", holdMin: 30 },
    ingredients: [
      line("celery", 1, "cup", 0.5, "finely chopped"),
      line("onion", 0.5, "cup", 0.5, "finely chopped"),
      line("butter", 8, "TB", stickPkg(1)),
      line("poultry_seasoning", 1, "tsp", tspJar(1)),
      line("pepper", 0.25, "tsp", tspJar(0.25)),
      line("salt", 0.125, "tsp", tspJar(0.125)),
      line("bread_cubes", 8, "cup", 1, "dried"),
      line("chicken_broth", 0.75, "cup", 0.75 / 4), // a 4-cup box
    ],
    steps: [
      {
        id: "chop", name: "Cut onion and celery", kind: "hands_on", dayOffset: -1, dayOrder: 40,
        durationMin: 30, // TODO(host): confirm
        instructions: "Finely chop {celery} and {onion}. Refrigerate.",
      },
      {
        id: "dry_bread", name: "Dry the bread cubes", kind: "hands_on", dayOffset: -1, dayOrder: 45,
        durationMin: 15, // TODO(host): confirm
        instructions: "Cube {bread_cubes} and spread it out to dry overnight.",
      },
      {
        // floating: it can be done any time earlier in the day, in a gap between other jobs (see the scheduler).
        id: "mix", name: "Mix stuffing", kind: "hands_on", dayOffset: 0, floating: true,
        durationMin: 20, // TODO(host): confirm
        instructions:
          "Cook the onion and celery in {butter} until tender, without browning. Add {poultry_seasoning}, {salt} and " +
          "{pepper}. Toss with the bread cubes, then add {chicken_broth} to moisten and toss lightly. If you make it " +
          "ahead, let it cool, then cover and refrigerate it until it goes in the oven.",
      },
      // TODO(host): confirm. Card says 40-45 min at 325°F, covered for the first 30 minutes.
      bake("bake", "Bake stuffing", 325, 45, 2,
        "Bake in a casserole dish at 325°F for 40-45 minutes. Cover for the first 30 minutes, then uncover."),
    ],
    notes: "",
    history: [
      { year: 2016, text: "2 loaves made for stuffing" },
      { year: 2011, text: "3 loaves homemade white, 1 loaf store-bought stuffing bread" },
    ],
  },

  green_bean_casserole: {
    id: "green_bean_casserole",
    name: "Green Bean Casserole",
    category: "side",
    servesBase: 8, // TODO(host): confirm. Chosen so 13.5 guests -> 2 batches.
    tags: [],
    serve: { temp: "hot", holdMin: 30 },
    ingredients: [
      // 4 cans per batch (RecipeCalc tab). The Recipe Card says 2, but the host chose to keep 4 (OPEN_QUESTIONS.md).
      line("green_beans", 4, "can", 4),
      line("butter", 2, "TB", stickPkg(0.25)),
      line("flour", 3, "TB", tbFlour(3)),
      line("sour_cream", 1, "pint", 1),
      line("grated_swiss", 1, "lb", 1),
      line("minced_onion", 1, "TB", tspJar(3)),
      line("sugar", 1, "TB", sugarBag(1 / 16)),
      line("salt", 1, "tsp", tspJar(1)),
      line("pepper", 1, "dash", tspJar(0.125)),
      line("corn_flakes", 4, "cup", 0.5, "crushed"),
    ],
    steps: [
      {
        id: "grate", name: "Grate the Swiss", kind: "hands_on", dayOffset: -1, dayOrder: 40,
        durationMin: 15, // TODO(host): confirm
        instructions: "Grate the Swiss cheese ({grated_swiss}); skip this if you bought it pre-grated. Refrigerate.",
      },
      {
        // floating: the host says the sauce can be made earlier, in a gap between other jobs (see the scheduler).
        id: "sauce", name: "Make cheese sauce", kind: "hands_on", dayOffset: 0, floating: true,
        durationMin: 20, // TODO(host): confirm
        instructions:
          "Drain {green_beans} and put them in a casserole dish. Melt {butter} and stir in {flour}. Add {sugar}, {salt}, " +
          "{pepper}, {minced_onion}, the cheese and {sour_cream}, and cook until melted. Pour over the beans and top " +
          "with {corn_flakes}. If you make it ahead, cover and refrigerate it, and add the corn flakes just before it " +
          "goes in the oven.",
      },
      bake("bake", "Bake casserole", 375, 15, 2, "Bake in a casserole dish at 375°F for 15 minutes, until bubbling."),
    ],
    notes: "Melt the cheese on the stove.",
    history: [
      { year: 2016, text: "1 pan made, forgot!" },
      { year: 2011, text: "2 lbs Swiss (block)" },
    ],
  },

  garlic_mashed_potatoes: {
    id: "garlic_mashed_potatoes",
    name: "Garlic Mashed Potatoes",
    category: "side",
    servesBase: 6, // DESIGN section 9: 13.5 guests -> 3 batches
    tags: [],
    serve: { temp: "hot", holdMin: 30 },
    ingredients: [
      line("russet_potatoes", 3.5, "lb", 3.5, "peeled and diced"),
      line("kosher_salt", 2, "TB", 2 / 48), // a 3 lb box is about 48 TB
      line("half_and_half", 2, "cup", 1), // 1 pint = 2 cups
      line("garlic", 6, "cloves", 0.6, "crushed"), // a head is about 10 cloves
      line("parmesan", 6, "oz", 6, "grated"),
    ],
    steps: [
      {
        // floating: peeled potatoes keep in cold water, so this can be done earlier in the day.
        id: "peel", name: "Peel and dice the potatoes", kind: "hands_on", dayOffset: 0, floating: true,
        durationMin: 20, // TODO(host): confirm
        instructions: "Peel and dice {russet_potatoes}, all about the same size. Put them in a large saucepan with {kosher_salt} and cover with water. If you do this ahead, keep the pot of cold water in the fridge.",
      },
      {
        id: "boil", name: "Boil the potatoes", kind: "passive", dayOffset: 0,
        durationMin: 25, // TODO(host): confirm
        instructions:
          "Bring to a boil over medium-high heat, then keep a rolling boil until the potatoes fall apart when poked with a " +
          "fork. Meanwhile heat {half_and_half} with {garlic} until simmering, then set aside.",
      },
      {
        id: "mash", name: "Mash the potatoes", kind: "hands_on", dayOffset: 0,
        durationMin: 10, // TODO(host): confirm
        instructions: "Drain and mash the potatoes. Stir in the garlic cream and {parmesan}. Let stand 5 minutes to thicken, then serve.",
      },
    ],
    notes: "",
    history: [
      { year: 2015, text: "10 lbs potatoes" },
      { year: 2011, text: "5 lb bag russet organic potatoes" },
    ],
  },

  sugared_cranberries: {
    id: "sugared_cranberries",
    name: "Sugared Cranberries",
    category: "side",
    servesBase: 14,
    tags: [],
    serve: { temp: "room", holdMin: 600 },
    ingredients: [
      line("fresh_cranberries", 1, "bag", 1),
      // ASSUMPTION: 2 cups sugar (1 for the syrup, 1 for coating) per the Recipe Card. RecipeCalc says 1.
      line("sugar", 2, "cup", sugarBag(2)),
      line("water", 1, "cup", 0),
    ],
    steps: [
      {
        id: "soak", name: "Make syrup and soak the cranberries", kind: "hands_on", dayOffset: -1, dayOrder: 10, // first: it soaks for 6 hours
        durationMin: 15, // TODO(host): confirm
        instructions:
          "Put {fresh_cranberries} in a large bowl. Boil half of the {sugar} with {water} and whisk until dissolved. " +
          "Cool 5 minutes, pour over the berries and stir. Leave them 6 hours, and do this first thing so they are ready " +
          "to drain in the afternoon.",
      },
      {
        // The workbook's task list drains them at 1:00 PM the day before. That takes the job out of Thursday's busy hours.
        id: "drain", name: "Drain and dry the cranberries", kind: "hands_on", dayOffset: -1, dayOrder: 60,
        durationMin: 15, // TODO(host): confirm. The 2 hours of drying afterward is not scheduled.
        instructions:
          "About 6 hours after soaking, drain the cranberries from the syrup, toss them with the other half of the sugar, " +
          "and spread them on parchment. Let them dry at least 2 hours, then store them covered until Thursday.",
      },
    ],
    notes: "Start the night before.",
    history: [],
  },

  cranberry_jello_salad: {
    id: "cranberry_jello_salad",
    name: "Cranberry Jello Salad",
    category: "side",
    servesBase: 14,
    tags: [],
    serve: { temp: "cold", holdMin: 600 },
    ingredients: [
      line("fresh_cranberries", 0.5, "bag", 0.5),
      line("mandarin_oranges", 1, "can", 1),
      line("crushed_pineapple", 1, "can", 1),
      line("cherry_jello", 2, "pkg", 2),
      line("sugar", 0.5, "cup", sugarBag(0.5)),
      line("water", 0.75, "cup", 0, "boiling"),
    ],
    steps: [
      {
        id: "prepare", name: "Prepare and chill the salad", kind: "hands_on", dayOffset: -1,
        durationMin: 30, // TODO(host): confirm
        instructions:
          "Chop {mandarin_oranges} and {fresh_cranberries} and combine. Add {crushed_pineapple} and {sugar}, and mix well. " +
          "Dissolve {cherry_jello} in {water} and cool until it starts to set. Stir in the fruit, pour into a mold and chill.",
      },
    ],
    notes: "",
    history: [],
  },

  sweet_potatoes: nameOnly("sweet_potatoes", "Sweet Potatoes", "side", "pan", "pans"), // workbook: 1 pan
  fruit_dish: nameOnly("fruit_dish", "Fruit Dish", "side", "dish", "dishes"), // workbook: 1 dish
  salad: nameOnly("salad", "Salad", "side", "salad", "salads"), // workbook: 1 salad

  gravy: {
    id: "gravy",
    name: "Gravy",
    category: "side",
    servesBase: 14,
    tags: [],
    serve: { temp: "hot", holdMin: 30 },
    ingredients: [
      // From the Turkey tab's gravy notes. TODO(host): confirm amounts.
      line("cornstarch", 0.25, "cup", 4 / 48),
      line("salt", 1, "tsp", tspJar(1)),
      line("pepper", 1, "tsp", tspJar(1)),
      line("sage", 1, "tsp", tspJar(1)),
      line("thyme", 2, "sprigs", 0.25),
    ],
    steps: [
      {
        id: "make", name: "Make the gravy", kind: "hands_on", dayOffset: 0,
        durationMin: 20, // TODO(host): confirm
        after: "turkey.cook", // needs the drippings
        instructions:
          "Scrape the drippings into a skillet and ladle off the extra fat. Dissolve {cornstarch} in a little water, then stir " +
          "it in slowly until the gravy is thick enough. Season with {salt}, {pepper}, {sage} and {thyme} to taste.",
      },
    ],
    notes: "Needs the turkey drippings.",
    history: [],
  },

  bread: {
    id: "bread",
    name: "Homemade Bread",
    category: "bread",
    servesBase: 7, // DESIGN section 9: 13.5 guests -> 2 batches
    tags: [],
    serve: { temp: "room", holdMin: 600 },
    // No order-ahead item. This is the homemade bread-machine loaf (Menu tab: "Make: Yes"). The
    // "Ordered ahead" note that sits on the Bread row is the TURKEY (the Menu tab's notes are shifted by a row).
    ingredients: [
      line("water", 1.0625, "cup", 0, "room temperature"),
      line("butter", 2, "TB", stickPkg(0.25)),
      line("nf_dry_milk", 2, "TB", 2 / 48),
      line("salt", 1.5, "tsp", tspJar(1.5)),
      line("sugar", 2, "TB", sugarBag(2 / 16)),
      line("bread_flour", 3, "cup", 0.25),
      line("yeast", 1, "packet", 1),
    ],
    steps: [
      {
        id: "start", name: "Start the bread machine", kind: "hands_on", dayOffset: 0,
        durationMin: 10, // from DESIGN section 9
        instructions: "Add {water}, {butter}, {nf_dry_milk}, {salt}, {sugar}, {bread_flour} and {yeast} to the bread machine, in that order.",
      },
      {
        id: "run", name: "Bread machine runs", kind: "passive", dayOffset: 0,
        durationMin: 180, // from DESIGN section 9
        instructions: "Let the machine finish. Cool the loaf on a rack before slicing.",
      },
    ],
    notes: "Basic white bread in the bread machine. Add ingredients in order.",
    history: [],
  },

  corn_bread: {
    id: "corn_bread",
    name: "Corn Bread",
    category: "bread",
    servesBase: 8, // DESIGN section 9: 13.5 guests -> 2 batches
    tags: [],
    serve: { temp: "hot", holdMin: 60 },
    ingredients: [
      line("corn_bread_mix", 1, "pkg", 1),
      line("egg", 1, "large", 1 / 12),
      line("orange", 1, "", 1, "zest"),
      // RecipeCalc: 1 "dust" = 0.5 cup brown sugar. A package is about 4 cups.
      line("dark_brown_sugar", 1, "dust", 0.5 / 4),
      line("applesauce", 1, "cup", 1 / 3), // a large jar is about 3 cups. TODO(host): confirm
    ],
    steps: [
      {
        id: "mix", name: "Mix the corn bread", kind: "hands_on", dayOffset: 0,
        durationMin: 10, // from DESIGN section 9
        instructions: "Mix {corn_bread_mix} as directed on the box, adding {applesauce}, {egg} and the zest of {orange}.",
      },
      // 400°F for 20 minutes. Jiffy's directions for an 8-inch pan are 400°F for 16 to 20 minutes.
      bake("bake", "Bake corn bread", 400, 20, 1, "Bake at 400°F for 20 minutes. Dust with {dark_brown_sugar} if you like."),
    ],
    notes: "Cook as directed. Add 1 cup applesauce to the mix and orange zest. Dust with brown sugar.",
    history: [{ year: 2015, text: "too much applesauce" }],
  },

  dinner_rolls: nameOnly("dinner_rolls", "Dinner Rolls", "bread", "dozen", "dozen", 8), // ASSUMPTION: the workbook has no size; a dozen feeds 8 at one and a half rolls each

  pretzel_dip: nameOnly("pretzel_dip", "Pretzel Dip", "appetizer", "bowl", "bowls"), // ASSUMPTION: the workbook has 0; one bowl feeds 14
  appetizer: nameOnly("appetizer", "Appetizer", "appetizer", "platter", "platters"), // ASSUMPTION: the workbook is blank; one platter feeds 14
  sugared_bacon: {
    id: "sugared_bacon",
    name: "Sugared Bacon",
    category: "appetizer",
    servesBase: 14,
    tags: [],
    serve: { temp: "room", holdMin: 120 },
    ingredients: [
      line("bacon", 1, "lb", 1),
      line("dark_brown_sugar", 2, "cup", 0.5),
      line("orange_flavor", 5, "drops", 0.125),
    ],
    steps: [
      {
        id: "prep", name: "Prep the bacon", kind: "hands_on", dayOffset: 0,
        durationMin: 10, // from DESIGN section 9
        instructions: "Line a rimmed baking sheet with foil and a wire rack. Toss {bacon} with {dark_brown_sugar} and {orange_flavor} and lay it on the rack.",
      },
      bake("bake", "Bake the bacon", 400, 30, 1, "Bake at 400°F for 30 minutes, or up to 40 for crisper bacon. Microwave 1 minute to crisp if you like."),
    ],
    notes: "Toss bacon in brown sugar and sprinkle on top. Bake on a rack over foil.",
    history: [],
  },
  pumpkin_soup: nameOnly("pumpkin_soup", "Pumpkin Soup", "other", "pot", "pots"), // workbook: 1 soup, shown as a pot

  pumpkin_pie_standard: {
    id: "pumpkin_pie_standard",
    name: "Pumpkin Pie (standard)",
    category: "dessert",
    servesBase: 14, // TODO(host): confirm
    tags: [],
    serve: { temp: "room", holdMin: 480 },
    ingredients: [
      // Store-bought crust (DESIGN section 9, OPEN_QUESTIONS #3).
      line("pie_crust", 1, "crust", 1),
      line("sugar", 0.75, "cup", sugarBag(0.75)),
      line("cinnamon", 1, "tsp", tspJar(1)),
      line("salt", 0.5, "tsp", tspJar(0.5)),
      line("ginger", 0.5, "tsp", tspJar(0.5)),
      line("cloves", 0.25, "tsp", tspJar(0.25)),
      line("egg", 2, "large", 2 / 12),
      line("pumpkin_can", 1, "can", 1),
      line("evaporated_milk", 1, "can", 1),
    ],
    steps: [
      {
        // The workbook's task list has "Make Pies" the evening before. The filling keeps in the fridge overnight.
        id: "fill", name: "Mix the pie filling", kind: "hands_on", dayOffset: -1, dayOrder: 26,
        durationMin: 10, // TODO(host): confirm
        instructions:
          "Combine {sugar}, {salt}, {cinnamon}, {ginger} and {cloves} in a small bowl. Beat {egg} lightly in a large bowl. " +
          "Stir in {pumpkin_can} and the sugar-spice mix, then gradually stir in {evaporated_milk}. Cover and refrigerate " +
          "until Thursday.",
      },
      {
        id: "bake", name: "Bake pie", kind: "cook", dayOffset: 0,
        // Card: 425°F for 15 min, then 350°F for 40-50 min. 45 is the middle. TODO(host): confirm
        cook: {
          equipmentType: "oven", slots: 1,
          stages: [{ tempF: 425, minutes: 15 }, { tempF: 350, minutes: 45 }],
        },
        instructions: "Pour the chilled filling into the unbaked pie shell. Bake at 425°F for 15 minutes, then reduce to 350°F and bake until a knife near the center comes out clean.",
      },
      {
        id: "cool", name: "Cool the pie", kind: "passive", dayOffset: 0,
        durationMin: 120,
        instructions:
          "Cool on a wire rack for 2 hours. Don't freeze (the crust separates from the filling). Then refrigerate it until " +
          "about an hour before serving: a pumpkin pie is an egg custard and shouldn't sit out more than 2 hours.",
      },
    ],
    notes: "",
    history: [
      { year: 2016, text: "3 pies, 1 libby, 1 from another recipe, 1 nutella swirl - used homeade crust for regular pies, gingersnap crust for nutella" },
      { year: 2011, text: "Libby's, store-bought pie shells" },
    ],
  },

  pumpkin_pie_sallys: {
    id: "pumpkin_pie_sallys",
    name: "Pumpkin Pie (Sally's)",
    category: "dessert",
    servesBase: 14, // TODO(host): confirm
    tags: [],
    serve: { temp: "room", holdMin: 480 },
    ingredients: [
      // Filling
      line("pumpkin_can", 2, "cup", 1), // one 15 oz can is the 2 cups on the card
      line("egg", 3, "large", 3 / 12),
      line("dark_brown_sugar", 1.25, "cup", 1.25 / 4),
      line("cornstarch", 1, "TB", 1 / 48),
      line("salt", 0.5, "tsp", tspJar(0.5)),
      line("cinnamon", 1.5, "tsp", tspJar(1.5)),
      line("ginger", 0.5, "tsp", tspJar(0.5)),
      line("nutmeg", 0.25, "tsp", tspJar(0.25)),
      line("cloves", 0.125, "tsp", tspJar(0.125)),
      line("pepper", 0.125, "tsp", tspJar(0.125)),
      line("heavy_cream", 1, "cup", 0.5), // 1 pint = 2 cups. RecipeCalc counts 1 "pkg" per cup; see OPEN_QUESTIONS
      line("milk", 0.25, "cup", 0.25 / 8),
      // Egg wash for the crust and leaves
      line("egg", 1, "large", 1 / 12, "beaten, for brushing"),
      line("milk", 1, "tsp", 0.005, "for the egg wash"),
      // Homemade crust (the full recipe makes 2: bottom plus leaf decoration)
      line("flour", 2.5, "cup", flourBag(2.5)),
      line("salt", 1.25, "tsp", tspJar(1.25)),
      line("butter", 6, "TB", stickPkg(0.75), "chilled, cubed"),
      line("shortening", 0.75, "cup", 0.75 / 3, "chilled"), // a can is about 3 cups
      line("water", 0.5, "cup", 0, "ice water"),
      // The sugared cranberries for decoration are not listed here. They come from the
      // Sugared Cranberries dish, which is also on the menu. Listing them here would buy them twice.
    ],
    steps: [
      {
        id: "crust", name: "Make the pie crust", kind: "hands_on", dayOffset: -1, dayOrder: 20, // early: it chills for 2 hours
        durationMin: 40, // from DESIGN section 9
        instructions:
          "Mix {flour} with the salt, then cut in {butter} and {shortening} until it looks like coarse meal. Drizzle in " +
          "{water} one tablespoon at a time until clumps form. Split in half, flatten into discs, wrap and refrigerate at " +
          "least 2 hours.",
      },
      {
        id: "filling", name: "Make the pie filling", kind: "hands_on", dayOffset: -1, dayOrder: 25,
        durationMin: 30, // from DESIGN section 9
        instructions:
          "Whisk {pumpkin_can}, {egg} and {dark_brown_sugar}. Add {cornstarch}, {salt}, {cinnamon}, {ginger}, {nutmeg}, " +
          "{cloves}, {pepper}, {heavy_cream} and {milk} and whisk hard. Cover and refrigerate overnight.",
      },
      // Card: heat to 350°F then up to 375°F, bake 55-60 minutes. OPEN_QUESTIONS #4: one stage, 375°F for 60.
      bake("bake", "Bake Sally's pie", 375, 60, 1,
        "Roll out the crust into a 9-inch deep dish pan and pre-bake it 10 minutes with pie weights. Pour in the filling " +
        "and bake at 375°F for 55-60 minutes. After about 25 minutes cover the crust edge with foil. The center should be " +
        "almost set, with a small wobble."),
      {
        id: "cool", name: "Cool the pie", kind: "passive", dayOffset: 0,
        durationMin: 120, // from DESIGN section 9. The card says 3 hours in all: the rest is done in the fridge (see below).
        instructions:
          "Cool on a wire rack for 2 hours, then refrigerate it to finish cooling (the card says at least 3 hours in all). " +
          "A pumpkin pie is an egg custard and shouldn't sit out more than 2 hours. Take it out about an hour before " +
          "serving and decorate with the sugared cranberries and pie crust leaves.",
      },
    ],
    notes: "Crust and filling can be made the night before. Pie bakes at 375°F. Decorate with the Sugared Cranberries dish.",
    history: [
      { year: 2015, text: "3 pies, fresh crusts, 2 recipes - leaves and sugared cranberries" },
    ],
  },

  pumpkin_brulee: {
    id: "pumpkin_brulee",
    name: "Pumpkin Brulee",
    category: "dessert",
    servesBase: 14,
    tags: [],
    serve: { temp: "room", holdMin: 480 },
    ingredients: [
      line("heavy_cream", 1.5, "cup", 0.75),
      line("milk", 0.5, "cup", 0.5 / 8),
      line("cinnamon", 0.125, "tsp", tspJar(0.125)),
      line("nutmeg", 2, "pinches", tspJar(0.25)),
      line("ginger", 1, "pinch", tspJar(0.125)),
      line("cloves", 1, "pinch", tspJar(0.125)),
      line("egg", 4, "large", 4 / 12, "yolks only"),
      line("sugar", 0.5, "cup", sugarBag(0.5)),
      line("pumpkin_can", 0.25, "cup", 0.25 / 2),
      line("coarse_sugar", 0.33, "cup", 0.33 / 3), // a box is about 3 cups
    ],
    steps: [
      // The card says 30 to 40 minutes at 300°F and its note says an extra 10 minutes was needed, so 45.
      // TODO(host): confirm by the jiggle test. The mixing is in these instructions but not scheduled separately.
      // 2 slots is a guess for a water bath pan.
      bake("bake", "Bake the brulee", 300, 45, 2,
        "Heat {heavy_cream}, {milk}, {cinnamon}, {nutmeg}, {ginger} and {cloves} until it boils, then steep 15 minutes. " +
        "Whisk the yolks of {egg} with {sugar}, whisk in the cream, then {pumpkin_can}. Pour into 4 ramekins in a hot " +
        "water bath. Bake in the center of the oven at 300°F (315°F on convection) until almost set but still soft in the " +
        "middle, 30 to 40 minutes on the card."),
      {
        // The card says cool 15 minutes, then chill at least 2 hours before serving. Without this
        // step the brulee would be baked right before dinner.
        id: "chill", name: "Cool and chill the brulee", kind: "passive", dayOffset: 0,
        durationMin: 135, // 15 minutes cooling + 2 hours chilling, from the Recipe Card
        instructions:
          "Cool 15 minutes, cover each ramekin tightly with plastic wrap and refrigerate at least 2 hours (up to 24). " +
          "Just before serving, top with {coarse_sugar} and broil 1 to 2 minutes (or use a kitchen torch).",
      },
    ],
    notes: "On convection add 10 minutes and use 315°F.",
    history: [],
  },

  whipped_cream: {
    id: "whipped_cream",
    name: "Whipped Cream",
    category: "dessert",
    servesBase: 14,
    tags: [],
    serve: { temp: "cold", holdMin: 120 },
    ingredients: [
      line("heavy_cream", 1, "cup", 0.5),
      line("sugar", 2, "TB", sugarBag(2 / 16)),
    ],
    steps: [
      {
        id: "whip", name: "Whip the cream", kind: "hands_on", dayOffset: 0,
        durationMin: 10, // from DESIGN section 9
        instructions: "Chill the bowl and beaters. Beat {heavy_cream} with {sugar} until stiff peaks form.",
      },
    ],
    notes: "Chill the bowl and paddle first.",
    history: [],
  },

  another_dessert: nameOnly("another_dessert", "Another Dessert", "dessert", "dessert", "desserts"), // ASSUMPTION: the workbook is blank; one feeds 14
};
