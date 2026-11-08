import type { AiSettings } from '../../core/types/domain';
import { aiSettingsSchema } from '../../core/validation/schemas';
import { DataError } from '../../core/utils/errors';
import { nowIso } from '../../core/utils/dates';
import { metaRepository } from '../../data/repositories';
import { DEFAULT_GEMINI_MODEL, GeminiClient, GeminiError, PREVIOUS_DEFAULT_GEMINI_MODELS, RETIRED_GEMINI_MODELS } from '../../integrations/gemini/client';

/** Shown to the user before AI can be enabled. Consent is stored with a timestamp. */
export const AI_PRIVACY_NOTICE = [
  'Las funciones de IA envían datos a Google Gemini con tu propia clave de API gratuita:',
  '• El reconocimiento de fotos envía la foto de la comida que hagas.',
  '• El asistente y las sugerencias de IA envían tus mensajes del chat (y los últimos turnos de la conversación), los alimentos y totales de nutrientes que hayas registrado hoy, tus medias de nutrientes de 7 días, tus objetivos, alergias, dietas, alimentos que no te gustan y los nombres y la información nutricional de alimentos candidatos de la lista de la app.',
  'Nunca se envían el historial de comidas anterior, las copias de seguridad ni otros datos personales.',
  'En el nivel gratuito de Google, las solicitudes pueden ser revisadas y utilizadas por Google para mejorar sus productos. No uses las funciones de IA si eso no te parece aceptable.',
  'La respuesta de la IA nunca se usa para los valores de nutrientes: la app siempre calcula la información nutricional con su propia base de datos de alimentos, y tú confirmas cada elemento antes de registrarlo.',
].join('\n');

const KEY = 'aiSettings';

export function defaultAiSettings(): AiSettings {
  return { provider: 'gemini', apiKey: null, model: DEFAULT_GEMINI_MODEL, photoRecognitionEnabled: false, aiSuggestionsEnabled: false, consentAcceptedAt: null };
}

/** Full settings INCLUDING the API key. Never render the key; use getAiSettingsPublic for UI. */
export async function getAiSettings(): Promise<AiSettings> {
  const stored = await metaRepository.get<AiSettings>(KEY);
  if (!stored) return defaultAiSettings();
  const merged = { ...defaultAiSettings(), ...stored };
  // Google stopped serving these to new users: move to the current default.
  // Retired models, and former defaults (the user never picks a model in the UI), move to the current default.
  if (RETIRED_GEMINI_MODELS.includes(merged.model) || PREVIOUS_DEFAULT_GEMINI_MODELS.includes(merged.model)) merged.model = DEFAULT_GEMINI_MODEL;
  return merged;
}

export interface AiSettingsPublic extends Omit<AiSettings, 'apiKey'> {
  hasApiKey: boolean;
  /** e.g. "…x9Qk" for display. */
  apiKeyHint: string | null;
  photoRecognitionAvailable: boolean;
  aiSuggestionsAvailable: boolean;
}

export async function getAiSettingsPublic(): Promise<AiSettingsPublic> {
  const s = await getAiSettings();
  const { apiKey, ...rest } = s;
  const ready = !!apiKey && !!s.consentAcceptedAt;
  return { ...rest, hasApiKey: !!apiKey, apiKeyHint: apiKey ? `…${apiKey.slice(-4)}` : null, photoRecognitionAvailable: ready && s.photoRecognitionEnabled, aiSuggestionsAvailable: ready && s.aiSuggestionsEnabled };
}

async function save(next: AiSettings): Promise<AiSettings> {
  const parsed = aiSettingsSchema.safeParse(next);
  if (!parsed.success) throw new DataError('VALIDATION', 'Ajustes de IA no válidos', parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`));
  const ready = !!parsed.data.apiKey && !!parsed.data.consentAcceptedAt;
  // Features can only be on when a key exists and consent was given.
  const value: AiSettings = { ...parsed.data, photoRecognitionEnabled: ready && parsed.data.photoRecognitionEnabled, aiSuggestionsEnabled: ready && parsed.data.aiSuggestionsEnabled };
  await metaRepository.set(KEY, value);
  return value;
}

export async function setAiApiKey(apiKey: string | null): Promise<AiSettingsPublic> {
  await save({ ...(await getAiSettings()), apiKey: apiKey?.trim() || null });
  return getAiSettingsPublic();
}

export async function acceptAiPrivacyNotice(): Promise<AiSettingsPublic> {
  await save({ ...(await getAiSettings()), consentAcceptedAt: nowIso() });
  return getAiSettingsPublic();
}

/** Withdraws consent and turns all AI features off (the key is kept unless `forgetKey`). */
export async function revokeAiConsent(forgetKey = false): Promise<AiSettingsPublic> {
  const s = await getAiSettings();
  await save({ ...s, consentAcceptedAt: null, photoRecognitionEnabled: false, aiSuggestionsEnabled: false, ...(forgetKey ? { apiKey: null } : {}) });
  return getAiSettingsPublic();
}

export async function updateAiSettings(patch: Partial<Pick<AiSettings, 'model' | 'photoRecognitionEnabled' | 'aiSuggestionsEnabled'>>): Promise<AiSettingsPublic> {
  const s = await getAiSettings();
  const wantsOn = patch.photoRecognitionEnabled || patch.aiSuggestionsEnabled;
  if (wantsOn && !s.apiKey) throw new DataError('VALIDATION', 'Primero añade tu clave de API de Gemini');
  if (wantsOn && !s.consentAcceptedAt) throw new DataError('VALIDATION', 'Primero acepta el aviso de privacidad de la IA');
  await save({ ...s, ...patch });
  return getAiSettingsPublic();
}

// ----- client factory -----

let fetchOverride: typeof fetch | undefined;
/** Tests / custom transport. */
export function configureAiFetch(fetchImpl: typeof fetch | undefined): void {
  fetchOverride = fetchImpl;
}

export type AiFeature = 'photo' | 'suggestions';

/** Returns a client if the feature is enabled, otherwise throws DataError('UNAVAILABLE'). */
export async function getAiClient(feature: AiFeature): Promise<GeminiClient> {
  const s = await getAiSettings();
  if (!s.apiKey) throw new DataError('UNAVAILABLE', 'No hay ninguna clave de API de IA configurada');
  if (!s.consentAcceptedAt) throw new DataError('UNAVAILABLE', 'No se ha aceptado el aviso de privacidad de la IA');
  if (feature === 'photo' && !s.photoRecognitionEnabled) throw new DataError('UNAVAILABLE', 'El reconocimiento de fotos con IA está desactivado');
  if (feature === 'suggestions' && !s.aiSuggestionsEnabled) throw new DataError('UNAVAILABLE', 'Las sugerencias con IA están desactivadas');
  return new GeminiClient({ apiKey: s.apiKey, model: s.model, ...(fetchOverride ? { fetchImpl: fetchOverride } : {}) });
}

/** Sends a tiny request to verify the key/model. Requires key + consent (feature switches not needed). */
export async function testAiConnection(): Promise<{ ok: true; model: string } | { ok: false; code: string; message: string }> {
  const s = await getAiSettings();
  if (!s.apiKey) return { ok: false, code: 'NO_KEY', message: 'No hay ninguna clave de API configurada' };
  if (!s.consentAcceptedAt) return { ok: false, code: 'NO_CONSENT', message: 'Primero acepta el aviso de privacidad de la IA' };
  const client = new GeminiClient({ apiKey: s.apiKey, model: s.model, timeoutMs: 25_000, ...(fetchOverride ? { fetchImpl: fetchOverride } : {}) });
  try {
    await client.generateJson({ system: 'Reply with {"ok": true}.', parts: [{ text: 'ping' }], schema: { type: 'OBJECT', properties: { ok: { type: 'BOOLEAN' } }, required: ['ok'] }, maxOutputTokens: 1024 });
    return { ok: true, model: client.lastModel ?? s.model };
  } catch (e) {
    if (e instanceof GeminiError) return { ok: false, code: e.code, message: e.message };
    throw e;
  }
}
