// Content for the Learn tab. Edit this file to change meal plans, facts, tips or myths;
// the app picks up changes automatically, no other code needs to change.
//
// Meal plan items are [name, calories, protein g, carbs g, fat g]. Values are approximate,
// based on USDA FoodData Central averages.

export const PLANS = [
  {
    id: "balanced",
    name: "Balanced",
    emoji: "⚖️",
    summary: "Even mix of lean protein, whole grains, fruit, vegetables and healthy fats. A steady, sustainable starting point.",
    meals: {
      breakfast: [
        ["Nonfat Greek yogurt (200 g)", 118, 20, 7, 0],
        ["Mixed berries (100 g)", 50, 1, 12, 0],
        ["Granola (2 tbsp, 25 g)", 115, 3, 16, 5],
      ],
      lunch: [
        ["Grilled chicken breast (120 g)", 198, 37, 0, 4],
        ["Mixed greens, cucumber & tomato", 40, 2, 8, 0],
        ["Chickpeas (½ cup)", 134, 7, 22, 2],
        ["Olive oil vinaigrette (1 tbsp)", 120, 0, 0, 14],
      ],
      dinner: [
        ["Baked salmon (120 g)", 250, 25, 0, 16],
        ["Quinoa (¾ cup cooked)", 166, 6, 29, 3],
        ["Roasted broccoli (150 g) with 1 tsp oil", 90, 4, 10, 5],
      ],
      snacks: [
        ["Apple (medium)", 95, 0, 25, 0],
        ["Peanut butter (1 tbsp)", 95, 4, 3, 8],
      ],
    },
    shopping: ["Nonfat Greek yogurt", "Frozen mixed berries", "Granola", "Chicken breast", "Salad greens, cucumber, tomatoes", "Canned chickpeas", "Olive oil", "Salmon fillets", "Quinoa", "Broccoli", "Apples", "Peanut butter"],
  },
  {
    id: "protein",
    name: "High protein",
    emoji: "💪",
    summary: "About 30% of calories from protein to keep you full and protect muscle while you lose fat. Pairs well with strength training.",
    meals: {
      breakfast: [
        ["3-egg veggie omelet", 240, 19, 5, 15],
        ["Whole-grain toast (1 slice)", 80, 4, 14, 1],
        ["Low-fat cottage cheese (½ cup)", 90, 12, 5, 2],
      ],
      lunch: [
        ["Turkey & hummus whole-wheat wrap", 325, 26, 28, 10],
        ["Baby carrots (1 cup)", 35, 1, 8, 0],
        ["Pear (medium)", 100, 1, 27, 0],
      ],
      dinner: [
        ["Lean sirloin stir-fry (120 g beef)", 200, 30, 0, 8],
        ["Stir-fry vegetables (200 g) with 1 tbsp oil", 190, 4, 14, 14],
        ["Brown rice (¾ cup cooked)", 165, 4, 34, 1],
      ],
      snacks: [
        ["Whey protein shake (1 scoop, water)", 120, 24, 3, 1],
        ["Banana (medium)", 105, 1, 27, 0],
        ["String cheese + 15 almonds", 185, 10, 4, 15],
      ],
    },
    shopping: ["Eggs", "Spinach, peppers, onions", "Whole-grain bread", "Cottage cheese", "Whole-wheat tortillas", "Sliced turkey breast", "Hummus", "Baby carrots", "Pears & bananas", "Lean sirloin", "Stir-fry vegetables", "Brown rice", "Whey protein", "String cheese", "Almonds"],
  },
  {
    id: "mediterranean",
    name: "Mediterranean",
    emoji: "🫒",
    summary: "Vegetables, legumes, fish, whole grains and olive oil. One of the best-studied eating patterns for heart health and long-term weight control.",
    meals: {
      breakfast: [
        ["Whole-grain toast (2 slices)", 160, 8, 28, 2],
        ["½ avocado + sliced tomato", 140, 3, 10, 11],
        ["Hard-boiled egg", 78, 6, 1, 5],
      ],
      lunch: [
        ["Lentil soup (1½ cups)", 270, 16, 40, 5],
        ["Side salad with feta (30 g) & 1 tsp olive oil", 150, 5, 6, 12],
      ],
      dinner: [
        ["Baked cod (150 g) with lemon & herbs", 135, 30, 0, 1],
        ["Roasted vegetables with 2 tsp olive oil", 160, 3, 18, 9],
        ["Whole-wheat couscous (½ cup cooked)", 90, 3, 19, 0],
      ],
      snacks: [
        ["Orange + 15 almonds", 167, 5, 18, 9],
        ["Hummus (3 tbsp) with cucumber & peppers", 130, 4, 12, 8],
      ],
    },
    shopping: ["Whole-grain bread", "Avocados", "Tomatoes", "Eggs", "Lentils (or lentil soup)", "Feta", "Salad greens", "Extra-virgin olive oil", "Cod fillets", "Zucchini, peppers, eggplant", "Whole-wheat couscous", "Oranges", "Almonds", "Hummus", "Cucumber"],
  },
  {
    id: "plant",
    name: "Plant-based",
    emoji: "🌱",
    summary: "Vegan and high in fiber. Beans, tofu, whole grains and soy milk cover your protein needs.",
    meals: {
      breakfast: [
        ["Overnight oats (½ cup oats)", 150, 5, 27, 3],
        ["Soy milk (1 cup)", 100, 7, 8, 4],
        ["Chia seeds (1 tbsp) + ½ cup berries", 95, 2, 13, 4],
      ],
      lunch: [
        ["Black beans (¾ cup)", 170, 11, 30, 1],
        ["Quinoa (½ cup cooked)", 111, 4, 20, 2],
        ["Corn, salsa & peppers", 70, 2, 15, 0],
        ["¼ avocado", 60, 1, 3, 5],
      ],
      dinner: [
        ["Firm tofu (150 g), pan-seared", 215, 24, 4, 13],
        ["Stir-fry vegetables with 1 tbsp oil", 190, 4, 14, 14],
        ["Brown rice (¾ cup cooked)", 165, 4, 34, 1],
      ],
      snacks: [
        ["Shelled edamame (½ cup)", 95, 9, 7, 4],
        ["Clementine", 35, 1, 9, 0],
        ["Dark chocolate 70% (20 g)", 110, 1, 9, 8],
      ],
    },
    shopping: ["Rolled oats", "Soy milk", "Chia seeds", "Frozen berries", "Canned black beans", "Quinoa", "Frozen corn & salsa", "Avocado", "Firm tofu", "Stir-fry vegetables", "Brown rice", "Frozen edamame", "Clementines", "Dark chocolate"],
  },
  {
    id: "budget",
    name: "Quick & budget",
    emoji: "⏱️",
    summary: "Pantry staples and 15-minute meals, with nothing fancy to buy. Good for busy weeks.",
    meals: {
      breakfast: [
        ["2 scrambled eggs", 180, 12, 2, 14],
        ["Whole-grain toast with 1 tbsp peanut butter", 175, 8, 17, 9],
        ["Banana (medium)", 105, 1, 27, 0],
      ],
      lunch: [
        ["Tuna sandwich (1 can tuna, light mayo, whole-grain bread)", 350, 38, 28, 8],
        ["Lettuce, tomato & baby carrots", 50, 2, 11, 0],
      ],
      dinner: [
        ["Sheet-pan chicken thighs, skinless (120 g)", 215, 29, 0, 10],
        ["Roasted potatoes (200 g) with 1 tsp oil", 200, 4, 40, 5],
        ["Frozen green beans (1 cup)", 40, 2, 8, 0],
      ],
      snacks: [
        ["Air-popped popcorn (3 cups)", 93, 3, 19, 1],
        ["Skim milk (1 cup)", 90, 8, 12, 0],
      ],
    },
    shopping: ["Eggs", "Whole-grain bread", "Peanut butter", "Bananas", "Canned tuna", "Light mayo", "Lettuce, tomatoes, baby carrots", "Chicken thighs", "Potatoes", "Frozen green beans", "Popcorn kernels", "Skim milk"],
  },
];

export const FACTS = [
  { emoji: "🔥", title: "Not all calories cost the same", text: "Your body burns roughly 20–30% of protein's calories just digesting it, compared with about 5–10% for carbs and 0–3% for fat." },
  { emoji: "🧮", title: "Calories per gram", text: "Protein and carbohydrates have 4 kcal per gram, alcohol 7, and fat 9. That's why oils and nuts add up quickly." },
  { emoji: "🌾", title: "The fiber gap", text: "Adults need roughly 25–38 g of fiber a day, but most Americans get only about 15 g. Beans, berries, oats and vegetables close the gap." },
  { emoji: "⚖️", title: "The 3,500-calorie rule is too simple", text: "A pound of body fat stores about 3,500 kcal, but cutting 500 kcal a day usually gives less than 1 lb a week over time, because your body adapts. Expect progress to slow and keep going anyway." },
  { emoji: "🥑", title: "Avocado vs. banana", text: "Per 100 g, avocado has more potassium (about 485 mg) than banana (about 358 mg)." },
  { emoji: "🧊", title: "Frozen is fine", text: "Frozen fruits and vegetables are picked ripe and frozen within hours, so they are often as nutritious as fresh ones, and cheaper." },
  { emoji: "🥣", title: "Oats and cholesterol", text: "Oats contain beta-glucan, a soluble fiber shown to lower LDL (“bad”) cholesterol." },
  { emoji: "🫘", title: "Lentils pack a punch", text: "One cup of cooked lentils gives about 18 g of protein and 15 g of fiber for roughly 230 kcal." },
  { emoji: "🥤", title: "Hidden sugar in soda", text: "A 12-oz can of soda has about 39 g of sugar, close to 10 teaspoons and more than a day's recommended limit for many adults." },
  { emoji: "🍬", title: "Added sugar limits", text: "The American Heart Association suggests no more than 25 g of added sugar a day for women and 36 g for men." },
  { emoji: "🧂", title: "Where salt really comes from", text: "More than 70% of the sodium Americans eat comes from packaged and restaurant food, not the salt shaker. The daily limit is 2,300 mg." },
  { emoji: "🥚", title: "Egg basics", text: "One large egg has about 6 g of high-quality protein and 70–80 kcal." },
  { emoji: "🥛", title: "Greek vs. regular yogurt", text: "Straining makes Greek yogurt thicker, with about twice the protein of regular yogurt." },
  { emoji: "🥜", title: "Nuts are small but dense", text: "One ounce of almonds (about 23 nuts) has about 164 kcal. They're healthy, but measure your portion." },
  { emoji: "🧃", title: "Liquid calories don't fill you up", text: "Juice, soda, sweet coffee drinks and alcohol add calories without the fullness of solid food." },
  { emoji: "😴", title: "Sleep and hunger", text: "Short sleep is linked to more ghrelin (hunger hormone) and less leptin (fullness hormone), which makes cravings harder to resist." },
  { emoji: "🏋️", title: "Keep your muscle", text: "Strength training at least twice a week, plus enough protein, helps make sure the weight you lose is mostly fat, not muscle." },
  { emoji: "🅰️", title: "What Nutri-Score means", text: "The A–E badge on products rates overall nutritional quality within a food category. A (dark green) is best and E (red) is least favorable." },
  { emoji: "❤️", title: "Small losses, big benefits", text: "Losing just 5–10% of your body weight can improve blood pressure, blood sugar and cholesterol." },
  { emoji: "🍉", title: "Eat more, weigh less", text: "Water-rich foods like soups, salads, fruit and vegetables add volume and fullness for very few calories." },
];

export const TIPS = [
  {
    title: "Weight loss basics",
    emoji: "🎯",
    items: [
      "Aim to lose 0.5–2 lb (0.25–1 kg) a week. Slower loss is easier to keep off.",
      "A moderate deficit of 250–500 kcal a day is enough. Very low-calorie diets backfire for most people.",
      "Weigh yourself at the same time each day and focus on the weekly trend, not daily swings.",
      "Log honestly, including oils, sauces and drinks. They're the most common blind spots.",
      "Expect plateaus. Keep going, or review your portions and activity after 2–3 flat weeks.",
    ],
  },
  {
    title: "Build a better plate",
    emoji: "🍽️",
    items: [
      "Fill half your plate with vegetables, a quarter with lean protein and a quarter with whole grains or starch.",
      "Include protein at every meal (20–40 g) to stay full longer.",
      "Choose whole fruit over juice for the fiber.",
      "Cook with measured oil: use a teaspoon, not a free pour.",
      "Swap refined grains for whole grains: brown rice, whole-wheat pasta, oats.",
    ],
  },
  {
    title: "Hunger & cravings",
    emoji: "🍫",
    items: [
      "Don't skip meals and then overeat later. Regular meals keep hunger predictable.",
      "Keep easy, high-protein snacks around: Greek yogurt, eggs, edamame, cottage cheese.",
      "Eat slowly. Fullness signals take about 20 minutes to reach your brain.",
      "Plan treats instead of banning them. Small, planned portions beat all-or-nothing binges.",
      "Keep tempting foods out of sight and fruit where you can see it.",
    ],
  },
  {
    title: "Eating out",
    emoji: "🥡",
    items: [
      "Check the menu ahead of time and decide before you're hungry.",
      "Ask for dressings and sauces on the side.",
      "Choose grilled, baked or steamed over fried or creamy.",
      "Box half the meal right away. Restaurant portions are often two servings.",
      "Start with a broth soup or salad to take the edge off hunger.",
    ],
  },
  {
    title: "Sleep, stress & movement",
    emoji: "🧘",
    items: [
      "Aim for 7–9 hours of sleep. Tired brains crave high-calorie food.",
      "Walk after meals. Even 10 minutes helps blood sugar.",
      "Try to get about 150 minutes of moderate activity a week, plus strength training twice a week.",
      "Notice stress eating and have a non-food option ready: a walk, a call, or breathing exercises.",
      "Daily steps (NEAT) add up. Take stairs, park farther away, stand while on calls.",
    ],
  },
  {
    title: "Hydration",
    emoji: "💧",
    items: [
      "Drink a glass of water before each meal.",
      "Keep a reusable bottle in sight as a reminder.",
      "Flavor water with lemon, cucumber or berries instead of sugary drinks.",
      "Tea and coffee count toward fluids. Watch the sugar and cream.",
      "Pale-yellow urine is a simple sign you're hydrated.",
    ],
  },
];

export const MYTHS = [
  { myth: "Carbs make you gain weight.", fact: "Eating more calories than you burn causes weight gain, whatever the source. Whole-food carbs like fruit, beans and whole grains fit well in a weight-loss plan." },
  { myth: "Eating after 8 p.m. causes weight gain.", fact: "Total daily intake matters far more than timing. Late-night eating only becomes a problem when it adds extra snacks on top of your day." },
  { myth: "You can burn belly fat with crunches.", fact: "You can't spot-reduce fat. Overall fat loss through diet and activity shrinks every area, and core exercises strengthen the muscle underneath." },
  { myth: "Detox teas and cleanses flush out fat.", fact: "Your liver and kidneys already detox your body. Cleanses mostly cause water loss, which comes back." },
  { myth: "Fat-free means healthy.", fact: "Many fat-free products add sugar to replace flavor. Check the label, and remember that healthy fats keep you full." },
  { myth: "Skipping breakfast slows your metabolism.", fact: "Meal timing doesn't change metabolism much. Eat breakfast if it helps you avoid overeating later, and skip it if it doesn't." },
];
