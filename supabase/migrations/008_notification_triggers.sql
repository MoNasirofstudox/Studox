-- ============================================================
-- 008_notification_triggers.sql
-- Postgres triggers that enqueue notifications atomically
-- with the write that caused them — no app-layer coordination needed
-- ============================================================

-- ─── Helper: get student email + name ────────────────────────
create or replace function _get_person_email_name(p_person_id uuid)
returns table(email text, full_name text)
language sql security definer as $$
  select email, first_name || ' ' || last_name
  from persons where id = p_person_id;
$$;

-- ─── Helper: get institution_id for a result ─────────────────
create or replace function _result_institution(p_result_id uuid)
returns uuid language sql security definer as $$
  select institution_id from results where id = p_result_id;
$$;

-- ============================================================
-- TRIGGER 1: Results published
-- Fires when results.status changes to 'published'
-- Enqueues one email per affected student
-- ============================================================
create or replace function _trg_result_published()
returns trigger language plpgsql security definer as $$
declare
  v_email       text;
  v_name        text;
  v_course_code text;
  v_course_name text;
  v_inst_name   text;
begin
  -- Only act on status → published transition
  if NEW.status <> 'published' or OLD.status = 'published' then
    return NEW;
  end if;

  -- Gather context
  select c.code, c.name
  into v_course_code, v_course_name
  from results r
  join course_registrations cr on cr.id = r.registration_id
  join course_offerings co on co.id = cr.offering_id
  join courses c on c.id = co.course_id
  where r.id = NEW.id;

  select i.name into v_inst_name
  from institutions i where i.id = NEW.institution_id;

  select p.email, p.first_name || ' ' || p.last_name
  into v_email, v_name
  from persons p where p.id = NEW.student_id;

  if v_email is null then return NEW; end if;

  perform rpc_enqueue_email(
    NEW.institution_id,
    v_email,
    v_name,
    'Results Published — ' || coalesce(v_course_code, 'Your Course'),
    'result_published',
    jsonb_build_object(
      'student_name',    v_name,
      'course_code',     coalesce(v_course_code, ''),
      'course_name',     coalesce(v_course_name, ''),
      'institution_name',coalesce(v_inst_name, '')
    )
  );

  return NEW;
end;
$$;

drop trigger if exists trg_result_published on results;
create trigger trg_result_published
  after update of status on results
  for each row execute function _trg_result_published();

-- ============================================================
-- TRIGGER 2: Assignment graded
-- Fires when assignment_grades row is inserted or updated
-- ============================================================
create or replace function _trg_assignment_graded()
returns trigger language plpgsql security definer as $$
declare
  v_student_id   uuid;
  v_inst_id      uuid;
  v_email        text;
  v_name         text;
  v_assign_title text;
  v_max_score    numeric;
begin
  select sub.student_id, sub.institution_id
  into v_student_id, v_inst_id
  from assignment_submissions sub
  where sub.id = NEW.submission_id;

  select a.title, a.max_score
  into v_assign_title, v_max_score
  from assignment_submissions sub
  join assignments a on a.id = sub.assignment_id
  where sub.id = NEW.submission_id;

  select p.email, p.first_name || ' ' || p.last_name
  into v_email, v_name
  from persons p where p.id = v_student_id;

  if v_email is null then return NEW; end if;

  perform rpc_enqueue_email(
    v_inst_id,
    v_email,
    v_name,
    'Assignment Graded — ' || coalesce(v_assign_title, 'Your Submission'),
    'assignment_graded',
    jsonb_build_object(
      'student_name',    v_name,
      'assignment_title',coalesce(v_assign_title, ''),
      'score',           NEW.score::text,
      'max_score',       coalesce(v_max_score::text, '100'),
      'comment',         coalesce(NEW.comment, '')
    )
  );

  return NEW;
end;
$$;

drop trigger if exists trg_assignment_graded on assignment_grades;
create trigger trg_assignment_graded
  after insert or update of score on assignment_grades
  for each row execute function _trg_assignment_graded();

-- ============================================================
-- TRIGGER 3: Payment recorded
-- Fires when student_invoices.paid_amount or status changes
-- ============================================================
create or replace function _trg_payment_confirmed()
returns trigger language plpgsql security definer as $$
declare
  v_email       text;
  v_name        text;
  v_sess_name   text;
begin
  -- Only when status changes to 'paid' or 'partial'
  if NEW.status = OLD.status then return NEW; end if;
  if NEW.status not in ('paid', 'partial') then return NEW; end if;

  select p.email, p.first_name || ' ' || p.last_name
  into v_email, v_name
  from persons p where p.id = NEW.student_id;

  select ac.name into v_sess_name
  from academic_sessions ac where ac.id = NEW.session_id;

  if v_email is null then return NEW; end if;

  perform rpc_enqueue_email(
    NEW.institution_id,
    v_email,
    v_name,
    case NEW.status when 'paid' then 'Payment Complete — Studox OS' else 'Payment Received — Studox OS' end,
    'payment_confirmed',
    jsonb_build_object(
      'student_name',  v_name,
      'amount',        (NEW.paid_amount - OLD.paid_amount)::text,
      'reference',     '',
      'session_name',  coalesce(v_sess_name, ''),
      'is_cleared',    (NEW.status = 'paid')::text
    )
  );

  return NEW;
end;
$$;

drop trigger if exists trg_payment_confirmed on student_invoices;
create trigger trg_payment_confirmed
  after update of status, paid_amount on student_invoices
  for each row execute function _trg_payment_confirmed();

-- ============================================================
-- TRIGGER 4: Clearance updated
-- Fires when financial_clearances.is_cleared changes
-- ============================================================
create or replace function _trg_clearance_updated()
returns trigger language plpgsql security definer as $$
declare
  v_email     text;
  v_name      text;
  v_sess_name text;
begin
  if NEW.is_cleared = OLD.is_cleared then return NEW; end if;

  select p.email, p.first_name || ' ' || p.last_name
  into v_email, v_name
  from persons p where p.id = NEW.student_id;

  select ac.name into v_sess_name
  from academic_sessions ac where ac.id = NEW.session_id;

  if v_email is null then return NEW; end if;

  perform rpc_enqueue_email(
    NEW.institution_id,
    v_email,
    v_name,
    'Clearance Status Updated — Studox OS',
    'clearance_updated',
    jsonb_build_object(
      'student_name',   v_name,
      'session_name',   coalesce(v_sess_name, ''),
      'is_cleared',     NEW.is_cleared::text,
      'override_reason',coalesce(NEW.override_reason, '')
    )
  );

  return NEW;
end;
$$;

drop trigger if exists trg_clearance_updated on financial_clearances;
create trigger trg_clearance_updated
  after update of is_cleared on financial_clearances
  for each row execute function _trg_clearance_updated();

-- ============================================================
-- TRIGGER 5: Push notification via pg_net (non-blocking HTTP)
-- Fires after email is enqueued — calls edge function immediately
-- for real-time push alongside the async email drain
-- Requires: pg_net extension (enabled by default on Supabase)
-- ============================================================
create or replace function _trg_push_on_email_queue()
returns trigger language plpgsql security definer as $$
declare
  v_person_id uuid;
  v_title     text;
  v_body      text;
  v_url       text;
  v_supabase_url text;
  v_service_key  text;
begin
  -- Resolve person_id from email address
  select id into v_person_id from persons where email = NEW.to_address limit 1;
  if v_person_id is null then return NEW; end if;

  -- Build push payload from template
  case NEW.template
    when 'result_published' then
      v_title := 'Results Published';
      v_body  := coalesce(NEW.payload->>'course_code', 'Your') || ' results are now available.';
      v_url   := '/student';
    when 'assignment_graded' then
      v_title := 'Assignment Graded';
      v_body  := (NEW.payload->>'assignment_title') || ' — Score: ' || (NEW.payload->>'score') || '/' || (NEW.payload->>'max_score');
      v_url   := '/desk';
    when 'payment_confirmed' then
      v_title := 'Payment Confirmed';
      v_body  := '₦' || (NEW.payload->>'amount') || ' received on your account.';
      v_url   := '/student';
    when 'clearance_updated' then
      v_title := 'Clearance Updated';
      v_body  := case when (NEW.payload->>'is_cleared') = 'true' then 'You are now financially cleared.' else 'Your clearance status has changed.' end;
      v_url   := '/student';
    else
      return NEW;
  end case;

  -- Read runtime config (set via Supabase dashboard → Settings → Vault)
  v_supabase_url := current_setting('app.supabase_url', true);
  v_service_key  := current_setting('app.service_role_key', true);

  -- Non-blocking HTTP POST via pg_net
  if v_supabase_url is not null and v_service_key is not null then
    perform net.http_post(
      url     := v_supabase_url || '/functions/v1/send-notification',
      headers := jsonb_build_object(
        'Authorization', 'Bearer ' || v_service_key,
        'Content-Type',  'application/json'
      ),
      body    := jsonb_build_object(
        'person_id', v_person_id,
        'title',     v_title,
        'body',      v_body,
        'url',       v_url
      )
    );
  end if;

  return NEW;
end;
$$;

drop trigger if exists trg_push_on_email_queue on email_queue;
create trigger trg_push_on_email_queue
  after insert on email_queue
  for each row execute function _trg_push_on_email_queue();

-- ─── Vault config instructions ────────────────────────────────
-- Run these once in the SQL editor to configure pg_net calls:
--
-- alter database postgres set app.supabase_url = 'https://your-project.supabase.co';
-- alter database postgres set app.service_role_key = 'your-service-role-key';
--
-- Or use Supabase Vault (recommended for secrets):
-- select vault.create_secret('https://your-project.supabase.co', 'supabase_url');
-- select vault.create_secret('your-service-role-key', 'service_role_key');
-- Then update _trg_push_on_email_queue to use:
--   select decrypted_secret into v_supabase_url from vault.decrypted_secrets where name = 'supabase_url';
