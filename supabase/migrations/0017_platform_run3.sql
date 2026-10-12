-- =====================================================================
-- 0017 — Plataforma: robô de moderação também para fotos e alertas
-- (correções da RUN-SEC-0003). Não roda no teste local com PGlite.
-- =====================================================================

grant execute on function
  public.photo_check_pending(integer),
  public.apply_photo_check(uuid, boolean, text, jsonb),
  public.alerts_to_notify(integer)
to service_role;

-- Mesmo nome = substitui o agendamento do 0011. Chama o robô quando há
-- denúncia, foto nova ou alerta a avisar.
select cron.schedule('report-triage', '* * * * *', $$
  select net.http_post(
    url     := (select decrypted_secret from vault.decrypted_secrets where name = 'report_triage_url'),
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-worker-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'report_triage_secret')),
    body    := '{}'::jsonb,
    timeout_milliseconds := 55000)
  where exists (select 1 from vault.decrypted_secrets where name = 'report_triage_url')
    and (exists (select 1 from public.reports where auto_checked_at is null and status in ('aberta', 'em_analise'))
      or exists (select 1 from public.photos where auto_checked_at is null)
      or exists (select 1 from public.security_alerts where notified_at is null and resolved_at is null))
$$);
