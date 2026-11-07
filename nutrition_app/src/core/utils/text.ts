/** Lowercases, strips diacritics and punctuation, collapses whitespace. */
export function normalizeText(input: string): string {
  return input
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9%]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

const STOP = new Set([
  'and', 'or', 'with', 'without', 'the', 'of', 'a', 'an', 'in', 'raw',
  // Spanish (catalog and UI are Spanish)
  'y', 'e', 'o', 'u', 'con', 'sin', 'el', 'la', 'los', 'las', 'de', 'del', 'un', 'una', 'unos', 'unas', 'en', 'al', 'para',
  'crudo', 'cruda', 'crudos', 'crudas',
]);

/** Search tokens (unique, normalized). 'raw' etc. are dropped as low-signal words. */
export function tokenize(input: string, keepStopWords = false): string[] {
  const words = normalizeText(input).split(' ').filter(Boolean);
  const out = new Set<string>();
  for (const w of words) {
    if (!keepStopWords && STOP.has(w)) continue;
    out.add(w);
    // crude singularisation so "eggs" matches "egg" and "huevos" matches "huevo"
    if (w.length > 3 && w.endsWith('s') && !w.endsWith('ss')) out.add(w.slice(0, -1));
    // Spanish "-es" plurals: "limones" → "limon", "melocotones" → "melocoton"
    if (w.length > 5 && w.endsWith('es')) out.add(w.slice(0, -2));
  }
  return [...out];
}
