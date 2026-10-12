// Conferência das fotos do perfil pelo robô (Edge Function report-triage).
// JavaScript puro: roda no Deno e nos testes (Node).

/** Tipo real pelos primeiros bytes ("magic number"). Extensão e Content-Type não contam. */
export function sniffImage(bytes) {
  const b = bytes ?? new Uint8Array();
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'jpeg';
  if (b.length >= 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47
      && b[4] === 0x0d && b[5] === 0x0a && b[6] === 0x1a && b[7] === 0x0a) return 'png';
  if (b.length >= 12 && b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46
      && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) return 'webp';
  return null;
}

export const PHOTO_LIMITS = {
  'sexual/minors': 0.2,   // qualquer sinal relevante: tira a foto e esconde o perfil
  sexual: 0.7,
  'violence/graphic': 0.7,
  'self-harm': 0.8,
};

/** @returns {{ flagged: boolean, reason: 'menor'|'sexual'|'violencia'|'autolesao'|null }} */
export function decidePhoto(scores) {
  const s = scores ?? {};
  if ((s['sexual/minors'] ?? 0) >= PHOTO_LIMITS['sexual/minors']) return { flagged: true, reason: 'menor' };
  if ((s.sexual ?? 0) >= PHOTO_LIMITS.sexual) return { flagged: true, reason: 'sexual' };
  if ((s['violence/graphic'] ?? 0) >= PHOTO_LIMITS['violence/graphic']) return { flagged: true, reason: 'violencia' };
  if ((s['self-harm'] ?? 0) >= PHOTO_LIMITS['self-harm']) return { flagged: true, reason: 'autolesao' };
  return { flagged: false, reason: null };
}
