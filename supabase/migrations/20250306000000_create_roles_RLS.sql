-- RLS: users can only access their own folder (first path segment = auth.uid())
create policy "Users can manage own role files"
on storage.objects for all
to authenticated
using (
  bucket_id = 'Roles'
  and (storage.foldername(name))[1] = auth.uid()::text
)
with check (
  bucket_id = 'Roles'
  and (storage.foldername(name))[1] = auth.uid()::text
);
