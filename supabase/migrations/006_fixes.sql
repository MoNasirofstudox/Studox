-- ============================================================
-- 006_fixes.sql
-- 1. Fix rpc_get_my_events — scope to person-relevant events
-- 2. Fix rpc_get_available_offerings — correct schema reference
-- 3. Add rpc_get_student_feed — announcements + relevant events
-- ============================================================

-- ─── Fix: rpc_get_my_events — institution-wide, paginated ────
-- (original was correct; hub widget uses it institution-wide)
-- Replace with a version that accepts optional person filter
create or replace function rpc_get_my_events(
  p_institution_id uuid,
  p_person_id      uuid  default null,
  p_limit          int   default 50
) returns table (
  id          uuid,
  event_type  text,
  entity_type text,
  entity_id   uuid,
  payload     jsonb,
  actor_name  text,
  office_name text,
  created_at  timestamptz
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
    -- if person filter given, exclude events triggered by that person (they know what they did)
    and (p_person_id is null or se.triggered_by <> p_person_id)
  order by se.created_at desc
  limit p_limit;
end;
$$;

-- ─── Fix: rpc_get_available_offerings ────────────────────────
-- Corrected: use institution_id from enrollment (not program)
create or replace function rpc_get_available_offerings(
  p_enrollment_id uuid,
  p_semester_id   uuid
) returns table (
  id            uuid,
  course_code   text,
  course_name   text,
  level         int,
  credit_units  int,
  dept_name     text,
  lecturer_name text,
  is_registered boolean
) language plpgsql security definer as $$
declare
  v_institution_id uuid;
begin
  select institution_id into v_institution_id
  from student_enrollments where id = p_enrollment_id;

  return query
  select
    co.id,
    c.code, c.name, c.level, c.credit_units,
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

-- ─── New: rpc_get_student_feed ────────────────────────────────
-- Relevant system events for a student:
-- results published, grades posted, clearance changes
create or replace function rpc_get_student_feed(
  p_person_id      uuid,
  p_institution_id uuid,
  p_limit          int default 30
) returns table (
  id          uuid,
  event_type  text,
  summary     text,
  actor_name  text,
  created_at  timestamptz
) language plpgsql security definer as $$
begin
  return query
  select
    se.id,
    se.event_type,
    -- Human-readable summary from payload or event type
    coalesce(
      se.payload->>'summary',
      case se.event_type
        when 'batch_published'    then 'Results published'
        when 'assignment_graded'  then 'Assignment graded'
        when 'payment_recorded'   then 'Payment recorded on your account'
        when 'clearance_override' then 'Clearance status updated'
        when 'batch_rejected'     then 'Result batch returned for correction'
        else se.event_type
      end
    ),
    p.first_name || ' ' || p.last_name,
    se.created_at
  from system_events se
  join persons p on p.id = se.triggered_by
  where se.institution_id = p_institution_id
    and se.event_type in (
      'batch_published',
      'assignment_graded',
      'payment_recorded',
      'clearance_override'
    )
    and (
      -- events that reference this student directly via payload
      se.payload->>'student_id' = p_person_id::text
      -- or broad events (published results affect all students)
      or se.event_type in ('batch_published')
    )
  order by se.created_at desc
  limit p_limit;
end;
$$;

-- ─── Fix: rpc_get_my_timetable — correct join ─────────────────
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
    lec.first_name || ' ' || lec.last_name,
    r.name
  from timetable_slots ts
  join course_offerings co on co.id = ts.offering_id
  join courses c on c.id = co.course_id
  left join persons lec on lec.id = co.lecturer_id
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
    array_position(
      array['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'],
      ts.day
    ),
    ts.start_time;
end;
$$;
