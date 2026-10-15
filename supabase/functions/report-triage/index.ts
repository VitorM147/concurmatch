// Robô de moderação. Chamado a cada minuto pelo pg_cron (0011/0017). Três trabalhos:
// 1. Denúncias: manda o que a pessoa denunciada escreveu para a Moderation API
//    e aplica a decisão (apply_report_triage): esconder, arquivar ou manter.
// 2. Fotos novas: confere o tipo real do arquivo (bytes) e a Moderation API de imagem
//    (apply_photo_check): foto imprópria sai do perfil; sinal de menor esconde o perfil.
// 3. Alertas: manda um resumo (só tipo e horário, nunca conteúdo) para o webhook do suporte.
//
// Segredos (supabase secrets set ...): OPENAI_API_KEY, REPORT_TRIAGE_SECRET e, opcional,
// ALERT_WEBHOOK_URL (Slack/Discord/Google Chat). SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY
// já vêm da plataforma.
// Deploy: supabase functions deploy report-triage --no-verify-jwt
//         (a proteção é o cabeçalho x-worker-secret, não o JWT de usuário)
import { createClient } from 'npm:@supabase/supabase-js@2.45.4';
import { decideReport, maxScores } from '../_shared/report-decision.js';
import { deliverAlerts } from '../_shared/worker-tasks.js';
import { decidePhoto, sniffImage } from '../_shared/photo-decision.js';

// AI-006: modelo fixado numa versão datada; trocar = mudança revisada (os limites dependem dele)
const MODEL = 'omni-moderation-2024-09-26';
const REPORT_BATCH = 20;
const PHOTO_BATCH = 10;
const TIMEOUT_MS = 15_000;          // AP-009: nenhuma chamada externa trava o robô
const MAX_PHOTO_BYTES = 5 * 1024 * 1024;

function sameSecret(a: string, b: string) {
  const x = new TextEncoder().encode(a), y = new TextEncoder().encode(b);
  if (x.length !== y.length || x.length === 0) return false;
  let diff = 0;
  for (let i = 0; i < x.length; i++) diff |= x[i] ^ y[i];
  return diff === 0;
}

async function moderate(input: unknown[], apiKey: string) {
  const res = await fetch('https://api.openai.com/v1/moderations', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: MODEL, input }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`moderation ${res.status}`);
  const body = await res.json();
  if (!Array.isArray(body?.results)) throw new Error('moderation: resposta inesperada');
  return maxScores(body.results);
}

function toBase64(bytes: Uint8Array) {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

Deno.serve(async (req) => {
  if (!sameSecret(req.headers.get('x-worker-secret') ?? '', Deno.env.get('REPORT_TRIAGE_SECRET') ?? '')) {
    return new Response('forbidden', { status: 403 });
  }
  const apiKey = Deno.env.get('OPENAI_API_KEY');

  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false },
  });
  const summary: Record<string, number> = {};
  const count = (k: string) => { summary[k] = (summary[k] ?? 0) + 1; };
  const failures: string[] = [];   // só ids e mensagens de erro: nunca o texto das conversas

  if (apiKey) {
  // ---------------------------------------------------------------- 1. denúncias
  const { data: reports, error } = await db.rpc('report_triage_pending', { p_limit: REPORT_BATCH });
  if (error) return new Response(`pending: ${error.message}`, { status: 500 });
  for (const r of (reports ?? []) as { id: string; texts: string[] }[]) {
    try {
      // AI-007: entrada limitada (50 textos de até 4.000 caracteres por denúncia)
      const texts = (r.texts ?? []).filter((t) => t?.trim()).map((t) => t.slice(0, 4000)).slice(0, 50);
      const scores: Record<string, number> = texts.length ? await moderate(texts, apiKey) : {};
      const { severity, reasons } = decideReport({ texts, scores });
      const { data, error: e } = await db.rpc('apply_report_triage', {
        p_report: r.id, p_severity: severity, p_scores: { model: MODEL, scores, reasons },
      });
      if (e) throw e;
      count(`denuncia_${(data as { action?: string })?.action ?? 'mantida'}`);
    } catch (e) {
      failures.push(`report ${r.id}: ${(e as Error).message}`);
    }
  }

  // ---------------------------------------------------------------- 2. fotos
  const { data: photos, error: photoError } = await db.rpc('photo_check_pending', { p_limit: PHOTO_BATCH });
  if (photoError) failures.push('PHOTO_QUEUE_FAILED');
  for (const ph of (photos ?? []) as { id: string; path: string }[]) {
    try {
      const { data: file, error: de } = await db.storage.from('photos').download(ph.path);
      if (de || !file) {
        // arquivo sumiu (a pessoa apagou): a foto sai do perfil
        await db.rpc('apply_photo_check', { p_photo: ph.id, p_flagged: true, p_reason: 'sem_arquivo', p_scores: null });
        count('foto_sem_arquivo');
        continue;
      }
      const bytes = new Uint8Array(await file.arrayBuffer());
      const kind = sniffImage(bytes);
      if (!kind || bytes.length > MAX_PHOTO_BYTES) {
        // FU-001: extensão de imagem com conteúdo que não é imagem
        await db.rpc('apply_photo_check', { p_photo: ph.id, p_flagged: true, p_reason: 'nao_e_imagem',
                                            p_scores: { bytes: bytes.length, kind } });
        count('foto_nao_e_imagem');
        continue;
      }
      const scores = await moderate([{ type: 'image_url', image_url: { url: `data:image/${kind};base64,${toBase64(bytes)}` } }], apiKey);
      const { flagged, reason } = decidePhoto(scores);
      const { error: e } = await db.rpc('apply_photo_check', {
        p_photo: ph.id, p_flagged: flagged, p_reason: reason, p_scores: { model: MODEL, scores, kind },
      });
      if (e) throw e;
      count(flagged ? `foto_reprovada_${reason}` : 'foto_aprovada');
    } catch (e) {
      failures.push(`photo ${ph.id}: ${(e as Error).message}`);
    }
  }

  } else { summary.moderacao_automatica_desativada = 1; }

  // ---------------------------------------------------------------- 3. alertas
  const hook = Deno.env.get('ALERT_WEBHOOK_URL');
  if (hook) {
    try {
      summary.alertas_enviados = await deliverAlerts(db, hook);
    } catch (e) {
      failures.push(`alertas: ${(e as Error).message}`);
    }
  }

  return Response.json({ model: MODEL, summary, failures }, { status: failures.length ? 500 : 200 });
});
