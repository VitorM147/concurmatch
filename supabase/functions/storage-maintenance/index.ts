// Somente pg_cron, com segredo próprio. Nunca recebe IDs de usuário do cliente.
import { createClient } from 'npm:@supabase/supabase-js@2.45.4';
import { cleanupFiles, deleteAccountFiles } from '../_shared/worker-tasks.js';

Deno.serve(async (req) => {
  const secret = Deno.env.get('STORAGE_MAINTENANCE_SECRET');
  const provided = req.headers.get('x-worker-secret') ?? '';
  const a = new TextEncoder().encode(provided), b = new TextEncoder().encode(secret ?? '');
  let diff = a.length ^ b.length;
  for (let i = 0; i < b.length; i++) diff |= (a[i] ?? 0) ^ b[i];
  if (!secret || diff !== 0) return new Response('forbidden', { status: 403 });
  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false },
    global: { fetch: (url, options) => fetch(url, { ...options, signal: AbortSignal.timeout(20_000) }) },
  });
  const failures: string[] = [];
  let files = 0, accounts = 0;
  const scan = await db.rpc('scan_orphan_photos');
  if (scan.error) failures.push('ORPHAN_SCAN_FAILED');
  try { files = await cleanupFiles(db); } catch { failures.push('FILE_CLEANUP_FAILED'); }
  const { data: jobs, error } = await db.rpc('deletion_jobs_pending', { p_limit: 3 });
  if (error) return Response.json({ error: 'DELETION_CLAIM_FAILED' }, { status: 500 });
  for (const job of jobs ?? []) {
    try {
      if (await deleteAccountFiles(db, job)) { accounts++; continue; }
    } catch { failures.push('ACCOUNT_CLEANUP_FAILED'); }
    const retry = await db.rpc('retry_account_deletion', { p_user: job.user_id, p_token: job.token });
    if (retry.error) failures.push('ACCOUNT_RETRY_FAILED');
  }
  return Response.json({ files, accounts, failures }, { status: failures.length ? 500 : 200 });
});
