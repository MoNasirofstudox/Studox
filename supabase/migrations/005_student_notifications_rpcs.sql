-- ============================================================
-- 005_student_notifications_rpcs.sql
-- Student Portal: registration, results, transcript, clearance, timetable
-- Notifications: system_events feed, audit log viewer
-- ============================================================

-- ─── Student: Get own enrollment + institution ────────────────
create or replace function rpc_get_student_context(
  p_person_id uuid
) returns table (
  institution_id   uuid,
  institution_name text,
  enrollment_id    uuid,
  program_name     text,
  program_code     text,
  dept_name        text,
  current_level    int,
  matric_number    text,
  status           text,
  admitted_at      timestamptz
) language plpgsql security definer as $$
begin
  return query
  select
    i.id, i.name,
    se.id,
    pr.name, pr.code,
    d.name,
    se.current_level, se.matric_number, se.status, se.admitted_at
  from student_enrollments se
  join institutions i on i.id = se.institution_id
  join programs pr on pr.id = se.program_id
  join departments d on d.id = pr.department_id
  where se.student_id = p_person_id
    and se.status = 'active'
  limit 1;
end;
$$;

-- ─── Student: Current semester for institution ────────────────
create or replace function rpc_get_current_semester_for_institution(
  p_institution_id uuid
) returns table (
  id           uuid,
  label        text,
  start_date   date,
  end_date     date
) language plpgsql security definer as $$
begin
  return query
  select
    s.id,
    ac.name || ' — ' || case s.type when 'first' then '1st Sem' when 'second' then '2nd Sem' else '3rd Sem' end,
    s.start_date, s.end_date
  from semesters s
  join academic_sessions ac on ac.id = s.session_id
  where s.institution_id = p_institution_id
    and s.is_current = true
  limit 1;
end;
$$;

-- ─── Student: Available offerings to register ────────────────
create or replace function rpc_get_available_offerings(
  p_enrollment_id uuid,
  p_semester_id   uuid
) returns table (
  id             uuid,
  course_code    text,
  course_name    text,
  level          int,
  credit_units   int,
  dept_name      text,
  lecturer_name  text,
  is_registered  boolean
) language plpgsql security definer as $$
declare v_institution_id uuid; v_program_id uuid; v_level int;
begin
  select se.institution_id, se.program_id, se.current_level
  into v_institution_id, v_program_id, v_level
  from student_enrollments se where se.id = p_enrollment_id;

  return query
  select
    co.id, c.code, c.name, c.level, c.credit_units,
    d.name,
    p.first_name || ' ' || p.last_name,
    exists(
      select 1 from course_registrations cr
      where cr.offering_id = co.id
        and cr.enrollment_id = p_enrollment_id
        and cr.is_active = true
    )
  from course_offerings co
  join courses c on c.id = co.course_id
  join departments d on d.id = c.department_id
  left join persons p on p.id = co.lecturer_id
  where co.institution_id = v_institution_id
    and co.semester_id = p_semester_id
    and co.is_active = true
    and co.lecturer_id is not null
  order by c.level, c.code;
end;
$$;

-- ─── Student: Register courses ────────────────────────────────
create or replace function rpc_student_register_courses(
  p_enrollment_id uuid,
  p_offering_ids  uuid[]
) returns jsonb language plpgsql security definer as $$
declare
  v_institution_id uuid;
  v_student_id     uuid;
  v_count          int := 0;
  v_oid            uuid;
begin
  select institution_id, student_id into v_institution_id, v_student_id
  from student_enrollments where id = p_enrollment_id;

  foreach v_oid in array p_offering_ids loop
    insert into course_registrations(institution_id, enrollment_id, offering_id, student_id)
    values(v_institution_id, p_enrollment_id, v_oid, v_student_id)
    on conflict(enrollment_id, offering_id) do update set is_active = true;
    v_count := v_count + 1;
  end loop;

  return jsonb_build_object('success', true, 'registered', v_count);
end;
$$;

-- ─── Student: Get registered courses ─────────────────────────
create or replace function rpc_get_my_registrations(
  p_enrollment_id uuid,
  p_semester_id   uuid
) returns table (
  offering_id   uuid,
  course_code   text,
  course_name   text,
  level         int,
  credit_units  int,
  lecturer_name text,
  registered_at timestamptz
) language plpgsql security definer as $$
begin
  return query
  select
    co.id, c.code, c.name, c.level, c.credit_units,
    p.first_name || ' ' || p.last_name,
    cr.registered_at
  from course_registrations cr
  join course_offerings co on co.id = cr.offering_id
  join courses c on c.id = co.course_id
  left join persons p on p.id = co.lecturer_id
  where cr.enrollment_id = p_enrollment_id
    and co.semester_id = p_semester_id
    and cr.is_active = true
  order by c.code;
end;
$$;

-- ─── Student: Get results ─────────────────────────────────────
create or replace function rpc_get_my_results(
  p_person_id      uuid,
  p_institution_id uuid
) returns table (
  course_code    text,
  course_name    text,
  credit_units   int,
  ca_score       numeric,
  exam_score     numeric,
  total_score    numeric,
  grade          text,
  grade_point    numeric,
  status         text,
  session_name   text,
  sem_label      text
) language plpgsql security definer as $$
begin
  return query
  select
    c.code, c.name, c.credit_units,
    r.ca_score, r.exam_score, r.total_score,
    r.grade, r.grade_point,
    r.status::text,
    ac.name,
    case s.type when 'first' then '1st Sem' when 'second' then '2nd Sem' else '3rd Sem' end
  from results r
  join course_registrations cr on cr.id = r.registration_id
  join course_offerings co on co.id = cr.offering_id
  join courses c on c.id = co.course_id
  join semesters s on s.id = co.semester_id
  join academic_sessions ac on ac.id = s.session_id
  where r.student_id = p_person_id
    and r.institution_id = p_institution_id
    and r.status = 'published'
  order by ac.start_date desc, s.type, c.code;
end;
$$;

-- ─── Student: Get clearance status ───────────────────────────
create or replace function rpc_get_my_clearance(
  p_person_id      uuid,
  p_institution_id uuid
) returns table (
  session_id      uuid,
  session_name    text,
  is_cleared      boolean,
  override_reason text,
  cleared_at      timestamptz
) language plpgsql security definer as $$
begin
  return query
  select
    fc.session_id,
    ac.name,
    fc.is_cleared,
    fc.override_reason,
    fc.cleared_at
  from financial_clearances fc
  join academic_sessions ac on ac.id = fc.session_id
  where fc.student_id = p_person_id
    and fc.institution_id = p_institution_id
  order by ac.start_date desc;
end;
$$;

-- ─── Student: Get own timetable ───────────────────────────────
create or replace function rpc_get_my_timetable(
  p_person_id      uuid,
  p_institution_id uuid,
  p_semester_id    uuid
) returns table (
  day           text,
  start_time    time,
  end_time      time,
  course_code   text,
  course_name   text,
  lecturer_name text,
  room_name     text
) language plpgsql security definer as $$
begin
  return query
  select
    ts.day, ts.start_time, ts.end_time,
    c.code, c.name,
    p.first_name || ' ' || p.last_name,
    r.name
  from timetable_slots ts
  join course_offerings co on co.id = ts.offering_id
  join courses c on c.id = co.course_id
  left join persons p on p.id = co.lecturer_id
  left join rooms r on r.id = ts.room_id
  where ts.institution_id = p_institution_id
    and co.semester_id = p_semester_id
    and exists (
      select 1 from course_registrations cr
      where cr.offering_id = co.id
        and cr.student_id = p_person_id
        and cr.is_active = true
    )
  order by
    array_position(array['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'], ts.day),
    ts.start_time;
end;
$$;

-- ─── Notifications: Get system events for a person ───────────
create or replace function rpc_get_my_events(
  p_person_id      uuid,
  p_institution_id uuid,
  p_limit          int default 50
) returns table (
  id           uuid,
  event_type   text,
  entity_type  text,
  entity_id    uuid,
  payload      jsonb,
  actor_name   text,
  office_name  text,
  created_at   timestamptz
) language plpgsql security definer as $$
begin
  return query
  select
    se.id, se.event_type, se.entity_type, se.entity_id,
    se.payload,
    p.first_name || ' ' || p.last_name,
    o.name,
    se.created_at
  from system_events se
  join persons p on p.id = se.triggered_by
  join offices o on o.id = se.triggered_office
  where se.institution_id = p_institution_id
  order by se.created_at desc
  limit p_limit;
end;
$$;

-- ─── Audit Log: Get audit entries for institution ────────────
create or replace function rpc_get_audit_log(
  p_institution_id uuid,
  p_limit          int default 100,
  p_entity_type    text default null,
  p_person_id_filter uuid default null
) returns table (
  id             uuid,
  action         text,
  entity_type    text,
  entity_id      uuid,
  person_name    text,
  office_name    text,
  authority_src  text,
  payload        jsonb,
  created_at     timestamptz
) language plpgsql security definer as $$
begin
  return query
  select
    al.id, al.action, al.entity_type, al.entity_id,
    p.first_name || ' ' || p.last_name,
    o.name,
    al.authority_source::text,
    al.payload,
    al.created_at
  from audit_log al
  join persons p on p.id = al.person_id
  join offices o on o.id = al.office_id
  where al.institution_id = p_institution_id
    and (p_entity_type is null or al.entity_type = p_entity_type)
    and (p_person_id_filter is null or al.person_id = p_person_id_filter)
  order by al.created_at desc
  limit p_limit;
end;
$$;
