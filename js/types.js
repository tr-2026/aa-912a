// Data shapes, described with JSDoc so editors can check them. No runtime code here.
// Times are integers: minutes since midnight Thursday. Temperatures are Fahrenheit.

/**
 * @typedef {Object} Equipment
 * @property {string} id
 * @property {string} name
 * @property {"oven"|"air_fryer"|"slow_cooker"|"stovetop"|"other"} type
 * @property {number} slots            How much fits at once (full oven = 4).
 * @property {number|null} minTempF    null when the equipment has no temperature.
 * @property {number|null} maxTempF
 */

/**
 * @typedef {Object} PlanItem
 * @property {string} recipeId
 * @property {boolean} included
 * @property {number} batches
 * @property {boolean} batchesOverride  true = host set batches by hand.
 * @property {string} who
 * @property {string} notes
 * @property {"guest"} [source]         Present when a guest brings the dish: no jobs and no groceries for it.
 */

/**
 * A dish the host added on the Dishes screen. logic/dishes.js turns it into a Recipe each time it is needed.
 * @typedef {Object} OwnDish
 * @property {string} id                "own_1", "own_2" ... Also the recipeId of its menu line.
 * @property {string} name
 * @property {"side"|"bread"|"appetizer"|"dessert"|"other"} category
 * @property {boolean} oven             true = it bakes on Thursday and is put on the schedule.
 * @property {boolean} hot              Served hot (finishes just before dinner) or at room temperature.
 * @property {number} [tempF]           Only when oven is true.
 * @property {number} [minutes]         Minutes in the oven. Only when oven is true.
 * @property {number} [prepMin]         Minutes of work before it goes in. Only when oven is true.
 * @property {{name: string, qty: number, unit: string}[]} [shopping]  Optional things to buy for the dish. They are on the shopping list while the dish is on the menu and not brought by a guest.
 */

/**
 * A dish's "note for this year", kept when next year's plan is started.
 * @typedef {Object} PastNote
 * @property {number} year
 * @property {string} recipeId
 * @property {string} text
 */

/**
 * @typedef {Object} Settings
 * @property {string} wakeTime          "06:00"
 * @property {number} readyBufferMin
 * @property {number} loadMin
 * @property {number} unloadMin
 * @property {number} tempToleranceF
 * @property {number} transitionMin
 * @property {number} preheatMin
 * @property {number} kidFactor
 * @property {number} lbPerPerson
 * @property {number} thawLbPerDay
 * @property {number} thawBufferDays
 */

/**
 * @typedef {Object} TurkeyOptions
 * @property {number} weightLb
 * @property {boolean} frozen
 * @property {boolean} stuffed
 * @property {boolean} convection
 * @property {"per_lb"|"step_down"} method
 */

/**
 * @typedef {Object} CustomItem
 * @property {string} id
 * @property {string} name
 * @property {number} qty
 * @property {string} unit
 * @property {string} store
 * @property {"week_before"|"day_before"|"anytime"} buyWhen
 */

/**
 * @typedef {Object} Cook
 * @property {string} id
 * @property {string} name
 */

/**
 * Optional helper cooks. When `enabled` is false the first cook does everything.
 * @typedef {Object} Helpers
 * @property {boolean} enabled
 * @property {Cook[]} cooks             At least one. The first is the main cook.
 */

/**
 * Which setup questions the host has answered. The schedule and shopping list wait for both.
 * @typedef {Object} Confirmed
 * @property {boolean} people   guests and cooks confirmed
 * @property {boolean} menu     menu confirmed
 */

/**
 * The only thing the user saves.
 * @typedef {Object} Plan
 * @property {number} schemaVersion
 * @property {number} year
 * @property {string} dinnerTime        "16:00" (24-hour); converted to minutes at the edge.
 * @property {number} adults
 * @property {number} kids
 * @property {TurkeyOptions} turkey
 * @property {Equipment[]} equipment
 * @property {Helpers} helpers
 * @property {Object<string, string[]>} owners    "recipeId" or "recipeId.stepId" -> cook ids. A step key beats its dish key.
 * @property {Object<string, "air_fryer"|"slow_cooker">} cookWith  recipeId -> the small appliance that dish cooks in. A dish not listed uses the oven.
 * @property {Object<string, number>} holds      recipeId -> minutes a dish may sit covered. Replaces the seed's standard for this plan.
 * @property {Confirmed} confirmed
 * @property {PlanItem[]} menu
 * @property {Object<string, boolean>} haveIt     ingredientId -> true
 * @property {Object<string, boolean>} checked    ingredientId -> true
 * @property {string} notes
 * @property {Object<string, Object>} overrides   "recipeId.stepId" -> { durationMin?, stages? }
 * @property {CustomItem[]} customItems
 * @property {OwnDish[]} ownDishes                 Dishes the host added.
 * @property {PastNote[]} pastNotes                Dish notes from earlier years.
 * @property {Object<string, boolean>} done       "recipeId.stepId" -> true
 * @property {string|null} lastBackupAt           ISO timestamp of last Export.
 * @property {Settings} settings
 */

/**
 * One thing you can buy (seed data, read-only at runtime).
 * @typedef {Object} Ingredient
 * @property {string} id
 * @property {string} name
 * @property {string} groceryUnit       stick, bunch, can, pkg, lb, dozen ...
 * @property {number} roundTo           Totals round UP to a multiple of this.
 * @property {string} store
 * @property {string} brand
 * @property {"week_before"|"day_before"|"anytime"} buyWhen
 * @property {number} sort
 * @property {boolean} staple
 * @property {boolean} [skipShopping]        true = never on the list (water).
 * @property {boolean} [qtyFromTurkeyWeight] true = list shows plan.turkey.weightLb.
 */

/**
 * One line of one recipe.
 * @typedef {Object} RecipeIngredient
 * @property {string} ingredientId
 * @property {number} qty               As written on the recipe card.
 * @property {string} unit              Unit on the recipe card ("TB", "cup").
 * @property {number} groceryQty        The same amount in the ingredient's groceryUnit, per batch.
 * @property {string} [prep]            "melted", "chopped" ...
 */

/**
 * @typedef {Object} Stage
 * @property {number} tempF
 * @property {number} minutes
 * @property {number} [toleranceF]
 */

/**
 * @typedef {Object} Step
 * @property {string} id
 * @property {string} name
 * @property {"hands_on"|"passive"|"cook"} kind
 * @property {number} dayOffset         0 = Thursday, -1 = Wednesday ...
 * @property {number} [durationMin]     hands_on and passive steps.
 * @property {{equipmentType: string, slots: number, stages?: Stage[], stagesFrom?: "turkey"}} [cook]
 * @property {number} [dayOrder]   for a job before Thursday: where it goes among the day's jobs (smaller is earlier; default 50)
 * @property {boolean} [floating]
 * @property {boolean} [edited]         Set by overrides.js when the host changed this step.
 * @property {string} [after]           e.g. "turkey.cook"
 * @property {{offsetMin: number, text: string, kind?: "probe"|"custom"}} [reminder]  offsetMin is from the end of the cooking (cook steps) or of the step.
 * @property {string} instructions      May contain {ingredientId} placeholders.
 */

/**
 * @typedef {Object} Recipe
 * @property {string} id
 * @property {string} name
 * @property {"main"|"side"|"dessert"|"bread"|"appetizer"|"other"} category
 * @property {{one: string, many: string, step?: number}} [unit]  what one batch is called ("pan", "pans") and the smallest change in the amount (0.5); omitted means "batch", in whole batches
 * @property {number} servesBase
 * @property {string[]} tags
 * @property {{temp: "hot"|"room"|"cold", holdMin: number}} serve
 * @property {RecipeIngredient[]} ingredients
 * @property {Step[]} steps
 * @property {string} notes
 * @property {{year: number, text: string}[]} history
 * @property {{daysBefore?: number, text: string}} [orderAhead]  daysBefore is left out for a dish that thaws; thaw.js works it out.
 * @property {boolean} [thaw]
 */

/**
 * Output of buildSchedule.
 * @typedef {Object} Schedule
 * @property {Object[]} thursday    { start, end, dishId, stepId, label, kind, equipmentId?, tempF?, instructions }
 * @property {Object[]} reminders   { at, kind, equipmentId?, dishId?, text }
 * @property {Object[]} holding     { dishId, from, to }
 * @property {Object[]} checklist   { dayOffset, date, dishId, stepId, label, durationMin, instructions }
 * @property {Object[]} conflicts   { dishId, reason, suggestions, placed? }. placed: true means the dish IS on the plan (only its oven preheat is too early).
 * @property {Object[]} warnings    soft risks: { kind: "busy", cookId, at, busyMin, windowMin, suggestions }
 */

export {};
