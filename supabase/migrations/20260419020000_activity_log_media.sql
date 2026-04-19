-- Add optional photo attachments to activity_log.
-- media_url: public URL in the `activity-media` storage bucket.
-- media_type: 'image' for now; room to add 'audio' later.

alter table activity_log add column if not exists media_url  text;
alter table activity_log add column if not exists media_type text;

-- Allow photo-only entries (text was NOT NULL in the original table)
alter table activity_log alter column text drop not null;

-- Require at least one of text or media so rows aren't empty
alter table activity_log
  add constraint activity_log_has_content_ck
  check (
    (text is not null and length(btrim(text)) > 0)
    or (media_url is not null and length(media_url) > 0)
  );

-- Storage bucket for activity media (photos, later audio).
-- Public read so clients can render <img> without signed URLs during dev.
insert into storage.buckets (id, name, public)
values ('activity-media', 'activity-media', true)
on conflict (id) do nothing;

-- Dev-mode RLS: anon can upload + read + delete their own uploads in this bucket.
drop policy if exists "activity-media anon read"   on storage.objects;
drop policy if exists "activity-media anon insert" on storage.objects;
drop policy if exists "activity-media anon delete" on storage.objects;

create policy "activity-media anon read"
  on storage.objects for select to anon
  using (bucket_id = 'activity-media');

create policy "activity-media anon insert"
  on storage.objects for insert to anon
  with check (bucket_id = 'activity-media');

create policy "activity-media anon delete"
  on storage.objects for delete to anon
  using (bucket_id = 'activity-media');
