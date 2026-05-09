-- Run this in Supabase SQL Editor after creating the buckets
-- in Dashboard → Storage → New bucket

-- ─── course-materials bucket ─────────────────────────────────
-- Create bucket: name='course-materials', public=false

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'course-materials',
  'course-materials',
  false,
  26214400,  -- 25MB
  array[
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'image/png', 'image/jpeg', 'image/gif', 'image/webp',
    'video/mp4', 'video/webm',
    'text/plain', 'text/csv',
    'application/zip'
  ]
) on conflict (id) do nothing;

-- ─── submissions bucket ───────────────────────────────────────
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'submissions',
  'submissions',
  false,
  26214400,
  array[
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'image/png', 'image/jpeg',
    'text/plain',
    'application/zip'
  ]
) on conflict (id) do nothing;

-- ─── RLS policies ─────────────────────────────────────────────
-- Authenticated users can upload to course-materials
create policy "Authenticated upload to course-materials"
on storage.objects for insert
to authenticated
with check (bucket_id = 'course-materials');

-- Authenticated users can read from course-materials
create policy "Authenticated read course-materials"
on storage.objects for select
to authenticated
using (bucket_id = 'course-materials');

-- Authenticated users can upload to submissions
create policy "Authenticated upload to submissions"
on storage.objects for insert
to authenticated
with check (bucket_id = 'submissions');

-- Authenticated users can read from submissions
create policy "Authenticated read submissions"
on storage.objects for select
to authenticated
using (bucket_id = 'submissions');
