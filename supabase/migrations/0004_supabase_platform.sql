-- =====================================================================
-- Recursos específicos da plataforma Supabase (Storage + Realtime).
-- Não roda no teste local com PGlite.
-- =====================================================================

-- Bucket privado de fotos: caminho = <user_id>/<arquivo>.jpg
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('photos', 'photos', false, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

-- Dono envia/apaga as próprias fotos
create policy photos_upload_own on storage.objects for insert to authenticated
  with check (bucket_id = 'photos' and (storage.foldername(name))[1] = auth.uid()::text);

create policy photos_delete_own on storage.objects for delete to authenticated
  using (bucket_id = 'photos' and (storage.foldername(name))[1] = auth.uid()::text);

-- Leitura: qualquer usuário autenticado pode gerar URL assinada de foto APROVADA
-- de perfil visível e não banido (necessário para o discovery e o chat).
create policy photos_read_approved on storage.objects for select to authenticated
  using (
    bucket_id = 'photos' and exists (
      select 1 from public.photos p
      join public.profiles pr on pr.id = p.user_id
      where p.storage_path = storage.objects.name
        and (p.user_id = auth.uid() or (p.approved and pr.is_visible and pr.banned_at is null))
    )
  );

-- Realtime do chat: mensagens novas chegam via canal (RLS filtra quem recebe)
alter publication supabase_realtime add table public.messages;
