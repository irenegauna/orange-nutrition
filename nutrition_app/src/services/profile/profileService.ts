import type { ActivityLevel, PersonalTargets, Sex, UserProfile, WeightObjective } from '../../core/types/domain';
import { computePersonalTargets, defaultEuTargets } from '../../core/nutrition/requirements';
import { formatZodIssues, userProfileInputSchema, userProfileSchema } from '../../core/validation/schemas';
import { DataError } from '../../core/utils/errors';
import { nowIso, today } from '../../core/utils/dates';
import { goalsRepository, metaRepository } from '../../data/repositories';
import { setGoals } from '../goals/goalsService';

const KEY = 'userProfile';

export interface UserProfileInput {
  sex: Sex;
  age: number;
  heightCm: number;
  weightKg: number;
  activity: ActivityLevel;
  objective: WeightObjective;
}

export interface ProfileWithTargets {
  profile: UserProfile;
  /** Age today (from birth year). */
  age: number;
  personal: PersonalTargets;
}

/** The stored profile, or null if the user hasn't set one up. */
export async function getProfile(): Promise<UserProfile | null> {
  const stored = await metaRepository.get<UserProfile>(KEY);
  if (!stored) return null;
  const parsed = userProfileSchema.safeParse(stored);
  return parsed.success ? (parsed.data as UserProfile) : null;
}

/** Profile + the targets it implies today (does not write goals). */
export async function getProfileWithTargets(): Promise<ProfileWithTargets | null> {
  const profile = await getProfile();
  if (!profile) return null;
  const personal = computePersonalTargets(profile, today());
  return { profile, age: personal.breakdown.age, personal };
}

/**
 * Saves body data and replaces the daily targets from today with the calculated ones.
 * Earlier days keep the goals that applied then (goals are versioned by date).
 */
export async function saveProfile(input: UserProfileInput): Promise<ProfileWithTargets> {
  const parsed = userProfileInputSchema.safeParse(input);
  if (!parsed.success) throw new DataError('VALIDATION', 'Invalid profile', formatZodIssues(parsed.error));
  const v = parsed.data;
  const date = today();
  const profile: UserProfile = {
    sex: v.sex,
    birthYear: Number(date.slice(0, 4)) - v.age,
    heightCm: v.heightCm,
    weightKg: v.weightKg,
    activity: v.activity,
    objective: v.objective,
    updatedAt: nowIso(),
  };
  const personal = computePersonalTargets(profile, date);
  await metaRepository.set(KEY, profile);
  await setGoals(personal.targets, date);
  return { profile, age: personal.breakdown.age, personal };
}

/**
 * Keeps targets in line with the profile when the person has had a birthday since the goals
 * were last written (age bands change REE and AESAN values). Safe to call on every start.
 */
export async function refreshTargetsForAge(): Promise<boolean> {
  const profile = await getProfile();
  if (!profile) return false;
  const date = today();
  const current = await goalsRepository.forDate(date);
  const expected = computePersonalTargets(profile, date).targets;
  if (current && JSON.stringify(current.targets) === JSON.stringify(expected)) return false;
  await setGoals(expected, date);
  return true;
}

/** Targets for people without a profile (EU Reference Intakes + AESAN). */
export { defaultEuTargets };
