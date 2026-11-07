/**
 * Personal daily targets from body data, following EU / Spanish references.
 *
 * Energy  — EFSA NDA (2013) DRVs for energy: Average Requirement = REE × PAL, with REE from the
 *           Henry (2005) "Oxford" equations and PAL 1.4 / 1.6 / 1.8 / 2.0. Validated against EFSA's
 *           reference adults (e.g. man 18–29, 1.78 m, 69.7 kg → 1,670 kcal REE; woman 18–29,
 *           1.64 m, 59.2 kg → 1,338 kcal), see tests.
 * Weight  — Lose: EASO European Guidelines for Obesity Management in Adults (Yumuk et al., 2015):
 *           ~600 kcal/day deficit ≈ 0.5 kg/week. NICE NG246 (2025): 800–1,200 kcal/day diets only in
 *           specialist services, so intake is never set below max(REE, 1,200 kcal).
 *           Gain: +10 % of maintenance — the conservative end of the ~10–20 % surplus recommended by
 *           Iraki et al. (2019, Sports 7:154). No EU reference value exists for weight gain.
 * Protein — EFSA (2012): PRI 0.83 g/kg body weight/day for adults; intakes up to twice the PRI are
 *           considered safe. Losing or gaining: 1.2 g/kg — the lower bound of the 1.2–1.6 g/kg range
 *           that preserves lean mass during weight loss (Leidy et al., 2015, AJCN 101:1320S).
 *           Body weight: actual weight up to BMI 30; with obesity, ESPEN's adjusted body weight
 *           (weight at BMI 25 + ⅓ of the excess), as protein needs follow lean mass.
 * Fat / carbohydrate — EFSA (2010) reference intake ranges: fat 20–35 % E, carbohydrate 45–60 % E.
 *           Fat set to 30 % E; carbohydrate takes the remainder, kept within 45–60 % E.
 * Fibre   — EFSA (2010): 25 g/day adequate intake for adults.
 * Limits  — sodium 2 g/day (EFSA 2019); saturated fat ≤ 10 % of energy (WHO 2023; EFSA: "as low as
 *           possible"); total sugars scaled from the EU labelling Reference Intake (90 g at 2,000 kcal).
 *           WHO's < 10 % E applies to *free* sugars, which food data does not separate from total sugars.
 *
 * Predictive equations are estimates: Henry is within ±10 % of measured REE for roughly 65–75 % of
 * adults in validation studies, less for underweight or older people. Users should adjust if their
 * weight changes differently from what they intend.
 * Micros  — AESAN (2019) reference intakes for the Spanish population by sex and age.
 *
 * Pure function: no I/O. Informational only — not medical advice.
 */
import type { DailyGoals, PersonalTargets, UserProfile, LocalDate } from '../types/domain';
import type { NutrientId } from '../types/nutrients';
import { EFSA_FIBRE_AI_G, EFSA_SODIUM_LIMIT_MG, EU_REFERENCE_INTAKES, aesanMicronutrients } from '../constants/euReferenceIntakes';

export const KCAL_PER_MJ = 239.006; // 1 MJ = 239.006 kcal (thermochemical calorie, 4.184 kJ)

export const PAL_VALUES = { sedentary: 1.4, moderate: 1.6, active: 1.8, very_active: 2.0 } as const;

/** Henry (2005) REE equations, MJ/day = a × weight(kg) + b × height(m) + c. Age bands per Henry. */
const HENRY = {
  male: [
    { maxAge: 30, a: 0.06, b: 1.31, c: 0.473 },
    { maxAge: 60, a: 0.0476, b: 2.26, c: -0.574 },
    { maxAge: Infinity, a: 0.0478, b: 2.26, c: -1.07 },
  ],
  female: [
    { maxAge: 30, a: 0.0433, b: 2.57, c: -1.18 },
    { maxAge: 60, a: 0.0342, b: 2.1, c: -0.0486 },
    { maxAge: Infinity, a: 0.0356, b: 1.76, c: 0.0448 },
  ],
} as const;

export const WEIGHT_LOSS_DEFICIT_KCAL = 600;
export const WEIGHT_GAIN_SURPLUS_FRACTION = 0.1;
export const MIN_ENERGY_KCAL = 1200;
export const PROTEIN_PRI_G_PER_KG = 0.83;
export const PROTEIN_WEIGHT_CHANGE_G_PER_KG = 1.2;
export const FAT_PERCENT_ENERGY = 30;
export const SATURATED_FAT_MAX_PERCENT_ENERGY = 10;
/** ESPEN: adjusted body weight = ideal (BMI 25) + 0.33 × (actual − ideal), used from BMI 30. */
export const ESPEN_ADJUSTED_WEIGHT_FACTOR = 0.33;
export const MIN_ADULT_AGE = 18;

export const TARGET_SOURCES = [
  'EFSA (2013) Dietary Reference Values for energy — Henry (2005) equations × PAL',
  'EASO (2015) European Guidelines for Obesity Management in Adults — ~600 kcal/day deficit',
  'NICE NG246 (2025) Overweight and obesity management — low-energy diets only in specialist care',
  'Iraki et al. (2019) Sports 7:154 — ~10–20 % energy surplus for gaining',
  'EFSA (2012) Dietary Reference Values for protein — 0.83 g/kg body weight',
  'Leidy et al. (2015) AJCN 101:1320S — 1.2–1.6 g/kg protein preserves lean mass when losing weight',
  'ESPEN guideline on hospital nutrition — adjusted body weight for protein with obesity',
  'WHO (2023) Saturated and trans-fatty acid intake — saturated fat ≤ 10 % of energy',
  'EFSA (2010) Dietary Reference Values for fats and for carbohydrates & fibre',
  'EFSA (2019) Dietary Reference Values for sodium — 2 g/day',
  'AESAN (2019) Ingestas Nutricionales de Referencia para la población española',
  'Reg. (EU) 1169/2011 Annex XIII — Reference Intake for total sugars',
  'WHO BMI classification — underweight < 18.5, obesity ≥ 30',
];

export function ageOn(profile: Pick<UserProfile, 'birthYear'>, date: LocalDate): number {
  return Number(date.slice(0, 4)) - profile.birthYear;
}

/** Resting energy expenditure in kcal/day (Henry 2005). */
export function restingEnergyKcal(sex: UserProfile['sex'], age: number, weightKg: number, heightCm: number): number {
  const eq = HENRY[sex].find((e) => age < e.maxAge)!;
  return (eq.a * weightKg + eq.b * (heightCm / 100) + eq.c) * KCAL_PER_MJ;
}

export function computePersonalTargets(profile: UserProfile, date: LocalDate): PersonalTargets {
  const age = ageOn(profile, date);
  if (age < MIN_ADULT_AGE) throw new RangeError('Targets are only available for adults (18+)');
  const heightM = profile.heightCm / 100;
  const bmi = profile.weightKg / (heightM * heightM);
  const warnings: string[] = [];

  // Energy
  const restingKcal = restingEnergyKcal(profile.sex, age, profile.weightKg, profile.heightCm);
  const pal = PAL_VALUES[profile.activity];
  const maintenanceKcal = restingKcal * pal;
  let objective = profile.objective;
  if (objective === 'lose' && bmi < 18.5) {
    objective = 'maintain';
    warnings.push('Your BMI is below 18.5, so targets are set to maintain your weight rather than lose. Consider talking to a health professional.');
  }
  let energyKcal = maintenanceKcal + (objective === 'lose' ? -WEIGHT_LOSS_DEFICIT_KCAL : objective === 'gain' ? maintenanceKcal * WEIGHT_GAIN_SURPLUS_FRACTION : 0);
  const floor = Math.max(restingKcal, MIN_ENERGY_KCAL);
  if (objective === 'lose' && energyKcal < floor) {
    energyKcal = Math.min(maintenanceKcal, floor);
    warnings.push(`To stay safe without medical supervision, energy isn't set below ${Math.round(floor)} kcal/day, so the deficit is smaller than 600 kcal.`);
  }
  if (bmi >= 30 && objective !== 'lose') warnings.push('A health professional can help you decide whether a weight-loss plan is right for you.');

  // Protein
  const proteinGPerKg = objective === 'maintain' ? PROTEIN_PRI_G_PER_KG : PROTEIN_WEIGHT_CHANGE_G_PER_KG;
  const idealWeightKg = 25 * heightM * heightM;
  const proteinReferenceWeightKg = bmi >= 30 ? idealWeightKg + ESPEN_ADJUSTED_WEIGHT_FACTOR * (profile.weightKg - idealWeightKg) : profile.weightKg;
  const proteinG = proteinGPerKg * proteinReferenceWeightKg;

  // Fat & carbohydrate (% energy), carbohydrate within EFSA's 45–60 % E.
  const fatG = (energyKcal * FAT_PERCENT_ENERGY) / 100 / 9;
  const proteinPct = ((proteinG * 4) / energyKcal) * 100;
  const carbPercentEnergy = Math.min(60, Math.max(45, 100 - FAT_PERCENT_ENERGY - proteinPct));
  const carbG = (energyKcal * carbPercentEnergy) / 100 / 4;

  const targets: DailyGoals['targets'] = {
    energy: { amount: Math.round(energyKcal), direction: 'around', tolerance: 0.1, origin: 'reference' },
    protein: { amount: Math.round(proteinG), direction: 'atLeast', origin: 'reference' },
    carbohydrate: { amount: Math.round(carbG), direction: 'around', tolerance: 0.1, origin: 'reference' },
    fat: { amount: Math.round(fatG), direction: 'around', tolerance: 0.1, origin: 'reference' },
    fiber: { amount: EFSA_FIBRE_AI_G, direction: 'atLeast', origin: 'reference' },
    saturatedFat: { amount: Math.round((energyKcal * SATURATED_FAT_MAX_PERCENT_ENERGY) / 100 / 9), direction: 'atMost', origin: 'reference' },
    sugar: { amount: Math.round((EU_REFERENCE_INTAKES.sugar * energyKcal) / EU_REFERENCE_INTAKES.energyKcal), direction: 'atMost', origin: 'reference' },
    sodium: { amount: EFSA_SODIUM_LIMIT_MG, direction: 'atMost', origin: 'reference' },
  };
  const ref = aesanMicronutrients(profile.sex, age);
  for (const [id, amount] of Object.entries(ref.micros) as [NutrientId, number][]) {
    targets[id] = { amount, direction: 'atLeast', origin: 'reference' };
  }

  return {
    targets,
    breakdown: {
      age,
      bmi,
      restingKcal,
      pal,
      maintenanceKcal,
      adjustmentKcal: energyKcal - maintenanceKcal,
      energyKcal,
      proteinGPerKg,
      proteinReferenceWeightKg,
      fatPercentEnergy: FAT_PERCENT_ENERGY,
      carbPercentEnergy,
      micronutrientReference: ref.label,
      warnings,
      sources: TARGET_SOURCES,
    },
  };
}

/** Targets for people without a profile: EU labelling Reference Intakes + AESAN women 20–49. */
export function defaultEuTargets(): DailyGoals['targets'] {
  const t: DailyGoals['targets'] = {
    energy: { amount: EU_REFERENCE_INTAKES.energyKcal, direction: 'around', tolerance: 0.1, origin: 'reference' },
    protein: { amount: EU_REFERENCE_INTAKES.protein, direction: 'atLeast', origin: 'reference' },
    carbohydrate: { amount: EU_REFERENCE_INTAKES.carbohydrate, direction: 'around', tolerance: 0.1, origin: 'reference' },
    fat: { amount: EU_REFERENCE_INTAKES.fat, direction: 'around', tolerance: 0.1, origin: 'reference' },
    fiber: { amount: EFSA_FIBRE_AI_G, direction: 'atLeast', origin: 'reference' },
    saturatedFat: { amount: EU_REFERENCE_INTAKES.saturatedFat, direction: 'atMost', origin: 'reference' },
    sugar: { amount: EU_REFERENCE_INTAKES.sugar, direction: 'atMost', origin: 'reference' },
    sodium: { amount: EFSA_SODIUM_LIMIT_MG, direction: 'atMost', origin: 'reference' },
  };
  for (const [id, amount] of Object.entries(aesanMicronutrients('female', 30).micros) as [NutrientId, number][]) {
    t[id] = { amount, direction: 'atLeast', origin: 'reference' };
  }
  return t;
}
