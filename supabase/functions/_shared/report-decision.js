// Decide a gravidade de uma denúncia a partir das notas da Moderation API
// da OpenAI (omni-moderation). JavaScript puro: roda na Edge Function (Deno)
// e nos testes (Node). Os limites ficam aqui para ajustar sem mexer no robô.

export const THRESHOLDS = {
  // Qualquer um destes → "grave": o perfil sai do ar na hora
  grave: {
    'sexual/minors': 0.3,
    'harassment/threatening': 0.5,
    'hate/threatening': 0.5,
    'illicit/violent': 0.5,
    'violence/graphic': 0.7,
    'self-harm/instructions': 0.5,
    violence: 0.8,
  },
  // Qualquer um destes → "moderada": conta para a regra das 3 denúncias
  moderada: {
    harassment: 0.5,
    hate: 0.5,
    sexual: 0.6,
    illicit: 0.6,
    violence: 0.5,
  },
};

/**
 * Junta os resultados (um por texto) pegando a maior nota de cada categoria.
 * @param {Array<{ category_scores?: Record<string, number> }>} results
 * @returns {Record<string, number>}
 */
export function maxScores(results) {
  /** @type {Record<string, number>} */
  const out = {};
  for (const r of results ?? []) {
    for (const [k, v] of Object.entries(r?.category_scores ?? {})) {
      if (typeof v === 'number' && (out[k] === undefined || v > out[k])) out[k] = v;
    }
  }
  return out;
}

const over = (scores, limits) =>
  Object.entries(limits).filter(([k, min]) => (scores[k] ?? 0) >= min).map(([k]) => k);

/**
 * @param {{ texts: string[], scores?: Record<string, number> }} input
 * @returns {{ severity: 'grave'|'moderada'|'sem_evidencia'|'sem_conversa', reasons: string[] }}
 */
export function decideReport({ texts, scores }) {
  const useful = (texts ?? []).filter((t) => typeof t === 'string' && t.trim().length > 0);
  if (useful.length === 0) return { severity: 'sem_conversa', reasons: [] };
  const s = scores ?? {};
  const grave = over(s, THRESHOLDS.grave);
  if (grave.length) return { severity: 'grave', reasons: grave };
  const moderada = over(s, THRESHOLDS.moderada);
  if (moderada.length) return { severity: 'moderada', reasons: moderada };
  return { severity: 'sem_evidencia', reasons: [] };
}
