-- ============================================================
-- And Done — Phase 2: Storage Buckets
-- ============================================================

-- ── Create buckets ───────────────────────────────────────────
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('invoices',  'invoices',  false, 10485760,  -- 10MB
    array['image/jpeg','image/png','image/webp','image/heic','application/pdf']),
  ('documents', 'documents', false, 52428800,  -- 50MB
    array['image/jpeg','image/png','application/pdf','text/plain',
          'application/msword',
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document']),
  ('logos',     'logos',     true,  2097152,   -- 2MB
    array['image/jpeg','image/png','image/webp','image/svg+xml']);

-- ============================================================
-- Storage RLS Policies
-- ============================================================

-- ── invoices bucket — org-scoped, finance roles only ─────────
create policy "Finance roles can upload invoices"
  on storage.objects for insert
  with check (
    bucket_id = 'invoices'
    and my_role() in ('owner', 'bookkeeper', 'regional_manager')
    and (storage.foldername(name))[1] = my_org_id()::text
  );

create policy "Finance roles can read invoices"
  on storage.objects for select
  using (
    bucket_id = 'invoices'
    and (storage.foldername(name))[1] = my_org_id()::text
  );

create policy "Finance roles can delete invoices"
  on storage.objects for delete
  using (
    bucket_id = 'invoices'
    and my_role() in ('owner', 'bookkeeper', 'regional_manager')
    and (storage.foldername(name))[1] = my_org_id()::text
  );

-- ── documents bucket — org-scoped, owners manage ─────────────
create policy "Owners can upload documents"
  on storage.objects for insert
  with check (
    bucket_id = 'documents'
    and my_role() in ('owner', 'regional_manager')
    and (storage.foldername(name))[1] = my_org_id()::text
  );

create policy "All users can read documents"
  on storage.objects for select
  using (
    bucket_id = 'documents'
    and (storage.foldername(name))[1] = my_org_id()::text
  );

create policy "Owners can delete documents"
  on storage.objects for delete
  using (
    bucket_id = 'documents'
    and my_role() in ('owner', 'regional_manager')
    and (storage.foldername(name))[1] = my_org_id()::text
  );

-- ── logos bucket — public read, owners upload ────────────────
create policy "Owners can upload logos"
  on storage.objects for insert
  with check (
    bucket_id = 'logos'
    and my_role() = 'owner'
  );

create policy "Public can read logos"
  on storage.objects for select
  using (bucket_id = 'logos');
