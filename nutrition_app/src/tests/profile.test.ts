import { beforeEach, describe, expect, it } from 'vitest';
import { computePersonalTargets, defaultEuTargets, restingEnergyKcal } from '../core/nutrition/requirements';
import type { UserProfile } from '../core/types/domain';
import { getGoals } from '../services/goals';
import { getProfile, getProfileWithTargets, refreshTargetsForAge, saveProfile } from '../services/profile/profileService';
import { today } from '../core/utils/dates';
import { freshDb } from './helpers';

const D = '2026-11-07';
const profile = (o: Partial<UserProfile> = {}): UserProfile => ({
  sex: 'female',
  birthYear: 1996,
  heightCm: 164,
  weightKg: 59.2,
  activity: 'moderate',
  objective: 'maintain',
  updatedAt: '',
  ...o,
});

describe('resting energy (Henry 2005 as used by EFSA 2013)', () => {
  // EFSA 2013 reference adults: Table 4 heights, body mass at BMI 22; Appendix 13 REE (kcal/d).
  it.each([
    ['male', 25, 69.7, 178, 1670],
    ['female', 25, 59.2, 164, 1338],
    ['male', 65, 66.2, 174, 1438],
    ['female', 65, 56.3, 160, 1163],
  ] as const)('%s age %i matches EFSA reference REE', (sex, age, kg, cm, want) => {
    expect(Math.abs(restingEnergyKcal(sex, age, kg, cm) - want)).toBeLessThanOrEqual(3);
  });
});

describe('computePersonalTargets', () => {
  it('maintain: energy = REE × PAL, protein = EFSA PRI 0.83 g/kg, AESAN micros by age/sex', () => {
    const t = computePersonalTargets(profile(), D);
    expect(t.targets.energy!.amount).toBe(Math.round(restingEnergyKcal('female', 30, 59.2, 164) * 1.6));
    expect(t.targets.protein!.amount).toBe(49);
    expect(t.targets.fiber!.amount).toBe(25);
    expect(t.targets.sodium).toMatchObject({ amount: 2000, direction: 'atMost' });
    expect(t.targets.iron!.amount).toBe(18);
    expect(t.breakdown.micronutrientReference).toMatch(/Women 20–49/);
    expect(t.breakdown.carbPercentEnergy).toBeGreaterThanOrEqual(45);
    expect(t.breakdown.carbPercentEnergy).toBeLessThanOrEqual(60);
  });

  it('lose: 600 kcal deficit (EASO) and 1.2 g/kg protein on actual weight below BMI 30', () => {
    const t = computePersonalTargets(profile({ objective: 'lose', weightKg: 80 }), D); // BMI 29.7
    expect(t.breakdown.adjustmentKcal).toBeCloseTo(-600);
    expect(t.targets.protein!.amount).toBe(Math.round(1.2 * 80));
  });

  it('BMI ≥ 30: protein on ESPEN adjusted body weight', () => {
    const t = computePersonalTargets(profile({ objective: 'lose', weightKg: 100 }), D); // BMI 37.2
    const ideal = 25 * 1.64 * 1.64;
    expect(t.breakdown.proteinReferenceWeightKg).toBeCloseTo(ideal + 0.33 * (100 - ideal));
  });

  it('gain: +10 % of maintenance (Iraki et al. 2019)', () => {
    const t = computePersonalTargets(profile({ objective: 'gain' }), D);
    expect(t.breakdown.adjustmentKcal).toBeCloseTo(t.breakdown.maintenanceKcal * 0.1);
  });

  it('saturated fat ≤ 10 % of energy (WHO 2023)', () => {
    const t = computePersonalTargets(profile(), D);
    expect(t.targets.saturatedFat!.amount).toBe(Math.round((t.breakdown.energyKcal * 0.1) / 9));
  });

  it('never goes below max(REE, 1200 kcal) and warns', () => {
    const t = computePersonalTargets(profile({ objective: 'lose', heightCm: 150, weightKg: 45, activity: 'sedentary', birthYear: 1950 }), D);
    expect(t.targets.energy!.amount).toBeGreaterThanOrEqual(1200);
    expect(t.targets.energy!.amount).toBeGreaterThanOrEqual(Math.round(t.breakdown.restingKcal));
    expect(t.breakdown.warnings.length).toBeGreaterThan(0);
  });

  it('does not set a deficit when BMI < 18.5', () => {
    const t = computePersonalTargets(profile({ objective: 'lose', weightKg: 45 }), D);
    expect(t.breakdown.adjustmentKcal).toBe(0);
    expect(t.breakdown.warnings[0]).toMatch(/BMI/);
  });

  it('rejects minors', () => {
    expect(() => computePersonalTargets(profile({ birthYear: 2012 }), D)).toThrow();
  });

  it('uses AESAN men values for men', () => {
    const t = computePersonalTargets(profile({ sex: 'male', heightCm: 180, weightKg: 78, birthYear: 1990 }), D);
    expect(t.targets.iron!.amount).toBe(9.1);
    expect(t.breakdown.micronutrientReference).toMatch(/Men 20–49/);
  });
});

describe('profile service', () => {
  beforeEach(async () => {
    await freshDb();
  });

  it('saves the profile and writes the calculated targets as goals from today', async () => {
    expect(await getProfile()).toBeNull();
    const r = await saveProfile({ sex: 'female', age: 30, heightCm: 164, weightKg: 59.2, activity: 'moderate', objective: 'maintain' });
    expect(r.age).toBe(30);
    const goals = await getGoals(today());
    expect(goals?.targets.energy?.amount).toBe(r.personal.targets.energy!.amount);
    expect((await getProfileWithTargets())?.profile.heightCm).toBe(164);
    expect(await refreshTargetsForAge()).toBe(false);
  });

  it('validates input', async () => {
    await expect(saveProfile({ sex: 'female', age: 15, heightCm: 164, weightKg: 59, activity: 'moderate', objective: 'maintain' })).rejects.toMatchObject({ code: 'VALIDATION' });
  });

  it('provides EU defaults for people without a profile', () => {
    const t = defaultEuTargets();
    expect(t.energy!.amount).toBe(2000);
    expect(t.fiber!.amount).toBe(25);
  });
});
