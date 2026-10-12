// Robô de triagem de denúncias. Chamado a cada minuto pelo pg_cron (0011).
// 1. Busca denúncias ainda não analisadas (report_triage_pending)
// 2. Manda o que a pessoa denunciada escreveu para a Moderation API (gratuita)
// 3. Aplica a decisão no banco (apply_report_triage): esconder, arquivar ou manter
//
// Segredos (supabase secrets set ...): OPENAI_API_KEY, REPORT_TRIAGE_SECRET.
// SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY já vêm da plataforma.
// Deploy: supabase functions deploy report-triage --no-verify-jwt
//         (a proteção é o cabeçalho x-worker-secret, não o JWT de usuário)
import { createClient } from 'npm:@supabase/supabase-js@2.45.4';
import { decideReport, maxScores } from '../_shared/report-decision.js';

const MODEL = 'omni-moderation-latest';
const BATCH = 20;

function sameSecret(a: string, b: string) {
  const x = new TextEncoder().encode(a), y = new TextEncoder().encode(b);
  if (x.length !== y.length || x.length === 0) return false;
  let diff = 0;
  for (let i = 0; i < x.length; i++) diff |= x[i] ^ y[i];
  return diff === 0;
}

async function moderate(texts: string[], apiKey: string) {
  // A API aceita várias entradas por chamada; textos longos são cortados
  const input = texts.map((t) => t.slice(0, 4000)).slice(0, 50);
  const res = await fetch('https://api.openai.com/v1/moderations', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: MODEL, input }),
  });
  if (!res.ok) throw new Error(`moderation ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const body = await res.json();
  return maxScores(body.results);
}

Deno.serve(async (req) => {
  const secret = Deno.env.get('REPORT_TRIAGE_SECRET') ?? '';
  if (!sameSecret(req.headers.get('x-worker-secret') ?? '', secret)) {
    return new Response('forbidden', { status: 403 });
  }
  const apiKey = Deno.env.get('OPENAI_API_KEY');
  if (!apiKey) return new Response('OPENAI_API_KEY ausente', { status: 500 });

  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false },
  });

  const { data: pending, error } = await db.rpc('report_triage_pending', { p_limit: BATCH });
  if (error) return new Response(`pending: ${error.message}`, { status: 500 });

  const summary: Record<string, number> = {};
  const failures: string[] = [];
  for (const r of (pending ?? []) as { id: string; texts: string[] }[]) {
    try {
      const texts = (r.texts ?? []).filter((t) => t?.trim());
      const scores = texts.length ? await moderate(texts, apiKey) : {};
      const { severity, reasons } = decideReport({ texts, scores });
      const { data, error: e } = await db.rpc('apply_report_triage', {
        p_report: r.id, p_severity: severity, p_scores: { model: MODEL, scores, reasons },
      });
      if (e) throw e;
      const action = (data as { action?: string })?.action ?? 'mantida';
      summary[action] = (summary[action] ?? 0) + 1;
    } catch (e) {
      // Fica pendente e o próximo minuto tenta de novo; nunca registramos o texto da conversa
      failures.push(`${r.id}: ${(e as Error).message}`);
    }
  }
  return Response.json({ checked: (pending ?? []).length, summary, failures });
});
