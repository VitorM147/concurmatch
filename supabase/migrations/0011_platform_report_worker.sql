-- =====================================================================
-- 0011 — Plataforma: robô de triagem de denúncias a cada minuto
-- Não roda no teste local com PGlite.
--
-- Antes de aplicar, guarde dois segredos no Vault (SQL Editor):
--   select vault.create_secret('https://<projeto>.supabase.co/functions/v1/report-triage', 'report_triage_url');
--   select vault.create_secret('<um texto aleatório longo>', 'report_triage_secret');
-- O mesmo texto vai na Edge Function: supabase secrets set REPORT_TRIAGE_SECRET=...
-- =====================================================================

-- O robô usa a chave service_role; só ela executa as funções de moderação
grant execute on function
  public.report_triage_pending(integer),
  public.apply_report_triage(uuid, text, jsonb),
  public.moderation_queue(),
  public.moderation_resolve(uuid, text, text),
  public.moderation_review_verification(bigint, boolean, text)
to service_role;

create extension if not exists pg_net;

select cron.schedule('report-triage', '* * * * *', $$
  select net.http_post(
    url     := (select decrypted_secret from vault.decrypted_secrets where name = 'report_triage_url'),
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-worker-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'report_triage_secret')),
    body    := '{}'::jsonb,
    timeout_milliseconds := 55000)
  where exists (select 1 from public.reports
                 where auto_checked_at is null and status in ('aberta', 'em_analise'))
$$);
