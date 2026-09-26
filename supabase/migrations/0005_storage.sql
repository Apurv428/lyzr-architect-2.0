-- Storage for chat attachments (private) and project thumbnails (public read).
-- Every object lives under "<user id>/..." and only its owner can write it.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('attachments', 'attachments', false, 5242880,
    array['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'application/pdf', 'text/plain', 'text/markdown']),
  ('thumbnails', 'thumbnails', true, 1048576, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

create policy "attachments: owner read" on storage.objects for select to authenticated
  using (bucket_id = 'attachments' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "attachments: owner upload" on storage.objects for insert to authenticated
  with check (bucket_id = 'attachments' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "attachments: owner delete" on storage.objects for delete to authenticated
  using (bucket_id = 'attachments' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "thumbnails: owner upload" on storage.objects for insert to authenticated
  with check (bucket_id = 'thumbnails' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "thumbnails: owner update" on storage.objects for update to authenticated
  using (bucket_id = 'thumbnails' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "thumbnails: owner read" on storage.objects for select to authenticated
  using (bucket_id = 'thumbnails' and (storage.foldername(name))[1] = auth.uid()::text);
