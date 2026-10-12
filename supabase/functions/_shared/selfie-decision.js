// Decide a verificação a partir do AWS Rekognition:
//   DetectFaces (Attributes: ALL) na selfie + CompareFaces selfie × fotos do perfil.
// JavaScript puro: roda na Edge Function (Deno) e nos testes (Node).

export const LIMITS = {
  approveSimilarity: 92,   // ≥ isso: mesmo rosto das fotos
  rejectSimilarity: 70,    // < isso: claramente outra pessoa
  minFaceConfidence: 90,
  minSharpness: 15,
  minBrightness: 20,
  turnedYaw: 15,           // graus para "virar o rosto"
  liftedPitch: 10,         // graus para "levantar o queixo"
  attrConfidence: 75,
  minAdultAge: 18,
};

const yes = (a) => !!a && a.Value === true && (a.Confidence ?? 100) >= LIMITS.attrConfidence;
const no  = (a) => !!a && a.Value === false && (a.Confidence ?? 100) >= LIMITS.attrConfidence;
const turned  = (f) => Math.abs(f?.Pose?.Yaw ?? 0) >= LIMITS.turnedYaw;
const lifted  = (f) => Math.abs(f?.Pose?.Pitch ?? 0) >= LIMITS.liftedPitch;

// Mesmos códigos de public.verification_challenges()
export const CHALLENGES = {
  sorriso_lado:   (f) => yes(f.Smile) && turned(f),
  sorriso_frente: (f) => yes(f.Smile) && !turned(f),
  serio_lado:     (f) => no(f.Smile) && no(f.MouthOpen) && turned(f),
  boca_aberta:    (f) => yes(f.MouthOpen),
  serio_cima:     (f) => no(f.Smile) && lifted(f),
};

/**
 * @param {{ faces: any[], challenge: string, label?: string, similarities: number[] }} input
 * @returns {{ decision: 'aprovar'|'recusar'|'revisar', note: string|null, checks: object }}
 */
export function decideVerification({ faces, challenge, label, similarities }) {
  const list = faces ?? [];
  const best = Math.max(0, ...(similarities ?? []).filter((n) => typeof n === 'number'));
  const checks = { faces: list.length, best_similarity: Math.round(best * 10) / 10, challenge };
  const r = (decision, note) => ({ decision, note, checks });

  if (list.length === 0) return r('recusar', 'Não encontramos um rosto na selfie. Tire de novo com o rosto inteiro na tela.');
  if (list.length > 1) return r('recusar', 'Apareceu mais de uma pessoa. Tire a selfie sozinho(a).');
  const f = list[0];
  if ((f.Confidence ?? 0) < LIMITS.minFaceConfidence) return r('recusar', 'Não deu para ver seu rosto direito. Tente com mais luz.');
  if ((f.Quality?.Sharpness ?? 100) < LIMITS.minSharpness || (f.Quality?.Brightness ?? 100) < LIMITS.minBrightness) {
    return r('recusar', 'A foto ficou escura ou tremida. Tente num lugar com mais luz e segure firme.');
  }
  if (yes(f.Sunglasses)) return r('recusar', 'Tire os óculos escuros e tente de novo.');

  const check = CHALLENGES[challenge];
  checks.challenge_ok = check ? check(f) : false;
  if (!checks.challenge_ok) {
    return r('recusar', `Não identificamos o pedido na selfie${label ? `: "${label}"` : ''}. Tente de novo.`);
  }

  if (best < LIMITS.rejectSimilarity) {
    return r('recusar', 'O rosto da selfie não parece com o das fotos do perfil. Use fotos suas, com o rosto visível.');
  }
  if (best < LIMITS.approveSimilarity) {
    return r('recusar', 'Não conseguimos confirmar que é você. Tente com mais luz, olhando para a câmera.');
  }

  const age = f.AgeRange;
  checks.age_range = age ? [age.Low, age.High] : null;
  if (age && (age.Low + age.High) / 2 < LIMITS.minAdultAge) {
    return r('revisar', 'Idade aparente abaixo de 18: conferência manual.');
  }
  return r('aprovar', null);
}
