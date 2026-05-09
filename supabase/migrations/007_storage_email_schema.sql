-- ============================================================
-- 007_storage_email_schema.sql
-- Storage: bucket policies for course materials + submissions
-- Email: outbound email queue with retry tracking
-- Push: device token registry for web push
-- ============================================================

-- ─── Storage bucket setup (run after bucket created in dashboard) ─
-- Bucket names: 'course-materials' and 'submissions'
-- These policies assume the buckets exist. Create them in the
-- Supabase dashboard or via CLI: supabase storage buckets create course-materials

-- RLS policy for course-materials bucket:
-- Lecturers can upload to their own institution/offering prefix.
-- All authenticated users can read (download).
-- We enforce path conventions in the app: {institution_id}/{offering_id}/{filename}

-- Storage object table is managed by Supabase internally.
-- We only add application-level metadata here.

create table if not exists storage_objects_meta (
  id              uuid primary key default gen_random_uuid(),
  bucket          text not null,
  storage_path    text not null unique,
  institution_id  uuid not null references institutions(id),
  uploaded_by     uuid not null references persons(id),
  file_size       bigint,
  mime_type       text,
  created_at      timestamptz not null default now()
);

-- ─── Email queue ──────────────────────────────────────────────
create table if not exists email_queue (
  id              uuid primary key default gen_random_uuid(),
  institution_id  uuid references institutions(id),
  to_address      text not null,
  to_name         text,
  subject         text not null,
  template        text not null,  -- 'result_published' | 'assignment_graded' | 'payment_confirmed' | 'clearance_updated'
  payload         jsonb not null default '{}',
  status          text not null default 'pending'
                  check (status in ('pending', 'sent', 'failed', 'skipped')),
  attempts        int not null default 0,
  last_error      text,
  sent_at         timestamptz,
  created_at      timestamptz not null default now()
);

create index if not exists email_queue_status_idx on email_queue(status, created_at);

-- ─── Push token registry ──────────────────────────────────────
create table if not exists push_tokens (
  id              uuid primary key default gen_random_uuid(),
  person_id       uuid not null references persons(id),
  endpoint        text not null unique,
  p256dh          text not null,
  auth            text not null,
  user_agent      text,
  is_active       boolean not null default true,
  created_at      timestamptz not null default now()
);

create index if not exists push_tokens_person_idx on push_tokens(person_id, is_active);

-- ─── RPC: Enqueue email ───────────────────────────────────────
create or replace function rpc_enqueue_email(
  p_institution_id uuid,
  p_to_address     text,
  p_to_name        text,
  p_subject        text,
  p_template       text,
  p_payload        jsonb default '{}'
) returns uuid language plpgsql security definer as $$
declare v_id uuid;
begin
  insert into email_queue(institution_id, to_address, to_name, subject, template, payload)
  values(p_institution_id, p_to_address, p_to_name, p_subject, p_template, p_payload)
  returning id into v_id;
  return v_id;
end;
$$;

-- ─── RPC: Register push token ─────────────────────────────────
create or replace function rpc_register_push_token(
  p_person_id uuid,
  p_endpoint  text,
  p_p256dh    text,
  p_auth      text,
  p_user_agent text default null
) returns jsonb language plpgsql security definer as $$
begin
  insert into push_tokens(person_id, endpoint, p256dh, auth, user_agent)
  values(p_person_id, p_endpoint, p_p256dh, p_auth, p_user_agent)
  on conflict(endpoint) do update
    set person_id = p_person_id,
        p256dh    = p_p256dh,
        auth      = p_auth,
        is_active = true;
  return jsonb_build_object('success', true);
end;
$$;

-- ─── RPC: Get pending emails (for edge function) ──────────────
create or replace function rpc_get_pending_emails(
  p_limit int default 50
) returns table (
  id         uuid,
  to_address text,
  to_name    text,
  subject    text,
  template   text,
  payload    jsonb,
  attempts   int
) language plpgsql security definer as $$
begin
  return query
  select eq.id, eq.to_address, eq.to_name, eq.subject, eq.template, eq.payload, eq.attempts
  from email_queue eq
  where eq.status = 'pending' and eq.attempts < 3
  order by eq.created_at
  limit p_limit;
end;
$$;

-- ─── RPC: Mark email sent/failed ─────────────────────────────
create or replace function rpc_mark_email_sent(p_id uuid, p_error text default null)
returns void language plpgsql security definer as $$
begin
  if p_error is null then
    update email_queue set status='sent', sent_at=now(), attempts=attempts+1 where id=p_id;
  else
    update email_queue
    set attempts=attempts+1, last_error=p_error,
        status = case when attempts+1 >= 3 then 'failed' else 'pending' end
    where id=p_id;
  end if;
end;
$$;

-- ─── RPC: Get push tokens for a person ───────────────────────
create or replace function rpc_get_push_tokens(
  p_person_id uuid
) returns table (
  endpoint text,
  p256dh   text,
  auth     text
) language plpgsql security definer as $$
begin
  return query
  select pt.endpoint, pt.p256dh, pt.auth
  from push_tokens pt
  where pt.person_id = p_person_id and pt.is_active = true;
end;
$$;

-- ─── RPC: Enqueue notification (email + push) after key events ─
-- Called from application layer after: result published, grade posted,
-- payment recorded, clearance changed
create or replace function rpc_notify_student(
  p_institution_id uuid,
  p_student_id     uuid,
  p_template       text,
  p_subject        text,
  p_payload        jsonb
) returns void language plpgsql security definer as $$
declare
  v_email text;
  v_name  text;
begin
  select email, first_name || ' ' || last_name
  into v_email, v_name
  from persons where id = p_student_id;

  if v_email is not null then
    perform rpc_enqueue_email(
      p_institution_id, v_email, v_name,
      p_subject, p_template, p_payload
    );
  end if;
end;
$$;

-- ─── RPC: Storage path helpers ────────────────────────────────
create or replace function rpc_log_storage_object(
  p_bucket         text,
  p_storage_path   text,
  p_institution_id uuid,
  p_uploaded_by    uuid,
  p_file_size      bigint default null,
  p_mime_type      text   default null
) returns void language plpgsql security definer as $$
begin
  insert into storage_objects_meta(bucket, storage_path, institution_id, uploaded_by, file_size, mime_type)
  values(p_bucket, p_storage_path, p_institution_id, p_uploaded_by, p_file_size, p_mime_type)
  on conflict(storage_path) do update set file_size=p_file_size, mime_type=p_mime_type;
end;
$$;
