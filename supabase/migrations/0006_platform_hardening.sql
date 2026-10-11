-- =====================================================================
-- 0006 — Hardening da plataforma Supabase (Storage + agendamentos)
-- Não roda no teste local com PGlite.
-- =====================================================================

-- FU-006 / FU-001 — Upload só com nome gerado pelo app, na pasta do dono,
-- com extensão de imagem. O bucket já limita a 5 MB e a image/jpeg|png|webp.
drop policy if exists photos_upload_own on storage.objects;
create policy photos_upload_own on storage.objects for insert to authenticated
  with check (
    bucket_id = 'photos'
    and (storage.foldername(name))[1] = auth.uid()::text
    and name ~ ('^' || auth.uid()::text || '/[A-Za-z0-9_-]{1,64}\.(jpg|jpeg|png|webp)$')
  );

-- Leitura: foto aprovada de perfil visível, não banido e fora de revisão.
drop policy if exists photos_read_approved on storage.objects;
create policy photos_read_approved on storage.objects for select to authenticated
  using (
    bucket_id = 'photos' and exists (
      select 1 from public.photos p
      join public.profiles pr on pr.id = p.user_id
      where p.storage_path = storage.objects.name
        and (p.user_id = auth.uid()
             or (p.approved and pr.is_visible and pr.banned_at is null and pr.moderation_hidden_at is null))
    )
  );

-- DA-003 — Retenção diária às 03:17 (horário UTC)
-- Requer a extensão pg_cron (Database → Extensions no painel do Supabase).
create extension if not exists pg_cron;
select cron.schedule('purge-expired-data', '17 3 * * *', $$select public.purge_expired_data()$$);
