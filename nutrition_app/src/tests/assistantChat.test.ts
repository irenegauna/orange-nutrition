import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { acceptAiPrivacyNotice, chatWithAssistant, configureAiFetch, getAiSettings, setAiApiKey, updateAiSettings } from '../services/ai';
import { resetGeminiRateLimiter } from '../integrations/gemini';
import { metaRepository } from '../data/repositories';
import { setAllergies, setMacroGoals } from '../services/goals';
import { addMealEntry } from '../services/meals';
import { seedDatabase } from '../data/seed';
import { freshDb } from './helpers';

const gemini = (obj: unknown) => new Response(JSON.stringify({ status: 'completed', steps: [{ type: 'thought', signature: 'x' }, { type: 'model_output', content: [{ type: 'text', text: JSON.stringify(obj) }] }] }), { status: 200 });

describe('AI assistant chat', () => {
  let sent: { system: string; parts: { text: string }[] } | null = null;

  beforeEach(async () => {
    await freshDb();
    await seedDatabase();
    await setMacroGoals({ calories: 2000, protein: 120 }, '2026-01-01');
    sent = null;
    resetGeminiRateLimiter();
  });
  afterEach(() => configureAiFetch(undefined));

  async function enable(answer: unknown) {
    configureAiFetch((async (_u: unknown, init: RequestInit) => {
      const body = JSON.parse(init.body as string);
      sent = { system: body.system_instruction, parts: body.input };
      return gemini(answer);
    }) as unknown as typeof fetch);
    await setAiApiKey('AIzaTestKey1234567890');
    await acceptAiPrivacyNotice();
    await updateAiSettings({ aiSuggestionsEnabled: true });
  }

  it('is unavailable until enabled', async () => {
    await expect(chatWithAssistant({ message: 'hi' })).rejects.toMatchObject({ code: 'UNAVAILABLE' });
  });

  it('answers conversationally with locally computed context and validated meal cards', async () => {
    await setAllergies(['egg']);
    await addMealEntry({ date: '2026-11-07', mealType: 'breakfast', foodId: 'usda_173905', quantity: { amount: 250, unit: 'g' } });
    await enable({
      reply: 'Llevas poca proteína hoy. Te propongo una cena con pollo.',
      suggestions: [
        { name: 'Pollo con arroz', reason: 'Proteína magra', mealType: 'dinner', ingredients: [{ foodId: 'usda_171477', grams: 150 }, { foodId: 'usda_168878', grams: 150 }] },
        { name: 'Tortilla', reason: 'x', ingredients: [{ foodId: 'usda_172187', grams: 150 }] },
      ],
      followUps: ['¿Y para merendar?'],
    });
    const r = await chatWithAssistant({
      message: '¿Qué ceno hoy?',
      date: '2026-11-07',
      now: new Date(2026, 10, 7, 20, 0),
      history: [
        { role: 'user', text: 'hola' },
        { role: 'assistant', text: '¡Hola! ¿En qué te ayudo?' },
      ],
    });
    expect(r.source).toBe('ai');
    expect(r.text).toMatch(/proteína/);
    expect(r.followUps).toEqual(['¿Y para merendar?']);
    expect(r.recommendations).toHaveLength(1);
    expect(r.recommendations[0]!.nutrition.energy.amount).toBeCloseTo(165 * 1.5 + 130 * 1.5, 6);
    expect(r.recommendations[0]!.mealType).toBe('dinner');
    expect(r.rejected.map((x) => x.name)).toEqual(['Tortilla']); // eggs excluded: not in the catalog sent

    const ctx = JSON.parse(sent!.parts[0]!.text.replace('CONTEXT (JSON):\n', ''));
    expect(ctx.today.entries).toEqual([{ meal: 'breakfast', food: 'Oatmeal, cooked with water', grams: 250 }]);
    expect(ctx.today.nutrients.protein.target).toBe(120);
    expect(ctx.allergies).toEqual(['egg']);
    expect(ctx.catalog.map((row: unknown[]) => row[0])).not.toContain('usda_172187');
    expect(sent!.parts[1]!.text).toContain('Assistant: ¡Hola!');
    expect(sent!.parts[2]!.text).toContain('¿Qué ceno hoy?');
    expect(sent!.system).toMatch(/Never diagnose/);
  });

  it('migrates settings saved with a retired model', async () => {
    await metaRepository.set('aiSettings', { provider: 'gemini', apiKey: 'AIzaTestKey1234567890', model: 'gemini-flash-latest', photoRecognitionEnabled: false, aiSuggestionsEnabled: true, consentAcceptedAt: '2026-11-07T00:00:00.000Z' });
    expect((await getAiSettings()).model).toBe('gemini-3.5-flash-lite');
  });

  it('maps provider failures and rejects empty messages', async () => {
    await enable({ nonsense: true });
    await expect(chatWithAssistant({ message: '   ' })).rejects.toMatchObject({ code: 'VALIDATION' });
    await expect(chatWithAssistant({ message: 'hi' })).rejects.toMatchObject({ code: 'UNAVAILABLE', details: { code: 'INVALID_RESPONSE' } });
  });
});
