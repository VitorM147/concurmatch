-- =====================================================================
-- 0015 — Plataforma: painel do suporte e robô de selfie
-- Não roda no teste local com PGlite.
--
-- Robô de selfie (opcional, liga quando houver conta AWS):
--   select vault.create_secret('https://<projeto>.supabase.co/functions/v1/selfie-check', 'selfie_check_url');
--   select vault.create_secret('<texto aleatório longo>', 'selfie_check_secret');
--   supabase secrets set SELFIE_CHECK_SECRET=... AWS_ACCESS_KEY_ID=... AWS_SECRET_ACCESS_KEY=... AWS_REGION=sa-east-1
--   supabase functions deploy selfie-check --no-verify-jwt
-- Sem esses segredos o agendamento não chama nada e a selfie fica para o painel.
-- =====================================================================

-- Suporte enxerga selfies de verificação e fotos (inclusive reprovadas)
create policy photos_read_admin on storage.objects for select to authenticated
  using (bucket_id = 'photos' and public.is_admin());

-- Suporte apaga a selfie de verificação depois de decidir (a Política promete isso)
create policy photos_delete_admin_selfie on storage.objects for delete to authenticated
  using (bucket_id = 'photos' and public.is_admin() and name ~ '/verificacao-[A-Za-z0-9_-]+\.(jpg|jpeg|png|webp)$');

grant execute on function
  public.verification_auto_pending(integer),
  public.apply_verification_result(bigint, text, text, jsonb)
to service_role;

select cron.schedule('selfie-check', '* * * * *', $$
  select net.http_post(
    url     := (select decrypted_secret from vault.decrypted_secrets where name = 'selfie_check_url'),
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-worker-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'selfie_check_secret')),
    body    := '{}'::jsonb,
    timeout_milliseconds := 55000)
  where exists (select 1 from vault.decrypted_secrets where name = 'selfie_check_url')
    and exists (select 1 from public.verification_requests
                 where status = 'pendente' and auto_checked_at is null and not needs_human)
$$);
