import type { MicronutrientKey } from '@/core/types'

/**
 * Plain-language "what it is / what it does" for each nutrient.
 * Benefits are worded from the EU's authorised health claims (Reg. (EU) No 432/2012), simplified;
 * limits follow EFSA/EU advice. Short on purpose — this is orientation, not medical advice.
 */
export interface NutrientAbout {
  /** One short line for lists. */
  short: string
  /** What it does, 1–2 plain sentences. */
  does: string
  /** Where to find it (or where it mostly comes from, for limits). */
  foods: string
}

export const NUTRIENT_INFO: Record<MicronutrientKey, NutrientAbout> = {
  vitaminA: { short: 'Eyes, skin and immunity', does: 'Helps keep your eyesight, skin and immune system working normally.', foods: 'Carrots, sweet potato, spinach, eggs, dairy' },
  vitaminC: { short: 'Immunity and iron absorption', does: 'Supports your immune system, helps make collagen for skin and gums, helps you absorb iron and reduces tiredness.', foods: 'Peppers, citrus, kiwi, strawberries, broccoli' },
  vitaminD: { short: 'Bones, muscles and immunity', does: 'The “sunshine vitamin”: helps you absorb calcium and keeps bones, teeth, muscles and the immune system working well.', foods: 'Oily fish, eggs, fortified foods — and sunlight on your skin' },
  vitaminE: { short: 'Protects your cells', does: 'An antioxidant that helps protect your cells from damage.', foods: 'Nuts, seeds, olive oil, avocado' },
  vitaminK: { short: 'Blood clotting and bones', does: 'Lets your blood clot normally when you cut yourself and helps keep bones strong.', foods: 'Leafy greens, broccoli, olive oil' },
  thiamin: { short: 'Turns food into energy', does: 'Helps turn the food you eat into energy and keeps your heart and nerves working normally.', foods: 'Whole grains, legumes, pork, seeds' },
  riboflavin: { short: 'Energy, skin and eyes', does: 'Helps release energy from food, keeps skin and eyes healthy and reduces tiredness.', foods: 'Milk, yogurt, eggs, almonds, mushrooms' },
  niacin: { short: 'Energy, nerves and skin', does: 'Helps release energy from food and keeps your nervous system and skin healthy; reduces tiredness.', foods: 'Chicken, fish, peanuts, whole grains' },
  pantothenicAcid: { short: 'Energy and focus', does: 'Helps release energy from food and supports normal mental performance.', foods: 'Found in most foods — eggs, mushrooms, avocado, whole grains' },
  vitaminB6: { short: 'Protein use, blood and nerves', does: 'Helps your body use protein, make red blood cells and keep nerves and immunity working; reduces tiredness.', foods: 'Fish, poultry, chickpeas, bananas, potatoes' },
  biotin: { short: 'Energy, hair and skin', does: 'Helps release energy from food and keeps hair and skin healthy.', foods: 'Eggs, nuts, seeds, legumes' },
  folate: { short: 'New cells and blood', does: 'Helps your body make new cells and healthy blood. Especially important before and during pregnancy.', foods: 'Leafy greens, legumes, asparagus, oranges' },
  vitaminB12: { short: 'Blood, nerves and energy', does: 'Needed for red blood cells and healthy nerves; reduces tiredness. Found almost only in animal foods — vegans need fortified foods or a supplement.', foods: 'Fish, meat, eggs, dairy, fortified plant drinks' },
  calcium: { short: 'Bones and teeth', does: 'Builds and keeps strong bones and teeth, and helps muscles and nerves work.', foods: 'Milk, yogurt, cheese, tofu, almonds, sardines' },
  iron: { short: 'Carries oxygen in your blood', does: 'Helps your blood carry oxygen around the body and reduces tiredness. Eat it with vitamin C to absorb more.', foods: 'Red meat, lentils, chickpeas, spinach, fortified cereals' },
  magnesium: { short: 'Muscles, nerves and energy', does: 'Keeps muscles and nerves working, supports bones and helps reduce tiredness.', foods: 'Nuts, seeds, whole grains, legumes, dark chocolate' },
  phosphorus: { short: 'Bones and energy', does: 'Works with calcium to keep bones and teeth strong and helps your cells make energy.', foods: 'Dairy, meat, fish, legumes, nuts' },
  potassium: { short: 'Muscles and blood pressure', does: 'Helps muscles and nerves work and supports healthy blood pressure.', foods: 'Fruit and vegetables, potatoes, beans, bananas' },
  sodium: { short: 'Keep it low — mostly from salt', does: 'Your body needs a little for fluid balance, but too much raises blood pressure. Most comes from salt and processed foods.', foods: 'Salt, bread, cured meats, cheese, ready meals, snacks' },
  zinc: { short: 'Immunity, skin and hair', does: 'Supports the immune system, healthy skin, hair and nails, and normal fertility.', foods: 'Meat, shellfish, legumes, seeds, nuts' },
  selenium: { short: 'Protects cells, thyroid', does: 'Helps protect your cells, keeps your thyroid and immune system working and supports hair and nails.', foods: 'Brazil nuts, fish, eggs, whole grains' },
  copper: { short: 'Iron use and immunity', does: 'Helps your body use iron, supports the immune system and gives colour to skin and hair.', foods: 'Nuts, seeds, shellfish, whole grains, dark chocolate' },
  manganese: { short: 'Bones and energy', does: 'Helps keep bones healthy, release energy from food and protect cells.', foods: 'Whole grains, nuts, legumes, tea' },
  iodine: { short: 'Thyroid and metabolism', does: 'Needed to make thyroid hormones, which run your metabolism, and supports normal brain function.', foods: 'Iodised salt, fish, seafood, dairy, eggs' },
  sugar: { short: 'Keep added sugars low', does: 'A quick source of energy. Too much — especially added sugars and sweet drinks — adds calories without nutrients and harms teeth.', foods: 'Sweets, soft drinks, pastries; natural sugars in fruit and milk' },
  saturatedFat: { short: 'Keep it low for your heart', does: 'Too much raises “bad” LDL cholesterol, which affects heart health. EFSA advises eating as little as possible in a balanced diet.', foods: 'Butter, fatty meat, cured meats, cheese, pastries, coconut and palm oil' },
}

export const MACRO_INFO = {
  calories: { does: 'The energy your body uses to breathe, think, move and stay warm.' },
  protein: { does: 'Builds and repairs muscles and other tissues, and helps keep bones healthy.', foods: 'Meat, fish, eggs, dairy, legumes, tofu' },
  carbs: { does: 'Your body’s main fuel, especially for the brain and for exercise. Choose whole grains when you can.', foods: 'Bread, pasta, rice, potatoes, fruit, legumes' },
  fat: { does: 'Gives energy, helps you absorb vitamins A, D, E and K and provides essential fats your body can’t make.', foods: 'Olive oil, nuts, seeds, avocado, oily fish' },
  fiber: { does: 'Keeps digestion regular and helps you feel full for longer.', foods: 'Whole grains, legumes, fruit, vegetables, nuts' },
} as const
