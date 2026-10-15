-- 0020 — Plataforma Supabase: permissões, uploads bloqueados após exclusão,
-- limpeza de órfãos pela Storage API e agendamento do worker.
grant execute on function public.ack_alert_delivery(bigint[], uuid, boolean),
  public.deletion_jobs_pending(integer), public.retry_account_deletion(uuid, uuid),
  public.file_cleanup_pending(integer), public.ack_file_cleanup(text[]) to service_role;

-- Não deletar storage.objects via SQL: apenas agendar a remoção pela Storage API.
create function public.scan_orphan_photos() returns integer
language plpgsql security definer set search_path = public as $$
declare total integer;
begin
  insert into public.file_cleanup_jobs(path)
    select o.name from storage.objects o
     where o.bucket_id = 'photos' and o.created_at < now() - interval '24 hours'
       and not exists (select 1 from public.photos p where p.storage_path = o.name)
       and not exists (select 1 from public.verification_requests v where v.selfie_path = o.name and v.status in ('pendente', 'aguardando_selfie'))
     order by o.created_at limit 100 on conflict do nothing;
  get diagnostics total = row_count;
  return total;
end $$;
revoke all on function public.scan_orphan_photos() from public, anon, authenticated;
grant execute on function public.scan_orphan_photos() to service_role;

drop policy photos_upload_own on storage.objects;
create policy photos_upload_own on storage.objects for insert to authenticated with check (
  bucket_id = 'photos' and (storage.foldername(name))[1] = auth.uid()::text
  and name ~ ('^' || auth.uid()::text || '/[A-Za-z0-9_-]{1,64}\.(jpg|jpeg|png|webp)$')
  and public.can_upload_photo_path(name)
);
drop policy photos_read_approved on storage.objects;
create policy photos_read_approved on storage.objects for select to authenticated using (
  bucket_id = 'photos' and (
    ((storage.foldername(name))[1] = auth.uid()::text
      and exists (select 1 from public.profiles p where p.id = auth.uid() and p.banned_at is null))
    or exists (select 1 from public.photos ph join public.profiles p on p.id = ph.user_id
      where ph.storage_path = name and ph.approved and p.is_visible
        and p.banned_at is null and p.moderation_hidden_at is null)
  )
);

select cron.schedule('storage-maintenance', '*/5 * * * *', $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'storage_maintenance_url'),
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-worker-secret',
      (select decrypted_secret from vault.decrypted_secrets where name = 'storage_maintenance_secret')),
    body := '{}'::jsonb, timeout_milliseconds := 55000)
  where exists (select 1 from vault.decrypted_secrets where name = 'storage_maintenance_url')
$$);
