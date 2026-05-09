-- ============================================================
-- 003_boarddesk_paydesk_rpcs.sql
-- Boarddesk: committee session management, attendance, resolutions
-- Paydesk: fee schedules, invoices, payments, clearances
-- ============================================================

-- ─── Boarddesk: List committees for institution ───────────────
create or replace function rpc_get_committees(
  p_institution_id uuid
) returns table (
  id              uuid,
  name            text,
  committee_type  text,
  member_count    bigint,
  session_count   bigint,
  is_active       boolean,
  created_at      timestamptz
) language plpgsql security definer as $$
begin
  return query
  select
    c.id, c.name, c.committee_type::text,
    count(distinct cm.id) filter (where cm.is_active),
    count(distinct cs.id),
    c.is_active, c.created_at
  from committees c
  left join committee_members cm on cm.committee_id = c.id
  left join committee_sessions cs on cs.committee_id = c.id
  where c.institution_id = p_institution_id
  group by c.id
  order by c.created_at desc;
end;
$$;

-- ─── Boarddesk: Ensure default committees exist ───────────────
create or replace function rpc_ensure_committees(
  p_institution_id uuid
) returns void language plpgsql security definer as $$
begin
  insert into committees (institution_id, name, committee_type)
  values
    (p_institution_id, 'Pre-Academic Board', 'pre_academic_board'),
    (p_institution_id, 'Academic Board', 'academic_board')
  on conflict do nothing;
end;
$$;

-- ─── Boarddesk: Get committee members ─────────────────────────
create or replace function rpc_get_committee_members(
  p_committee_id uuid
) returns table (
  id                uuid,
  person_id         uuid,
  person_name       text,
  office_id         uuid,
  office_name       text,
  role_in_committee text,
  joined_at         timestamptz,
  is_active         boolean
) language plpgsql security definer as $$
begin
  return query
  select
    cm.id, cm.person_id,
    p.first_name || ' ' || p.last_name,
    cm.office_id, o.name,
    cm.role_in_committee::text,
    cm.joined_at, cm.is_active
  from committee_members cm
  join persons p on p.id = cm.person_id
  join offices o on o.id = cm.office_id
  where cm.committee_id = p_committee_id
  order by cm.role_in_committee, p.last_name;
end;
$$;

-- ─── Boarddesk: Add committee member ──────────────────────────
create or replace function rpc_add_committee_member(
  p_committee_id    uuid,
  p_person_id       uuid,
  p_office_id       uuid,
  p_role            text  -- 'chair' | 'secretary' | 'member'
) returns jsonb language plpgsql security definer as $$
begin
  insert into committee_members (committee_id, person_id, office_id, role_in_committee)
  values (p_committee_id, p_person_id, p_office_id, p_role::committee_role);
  return jsonb_build_object('success', true);
exception when unique_violation then
  return jsonb_build_object('success', false, 'error', 'Already a member');
end;
$$;

-- ─── Boarddesk: Remove committee member ───────────────────────
create or replace function rpc_remove_committee_member(
  p_member_id uuid
) returns jsonb language plpgsql security definer as $$
begin
  update committee_members set is_active = false, ended_at = now()
  where id = p_member_id;
  return jsonb_build_object('success', true);
end;
$$;

-- ─── Boarddesk: List sessions for a committee ─────────────────
create or replace function rpc_get_sessions(
  p_committee_id uuid
) returns table (
  id                  uuid,
  session_ref         text,
  session_date        date,
  agenda              text,
  submitted_at        timestamptz,
  recorder_name       text,
  attendance_count    bigint,
  resolution_count    bigint,
  created_at          timestamptz
) language plpgsql security definer as $$
begin
  return query
  select
    cs.id, cs.session_ref, cs.session_date, cs.agenda,
    cs.submitted_at,
    p.first_name || ' ' || p.last_name,
    count(distinct sa.id),
    count(distinct cr.id),
    cs.created_at
  from committee_sessions cs
  join persons p on p.id = cs.recorded_by_person
  left join session_attendance sa on sa.session_id = cs.id and sa.present = true
  left join committee_resolutions cr on cr.session_id = cs.id
  where cs.committee_id = p_committee_id
  group by cs.id, p.first_name, p.last_name
  order by cs.session_date desc;
end;
$$;

-- ─── Boarddesk: Create session ────────────────────────────────
create or replace function rpc_create_session(
  p_committee_id      uuid,
  p_session_date      date,
  p_session_ref       text,
  p_agenda            text,
  p_recorded_by_person uuid,
  p_recorded_by_office uuid
) returns uuid language plpgsql security definer as $$
declare
  v_institution_id uuid;
  v_session_id     uuid;
begin
  select institution_id into v_institution_id from committees where id = p_committee_id;

  insert into committee_sessions (
    committee_id, institution_id, session_date, session_ref,
    agenda, recorded_by_office, recorded_by_person
  ) values (
    p_committee_id, v_institution_id, p_session_date, p_session_ref,
    p_agenda, p_recorded_by_office, p_recorded_by_person
  )
  returning id into v_session_id;

  -- Auto-seed attendance from active members
  insert into session_attendance (session_id, person_id, office_id, present)
  select v_session_id, cm.person_id, cm.office_id, false
  from committee_members cm
  where cm.committee_id = p_committee_id and cm.is_active = true;

  return v_session_id;
end;
$$;

-- ─── Boarddesk: Get session detail (attendance + resolutions) ─
create or replace function rpc_get_session_detail(
  p_session_id uuid
) returns jsonb language plpgsql security definer as $$
declare
  v_session  jsonb;
  v_att      jsonb;
  v_res      jsonb;
begin
  select to_jsonb(cs) || jsonb_build_object(
    'committee_name', c.name,
    'committee_type', c.committee_type,
    'recorder_name', p.first_name || ' ' || p.last_name
  )
  into v_session
  from committee_sessions cs
  join committees c on c.id = cs.committee_id
  join persons p on p.id = cs.recorded_by_person
  where cs.id = p_session_id;

  select jsonb_agg(jsonb_build_object(
    'id', sa.id,
    'person_id', sa.person_id,
    'person_name', per.first_name || ' ' || per.last_name,
    'office_name', o.name,
    'role_in_committee', cm.role_in_committee,
    'present', sa.present
  ) order by cm.role_in_committee, per.last_name)
  into v_att
  from session_attendance sa
  join persons per on per.id = sa.person_id
  join offices o on o.id = sa.office_id
  left join committee_members cm on cm.person_id = sa.person_id and cm.committee_id = (
    select committee_id from committee_sessions where id = p_session_id
  )
  where sa.session_id = p_session_id;

  select jsonb_agg(jsonb_build_object(
    'id', cr.id,
    'batch_id', cr.batch_id,
    'entity_id', cr.entity_id,
    'decision', cr.decision,
    'resolution_text', cr.resolution_text,
    'created_at', cr.created_at,
    'batch_dept', d.name,
    'batch_stage', rb.current_stage
  ) order by cr.created_at)
  into v_res
  from committee_resolutions cr
  left join result_batches rb on rb.id = cr.batch_id
  left join departments d on d.id = rb.department_id
  where cr.session_id = p_session_id;

  return jsonb_build_object(
    'session', v_session,
    'attendance', coalesce(v_att, '[]'::jsonb),
    'resolutions', coalesce(v_res, '[]'::jsonb)
  );
end;
$$;

-- ─── Boarddesk: Toggle attendance ─────────────────────────────
create or replace function rpc_toggle_attendance(
  p_session_id uuid,
  p_person_id  uuid,
  p_present    boolean
) returns jsonb language plpgsql security definer as $$
begin
  update session_attendance
  set present = p_present
  where session_id = p_session_id and person_id = p_person_id;
  return jsonb_build_object('success', true);
end;
$$;

-- ─── Boarddesk: Get batches awaiting board stage ──────────────
create or replace function rpc_get_board_batches(
  p_institution_id uuid,
  p_committee_type text   -- 'pre_academic_board' | 'academic_board'
) returns table (
  id            uuid,
  current_stage text,
  dept_name     text,
  dept_code     text,
  faculty_name  text,
  sem_label     text,
  result_count  bigint,
  is_locked     boolean,
  updated_at    timestamptz
) language plpgsql security definer as $$
declare
  v_stage text;
begin
  v_stage := case p_committee_type
    when 'pre_academic_board' then 'pre_academic_board'
    when 'academic_board'     then 'academic_board'
    else 'academic_board'
  end;

  return query
  select
    rb.id, rb.current_stage::text,
    d.name, d.code,
    f.name,
    coalesce(ac.name || ' ', '') || case s.type when 'first' then '1st Sem' when 'second' then '2nd Sem' else '3rd Sem' end,
    count(r.id),
    rb.is_locked, rb.updated_at
  from result_batches rb
  join departments d on d.id = rb.department_id
  left join faculties f on f.id = d.faculty_id
  join semesters s on s.id = rb.semester_id
  join academic_sessions ac on ac.id = s.session_id
  left join results r on r.batch_id = rb.id
  where rb.institution_id = p_institution_id
    and rb.current_stage::text = v_stage
  group by rb.id, d.name, d.code, f.name, ac.name, s.type
  order by rb.updated_at desc;
end;
$$;

-- ─── Boarddesk: Submit session (finalise) ─────────────────────
create or replace function rpc_submit_session(
  p_session_id uuid
) returns jsonb language plpgsql security definer as $$
begin
  update committee_sessions
  set submitted_at = now()
  where id = p_session_id and submitted_at is null;
  return jsonb_build_object('success', true);
end;
$$;

-- ============================================================
-- PAYDESK RPCs
-- ============================================================

-- ─── Paydesk: Get fee schedules ───────────────────────────────
create or replace function rpc_get_fee_schedules(
  p_institution_id uuid
) returns table (
  id             uuid,
  name           text,
  session_name   text,
  session_id     uuid,
  program_name   text,
  level          int,
  is_active      boolean,
  item_count     bigint,
  total_amount   numeric,
  invoice_count  bigint,
  created_at     timestamptz
) language plpgsql security definer as $$
begin
  return query
  select
    fs.id, fs.name,
    ac.name, fs.session_id,
    pr.name, fs.level,
    fs.is_active,
    count(distinct fi.id),
    coalesce(sum(fi.amount), 0),
    count(distinct si.id),
    fs.created_at
  from fee_schedules fs
  join academic_sessions ac on ac.id = fs.session_id
  left join programs pr on pr.id = fs.program_id
  left join fee_items fi on fi.schedule_id = fs.id
  left join student_invoices si on si.schedule_id = fs.id
  where fs.institution_id = p_institution_id
  group by fs.id, ac.name, pr.name
  order by fs.created_at desc;
end;
$$;

-- ─── Paydesk: Get fee items for a schedule ────────────────────
create or replace function rpc_get_fee_items(
  p_schedule_id uuid
) returns table (
  id         uuid,
  name       text,
  amount     numeric,
  item_order int
) language plpgsql security definer as $$
begin
  return query
  select fi.id, fi.name, fi.amount, fi.item_order
  from fee_items fi
  where fi.schedule_id = p_schedule_id
  order by fi.item_order, fi.created_at;
end;
$$;

-- ─── Paydesk: Create fee schedule ────────────────────────────
create or replace function rpc_create_fee_schedule(
  p_institution_id uuid,
  p_session_id     uuid,
  p_name           text,
  p_program_id     uuid,
  p_level          int
) returns uuid language plpgsql security definer as $$
declare v_id uuid;
begin
  insert into fee_schedules (institution_id, session_id, name, program_id, level)
  values (p_institution_id, p_session_id, p_name, p_program_id, p_level)
  returning id into v_id;
  return v_id;
end;
$$;

-- ─── Paydesk: Add fee item ────────────────────────────────────
create or replace function rpc_add_fee_item(
  p_schedule_id uuid,
  p_name        text,
  p_amount      numeric,
  p_order       int default 0
) returns uuid language plpgsql security definer as $$
declare v_id uuid;
begin
  insert into fee_items (schedule_id, name, amount, item_order)
  values (p_schedule_id, p_name, p_amount, p_order)
  returning id into v_id;
  return v_id;
end;
$$;

-- ─── Paydesk: Delete fee item ─────────────────────────────────
create or replace function rpc_delete_fee_item(
  p_item_id uuid
) returns jsonb language plpgsql security definer as $$
begin
  delete from fee_items where id = p_item_id;
  return jsonb_build_object('success', true);
end;
$$;

-- ─── Paydesk: Generate invoices for a schedule ───────────────
create or replace function rpc_generate_invoices(
  p_schedule_id uuid
) returns jsonb language plpgsql security definer as $$
declare
  v_schedule fee_schedules%rowtype;
  v_total    numeric;
  v_count    int := 0;
begin
  select * into v_schedule from fee_schedules where id = p_schedule_id;

  select coalesce(sum(amount), 0) into v_total
  from fee_items where schedule_id = p_schedule_id;

  -- Insert invoice for each matching enrollment (skip existing)
  insert into student_invoices (
    institution_id, student_id, enrollment_id, session_id, schedule_id, total_amount
  )
  select
    v_schedule.institution_id,
    se.student_id,
    se.id,
    v_schedule.session_id,
    v_schedule.id,
    v_total
  from student_enrollments se
  where se.institution_id = v_schedule.institution_id
    and se.status = 'active'
    and (v_schedule.program_id is null or se.program_id = v_schedule.program_id)
    and (v_schedule.level is null or se.current_level = v_schedule.level)
    and not exists (
      select 1 from student_invoices si
      where si.enrollment_id = se.id and si.schedule_id = p_schedule_id
    );

  get diagnostics v_count = row_count;
  return jsonb_build_object('success', true, 'invoices_created', v_count, 'total_amount', v_total);
end;
$$;

-- ─── Paydesk: List invoices ───────────────────────────────────
create or replace function rpc_get_invoices(
  p_institution_id uuid,
  p_schedule_id    uuid default null,
  p_status         text default null
) returns table (
  id             uuid,
  student_name   text,
  student_id     uuid,
  matric_number  text,
  program_name   text,
  level          int,
  total_amount   numeric,
  paid_amount    numeric,
  status         text,
  generated_at   timestamptz
) language plpgsql security definer as $$
begin
  return query
  select
    si.id,
    p.first_name || ' ' || p.last_name,
    si.student_id,
    se.matric_number,
    pr.name,
    se.current_level,
    si.total_amount, si.paid_amount, si.status,
    si.generated_at
  from student_invoices si
  join persons p on p.id = si.student_id
  join student_enrollments se on se.id = si.enrollment_id
  join programs pr on pr.id = se.program_id
  where si.institution_id = p_institution_id
    and (p_schedule_id is null or si.schedule_id = p_schedule_id)
    and (p_status is null or si.status = p_status)
  order by si.generated_at desc;
end;
$$;

-- ─── Paydesk: Record manual payment ──────────────────────────
create or replace function rpc_record_payment(
  p_invoice_id uuid,
  p_amount     numeric,
  p_method     text,
  p_reference  text,
  p_person_id  uuid
) returns jsonb language plpgsql security definer as $$
declare
  v_invoice student_invoices%rowtype;
  v_new_paid numeric;
  v_status   text;
begin
  select * into v_invoice from student_invoices where id = p_invoice_id;

  insert into payments (
    invoice_id, institution_id, student_id,
    amount, method, reference,
    verified_by, source, paid_at
  ) values (
    p_invoice_id, v_invoice.institution_id, v_invoice.student_id,
    p_amount, p_method, p_reference,
    p_person_id, 'manual', now()
  );

  v_new_paid := v_invoice.paid_amount + p_amount;
  v_status := case
    when v_new_paid >= v_invoice.total_amount then 'paid'
    when v_new_paid > 0                        then 'partial'
    else 'unpaid'
  end;

  update student_invoices
  set paid_amount = v_new_paid, status = v_status
  where id = p_invoice_id;

  -- Auto-clear if fully paid
  if v_status = 'paid' then
    insert into financial_clearances (
      institution_id, student_id, session_id,
      is_cleared, cleared_at
    ) values (
      v_invoice.institution_id, v_invoice.student_id, v_invoice.session_id,
      true, now()
    )
    on conflict (institution_id, student_id, session_id)
    do update set is_cleared = true, cleared_at = now(), override_by = null, override_reason = null;
  end if;

  return jsonb_build_object('success', true, 'new_status', v_status, 'paid_amount', v_new_paid);
end;
$$;

-- ─── Paydesk: Get payments for an invoice ────────────────────
create or replace function rpc_get_payments(
  p_invoice_id uuid
) returns table (
  id            uuid,
  amount        numeric,
  method        text,
  reference     text,
  verifier_name text,
  paid_at       timestamptz
) language plpgsql security definer as $$
begin
  return query
  select
    py.id, py.amount, py.method, py.reference,
    p.first_name || ' ' || p.last_name,
    py.paid_at
  from payments py
  left join persons p on p.id = py.verified_by
  where py.invoice_id = p_invoice_id
  order by py.paid_at desc;
end;
$$;

-- ─── Paydesk: Get clearances ──────────────────────────────────
create or replace function rpc_get_clearances(
  p_institution_id uuid,
  p_session_id     uuid
) returns table (
  id              uuid,
  student_name    text,
  student_id      uuid,
  matric_number   text,
  program_name    text,
  is_cleared      boolean,
  override_reason text,
  cleared_at      timestamptz
) language plpgsql security definer as $$
begin
  return query
  select
    fc.id,
    p.first_name || ' ' || p.last_name,
    fc.student_id,
    se.matric_number,
    pr.name,
    fc.is_cleared,
    fc.override_reason,
    fc.cleared_at
  from financial_clearances fc
  join persons p on p.id = fc.student_id
  join student_enrollments se on se.student_id = fc.student_id and se.institution_id = p_institution_id
  join programs pr on pr.id = se.program_id
  where fc.institution_id = p_institution_id
    and fc.session_id = p_session_id
  order by fc.is_cleared, p.last_name;
end;
$$;

-- ─── Paydesk: Override clearance ─────────────────────────────
create or replace function rpc_override_clearance(
  p_institution_id uuid,
  p_student_id     uuid,
  p_session_id     uuid,
  p_cleared        boolean,
  p_reason         text,
  p_by_person_id   uuid
) returns jsonb language plpgsql security definer as $$
begin
  insert into financial_clearances (
    institution_id, student_id, session_id,
    is_cleared, override_by, override_reason, cleared_at
  ) values (
    p_institution_id, p_student_id, p_session_id,
    p_cleared, p_by_person_id, p_reason,
    case when p_cleared then now() else null end
  )
  on conflict (institution_id, student_id, session_id)
  do update set
    is_cleared = p_cleared,
    override_by = p_by_person_id,
    override_reason = p_reason,
    cleared_at = case when p_cleared then now() else null end;

  return jsonb_build_object('success', true);
end;
$$;

-- ─── Paydesk: Financial summary ──────────────────────────────
create or replace function rpc_get_financial_summary(
  p_institution_id uuid,
  p_session_id     uuid
) returns jsonb language plpgsql security definer as $$
declare v_result jsonb;
begin
  select jsonb_build_object(
    'total_invoiced',   coalesce(sum(si.total_amount), 0),
    'total_collected',  coalesce(sum(si.paid_amount), 0),
    'invoice_count',    count(si.id),
    'paid_count',       count(si.id) filter (where si.status = 'paid'),
    'partial_count',    count(si.id) filter (where si.status = 'partial'),
    'unpaid_count',     count(si.id) filter (where si.status = 'unpaid'),
    'cleared_count',    (select count(*) from financial_clearances
                         where institution_id = p_institution_id
                           and session_id = p_session_id
                           and is_cleared = true)
  )
  into v_result
  from student_invoices si
  where si.institution_id = p_institution_id
    and si.session_id = p_session_id;

  return v_result;
end;
$$;
