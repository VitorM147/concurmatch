// Robô de verificação de selfie. Chamado a cada minuto pelo pg_cron (0015).
// Para cada pedido pendente: DetectFaces na selfie (desafio, qualidade, idade
// aparente) e CompareFaces com até 3 fotos do perfil. A decisão vai para
// apply_verification_result(). Depois de aprovar ou recusar, a selfie é
// APAGADA do Storage (dado biométrico: guardamos só as notas).
//
// Segredos: SELFIE_CHECK_SECRET, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_REGION (sa-east-1).
// A chave da AWS precisa só de rekognition:DetectFaces e rekognition:CompareFaces.
// Deploy: supabase functions deploy selfie-check --no-verify-jwt
import { createClient } from 'npm:@supabase/supabase-js@2.45.4';
import { CompareFacesCommand, DetectFacesCommand, RekognitionClient } from 'npm:@aws-sdk/client-rekognition@3.645.0';
import { decideVerification } from '../_shared/selfie-decision.js';

const BATCH = 5;

function sameSecret(a: string, b: string) {
  const x = new TextEncoder().encode(a), y = new TextEncoder().encode(b);
  if (x.length !== y.length || x.length === 0) return false;
  let diff = 0;
  for (let i = 0; i < x.length; i++) diff |= x[i] ^ y[i];
  return diff === 0;
}

Deno.serve(async (req) => {
  if (!sameSecret(req.headers.get('x-worker-secret') ?? '', Deno.env.get('SELFIE_CHECK_SECRET') ?? '')) {
    return new Response('forbidden', { status: 403 });
  }
  const keyId = Deno.env.get('AWS_ACCESS_KEY_ID'), secret = Deno.env.get('AWS_SECRET_ACCESS_KEY');
  if (!keyId || !secret) return Response.json({ disabled: true, reason: 'AWS não configurada' });

  const aws = new RekognitionClient({
    region: Deno.env.get('AWS_REGION') ?? 'sa-east-1',
    credentials: { accessKeyId: keyId, secretAccessKey: secret },
  });
  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false },
  });

  const bytes = async (path: string) => {
    const { data, error } = await db.storage.from('photos').download(path);
    if (error || !data) throw new Error(`download ${path}: ${error?.message ?? 'vazio'}`);
    return new Uint8Array(await data.arrayBuffer());
  };

  const { data: pending, error } = await db.rpc('verification_auto_pending', { p_limit: BATCH });
  if (error) return new Response(`pending: ${error.message}`, { status: 500 });

  const summary: Record<string, number> = {};
  const failures: string[] = [];
  for (const v of (pending ?? []) as { id: number; challenge: string; label: string; selfie: string; photos: string[] }[]) {
    try {
      const selfie = await bytes(v.selfie);
      const det = await aws.send(new DetectFacesCommand({ Image: { Bytes: selfie }, Attributes: ['ALL'] }));
      const similarities: number[] = [];
      if ((det.FaceDetails ?? []).length === 1) {
        for (const p of v.photos ?? []) {
          try {
            const cmp = await aws.send(new CompareFacesCommand({
              SourceImage: { Bytes: selfie }, TargetImage: { Bytes: await bytes(p) }, SimilarityThreshold: 0,
            }));
            similarities.push(...(cmp.FaceMatches ?? []).map((m) => m.Similarity ?? 0));
          } catch {
            similarities.push(0); // foto do perfil sem rosto detectável
          }
        }
      }
      const result = decideVerification({ faces: det.FaceDetails ?? [], challenge: v.challenge, label: v.label, similarities });
      const { data, error: e } = await db.rpc('apply_verification_result', {
        p_request: v.id, p_decision: result.decision, p_note: result.note, p_result: result.checks,
      });
      if (e) throw e;
      const decision = (data as { decision?: string })?.decision ?? result.decision;
      if (decision === 'aprovar' || decision === 'recusar') {
        await db.storage.from('photos').remove([v.selfie]);
      }
      summary[decision] = (summary[decision] ?? 0) + 1;
    } catch (e) {
      failures.push(`${v.id}: ${(e as Error).message}`);
    }
  }
  return Response.json({ checked: (pending ?? []).length, summary, failures });
});
