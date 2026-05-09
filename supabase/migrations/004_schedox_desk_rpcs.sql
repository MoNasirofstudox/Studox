-- ============================================================
-- 004_schedox_desk_rpcs.sql
-- Schedox: rooms, timetable slots, calendar events, clash detection
-- Desk: offerings list, materials, assignments, submissions, grading, discussions
-- ============================================================

-- ─── Schedox: Rooms ──────────────────────────────────────────
create or replace function rpc_get_rooms(
  p_institution_id uuid
) returns table (
  id        uuid,
  name      text,
  capacity  int,
  type      text,
  is_active boolean,
  slot_count bigint
) language plpgsql security definer as $$
begin
  return query
  select r.id, r.name, r.capacity, r.type, r.is_active,
    count(ts.id)
  from rooms r
  left join timetable_slots ts on ts.room_id = r.id
  where r.institution_id = p_institution_id
  group by r.id
  order by r.name;
end;
$$;

create or replace function rpc_upsert_room(
  p_institution_id uuid,
  p_id             uuid,
  p_name           text,
  p_capacity       int,
  p_type           text
) returns uuid language plpgsql security definer as $$
declare v_id uuid;
begin
  if p_id is not null then
    update rooms set name=p_name, capacity=p_capacity, type=p_type
    where id=p_id and institution_id=p_institution_id
    returning id into v_id;
    return v_id;
  end if;
  insert into rooms(institution_id,name,capacity,type)
  values(p_institution_id,p_name,p_capacity,p_type)
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function rpc_delete_room(
  p_id uuid
) returns jsonb language plpgsql security definer as $$
begin
  update rooms set is_active=false where id=p_id;
  return jsonb_build_object('success',true);
end;
$$;

-- ─── Schedox: Timetable ──────────────────────────────────────
create or replace function rpc_get_timetable(
  p_institution_id uuid,
  p_semester_id    uuid,
  p_department_id  uuid default null
) returns table (
  id            uuid,
  day           text,
  start_time    time,
  end_time      time,
  course_code   text,
  course_name   text,
  lecturer_name text,
  room_name     text,
  room_capacity int,
  department_id uuid,
  dept_name     text,
  offering_id   uuid,
  level         int
) language plpgsql security definer as $$
begin
  return query
  select
    ts.id, ts.day, ts.start_time, ts.end_time,
    c.code, c.name,
    p.first_name || ' ' || p.last_name,
    r.name, r.capacity,
    d.id, d.name,
    ts.offering_id,
    c.level
  from timetable_slots ts
  join course_offerings co on co.id = ts.offering_id
  join courses c on c.id = co.course_id
  join departments d on d.id = c.department_id
  left join persons p on p.id = co.lecturer_id
  left join rooms r on r.id = ts.room_id
  where ts.institution_id = p_institution_id
    and co.semester_id = p_semester_id
    and (p_department_id is null or d.id = p_department_id)
  order by
    array_position(array['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'], ts.day),
    ts.start_time;
end;
$$;

-- Clash detection: returns conflicting slots for a proposed slot
create or replace function rpc_check_clashes(
  p_institution_id uuid,
  p_semester_id    uuid,
  p_offering_id    uuid,
  p_day            text,
  p_start_time     time,
  p_end_time       time,
  p_room_id        uuid default null,
  p_exclude_id     uuid default null  -- exclude self when editing
) returns table (
  clash_type   text,
  clash_detail text,
  slot_id      uuid
) language plpgsql security definer as $$
begin
  -- Room clash
  if p_room_id is not null then
    return query
    select
      'room_conflict'::text,
      'Room already booked: ' || r.name || ' — ' || c.code || ' ' || ts.start_time::text || '–' || ts.end_time::text,
      ts.id
    from timetable_slots ts
    join rooms r on r.id = ts.room_id
    join course_offerings co2 on co2.id = ts.offering_id
    join courses c on c.id = co2.course_id
    where ts.institution_id = p_institution_id
      and co2.semester_id = p_semester_id
      and ts.room_id = p_room_id
      and ts.day = p_day
      and ts.start_time < p_end_time
      and ts.end_time > p_start_time
      and (p_exclude_id is null or ts.id <> p_exclude_id);
  end if;

  -- Lecturer clash
  return query
  select
    'lecturer_conflict'::text,
    'Lecturer already scheduled: ' || co2.course_id::text || ' ' || ts.start_time::text || '–' || ts.end_time::text,
    ts.id
  from timetable_slots ts
  join course_offerings co1 on co1.id = p_offering_id
  join course_offerings co2 on co2.id = ts.offering_id
    and co2.lecturer_id = co1.lecturer_id
    and co2.lecturer_id is not null
  where ts.institution_id = p_institution_id
    and co2.semester_id = p_semester_id
    and ts.day = p_day
    and ts.start_time < p_end_time
    and ts.end_time > p_start_time
    and ts.offering_id <> p_offering_id
    and (p_exclude_id is null or ts.id <> p_exclude_id);
end;
$$;

create or replace function rpc_add_timetable_slot(
  p_institution_id uuid,
  p_semester_id    uuid,
  p_offering_id    uuid,
  p_day            text,
  p_start_time     time,
  p_end_time       time,
  p_room_id        uuid default null
) returns jsonb language plpgsql security definer as $$
declare
  v_dept_id uuid;
  v_clashes int;
  v_slot_id uuid;
begin
  select d.id into v_dept_id
  from course_offerings co
  join courses c on c.id = co.course_id
  join departments d on d.id = c.department_id
  where co.id = p_offering_id;

  -- Count hard clashes (room only)
  select count(*) into v_clashes
  from rpc_check_clashes(p_institution_id, p_semester_id, p_offering_id, p_day, p_start_time, p_end_time, p_room_id)
  where clash_type = 'room_conflict';

  if v_clashes > 0 then
    raise exception 'Room conflict: the selected room is already booked at this time.';
  end if;

  insert into timetable_slots(institution_id, offering_id, department_id, room_id, day, start_time, end_time)
  values(p_institution_id, p_offering_id, v_dept_id, p_room_id, p_day, p_start_time, p_end_time)
  returning id into v_slot_id;

  return jsonb_build_object('success', true, 'slot_id', v_slot_id);
end;
$$;

create or replace function rpc_delete_timetable_slot(
  p_slot_id uuid
) returns jsonb language plpgsql security definer as $$
begin
  delete from timetable_slots where id = p_slot_id;
  return jsonb_build_object('success', true);
end;
$$;

-- ─── Schedox: Calendar Events ────────────────────────────────
create or replace function rpc_get_calendar_events(
  p_institution_id uuid,
  p_from           date default null,
  p_to             date default null
) returns table (
  id          uuid,
  title       text,
  type        text,
  start_date  date,
  end_date    date,
  description text,
  created_by_name text
) language plpgsql security definer as $$
begin
  return query
  select
    ce.id, ce.title, ce.type, ce.start_date, ce.end_date, ce.description,
    p.first_name || ' ' || p.last_name
  from calendar_events ce
  join persons p on p.id = ce.created_by
  where ce.institution_id = p_institution_id
    and (p_from is null or ce.start_date >= p_from)
    and (p_to   is null or ce.start_date <= p_to)
  order by ce.start_date;
end;
$$;

create or replace function rpc_upsert_calendar_event(
  p_institution_id uuid,
  p_person_id      uuid,
  p_id             uuid,
  p_title          text,
  p_type           text,
  p_start_date     date,
  p_end_date       date,
  p_description    text
) returns uuid language plpgsql security definer as $$
declare v_id uuid;
begin
  if p_id is not null then
    update calendar_events
    set title=p_title, type=p_type, start_date=p_start_date,
        end_date=p_end_date, description=p_description
    where id=p_id
    returning id into v_id;
    return v_id;
  end if;
  insert into calendar_events(institution_id,created_by,title,type,start_date,end_date,description)
  values(p_institution_id,p_person_id,p_title,p_type,p_start_date,p_end_date,p_description)
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function rpc_delete_calendar_event(
  p_id uuid
) returns jsonb language plpgsql security definer as $$
begin
  delete from calendar_events where id = p_id;
  return jsonb_build_object('success', true);
end;
$$;

-- ─── Schedox: Get semesters (for picker) ─────────────────────
create or replace function rpc_get_semesters(
  p_institution_id uuid
) returns table (
  id           uuid,
  label        text,
  is_current   boolean,
  session_name text
) language plpgsql security definer as $$
begin
  return query
  select
    s.id,
    ac.name || ' — ' || case s.type when 'first' then '1st Sem' when 'second' then '2nd Sem' else '3rd Sem' end,
    s.is_current,
    ac.name
  from semesters s
  join academic_sessions ac on ac.id = s.session_id
  where s.institution_id = p_institution_id
  order by ac.start_date desc, s.type;
end;
$$;

-- ─── Desk: Get offerings for a person ────────────────────────
-- Returns offerings where person is lecturer OR registered student
create or replace function rpc_get_desk_offerings(
  p_institution_id uuid,
  p_person_id      uuid,
  p_semester_id    uuid default null
) returns table (
  id             uuid,
  course_code    text,
  course_name    text,
  course_level   int,
  dept_name      text,
  lecturer_name  text,
  lecturer_id    uuid,
  semester_id    uuid,
  sem_label      text,
  student_count  bigint,
  material_count bigint,
  assignment_count bigint,
  thread_count   bigint,
  is_lecturer    boolean
) language plpgsql security definer as $$
begin
  return query
  select distinct
    co.id,
    c.code, c.name, c.level,
    d.name,
    p.first_name || ' ' || p.last_name,
    co.lecturer_id,
    co.semester_id,
    ac.name || ' — ' || case s.type when 'first' then '1st Sem' when 'second' then '2nd Sem' else '3rd Sem' end,
    count(distinct cr.id),
    count(distinct cm.id),
    count(distinct a.id),
    count(distinct dt.id),
    (co.lecturer_id = p_person_id)
  from course_offerings co
  join courses c on c.id = co.course_id
  join departments d on d.id = c.department_id
  join semesters s on s.id = co.semester_id
  join academic_sessions ac on ac.id = s.session_id
  left join persons p on p.id = co.lecturer_id
  left join course_registrations cr on cr.offering_id = co.id and cr.is_active
  left join course_materials cm on cm.offering_id = co.id
  left join assignments a on a.offering_id = co.id
  left join discussion_threads dt on dt.offering_id = co.id
  where co.institution_id = p_institution_id
    and co.is_active = true
    and (p_semester_id is null or co.semester_id = p_semester_id)
    and (
      co.lecturer_id = p_person_id
      or exists (
        select 1 from course_registrations cr2
        where cr2.offering_id = co.id
          and cr2.student_id = p_person_id
          and cr2.is_active = true
      )
    )
  group by co.id, c.code, c.name, c.level, d.name,
           p.first_name, p.last_name, co.lecturer_id,
           co.semester_id, ac.name, s.type
  order by c.code;
end;
$$;

-- ─── Desk: Materials ─────────────────────────────────────────
create or replace function rpc_get_materials(
  p_offering_id uuid
) returns table (
  id          uuid,
  title       text,
  type        text,
  url         text,
  week_label  text,
  uploader    text,
  created_at  timestamptz
) language plpgsql security definer as $$
begin
  return query
  select cm.id, cm.title, cm.type, cm.url, cm.week_label,
    p.first_name || ' ' || p.last_name,
    cm.created_at
  from course_materials cm
  join persons p on p.id = cm.uploaded_by
  where cm.offering_id = p_offering_id
  order by cm.week_label nulls last, cm.created_at;
end;
$$;

create or replace function rpc_add_material(
  p_offering_id    uuid,
  p_institution_id uuid,
  p_person_id      uuid,
  p_title          text,
  p_type           text,
  p_url            text,
  p_week_label     text
) returns uuid language plpgsql security definer as $$
declare v_id uuid;
begin
  insert into course_materials(offering_id,institution_id,uploaded_by,title,type,url,week_label)
  values(p_offering_id,p_institution_id,p_person_id,p_title,p_type,p_url,p_week_label)
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function rpc_delete_material(p_id uuid)
returns jsonb language plpgsql security definer as $$
begin
  delete from course_materials where id = p_id;
  return jsonb_build_object('success',true);
end;
$$;

-- ─── Desk: Assignments ───────────────────────────────────────
create or replace function rpc_get_assignments(
  p_offering_id uuid,
  p_person_id   uuid  -- to check submission status
) returns table (
  id             uuid,
  title          text,
  description    text,
  due_at         timestamptz,
  max_score      numeric,
  created_at     timestamptz,
  submission_count bigint,
  my_submission_id uuid,
  my_submitted_at  timestamptz,
  my_is_late       boolean,
  my_score         numeric,
  my_grade_comment text
) language plpgsql security definer as $$
begin
  return query
  select
    a.id, a.title, a.description, a.due_at, a.max_score, a.created_at,
    count(distinct sub.id),
    my_sub.id,
    my_sub.submitted_at,
    my_sub.is_late,
    gr.score,
    gr.comment
  from assignments a
  left join assignment_submissions sub on sub.assignment_id = a.id
  left join assignment_submissions my_sub on my_sub.assignment_id = a.id and my_sub.student_id = p_person_id
  left join assignment_grades gr on gr.submission_id = my_sub.id
  where a.offering_id = p_offering_id
  group by a.id, my_sub.id, my_sub.submitted_at, my_sub.is_late, gr.score, gr.comment
  order by a.due_at;
end;
$$;

create or replace function rpc_create_assignment(
  p_offering_id    uuid,
  p_institution_id uuid,
  p_person_id      uuid,
  p_title          text,
  p_description    text,
  p_due_at         timestamptz,
  p_max_score      numeric
) returns uuid language plpgsql security definer as $$
declare v_id uuid;
begin
  insert into assignments(offering_id,institution_id,created_by,title,description,due_at,max_score)
  values(p_offering_id,p_institution_id,p_person_id,p_title,p_description,p_due_at,p_max_score)
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function rpc_submit_assignment(
  p_assignment_id  uuid,
  p_institution_id uuid,
  p_student_id     uuid,
  p_text_content   text,
  p_file_url       text
) returns jsonb language plpgsql security definer as $$
declare
  v_due   timestamptz;
  v_late  boolean;
  v_id    uuid;
begin
  select due_at into v_due from assignments where id = p_assignment_id;
  v_late := now() > v_due;

  insert into assignment_submissions(assignment_id,institution_id,student_id,text_content,file_url,is_late)
  values(p_assignment_id,p_institution_id,p_student_id,p_text_content,p_file_url,v_late)
  on conflict(assignment_id,student_id)
  do update set text_content=p_text_content, file_url=p_file_url, submitted_at=now(), is_late=v_late
  returning id into v_id;

  return jsonb_build_object('success',true,'submission_id',v_id,'is_late',v_late);
end;
$$;

-- Get all submissions for an assignment (lecturer view)
create or replace function rpc_get_submissions(
  p_assignment_id uuid
) returns table (
  id            uuid,
  student_name  text,
  student_id    uuid,
  matric_number text,
  text_content  text,
  file_url      text,
  submitted_at  timestamptz,
  is_late       boolean,
  score         numeric,
  grade_comment text,
  graded_at     timestamptz
) language plpgsql security definer as $$
begin
  return query
  select
    sub.id,
    p.first_name || ' ' || p.last_name,
    sub.student_id,
    se.matric_number,
    sub.text_content, sub.file_url,
    sub.submitted_at, sub.is_late,
    gr.score, gr.comment, gr.graded_at
  from assignment_submissions sub
  join persons p on p.id = sub.student_id
  left join student_enrollments se on se.student_id = sub.student_id
    and se.institution_id = sub.institution_id
  left join assignment_grades gr on gr.submission_id = sub.id
  where sub.assignment_id = p_assignment_id
  order by sub.submitted_at;
end;
$$;

create or replace function rpc_grade_submission(
  p_submission_id uuid,
  p_grader_id     uuid,
  p_score         numeric,
  p_comment       text
) returns jsonb language plpgsql security definer as $$
begin
  insert into assignment_grades(submission_id, graded_by, score, comment)
  values(p_submission_id, p_grader_id, p_score, p_comment)
  on conflict(submission_id)
  do update set score=p_score, comment=p_comment, graded_by=p_grader_id, graded_at=now();
  return jsonb_build_object('success',true);
end;
$$;

-- ─── Desk: Discussions ───────────────────────────────────────
create or replace function rpc_get_threads(
  p_offering_id uuid
) returns table (
  id           uuid,
  title        text,
  created_by_name text,
  is_pinned    boolean,
  is_locked    boolean,
  post_count   bigint,
  last_post_at timestamptz,
  created_at   timestamptz
) language plpgsql security definer as $$
begin
  return query
  select
    dt.id, dt.title,
    p.first_name || ' ' || p.last_name,
    dt.is_pinned, dt.is_locked,
    count(dp.id),
    max(dp.created_at),
    dt.created_at
  from discussion_threads dt
  join persons p on p.id = dt.created_by
  left join discussion_posts dp on dp.thread_id = dt.id
  where dt.offering_id = p_offering_id
  group by dt.id, p.first_name, p.last_name
  order by dt.is_pinned desc, coalesce(max(dp.created_at), dt.created_at) desc;
end;
$$;

create or replace function rpc_create_thread(
  p_offering_id    uuid,
  p_institution_id uuid,
  p_person_id      uuid,
  p_title          text
) returns uuid language plpgsql security definer as $$
declare v_id uuid;
begin
  insert into discussion_threads(offering_id,institution_id,created_by,title)
  values(p_offering_id,p_institution_id,p_person_id,p_title)
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function rpc_get_posts(
  p_thread_id uuid
) returns table (
  id           uuid,
  content      text,
  author_name  text,
  author_id    uuid,
  created_at   timestamptz
) language plpgsql security definer as $$
begin
  return query
  select dp.id, dp.content,
    p.first_name || ' ' || p.last_name,
    dp.created_by, dp.created_at
  from discussion_posts dp
  join persons p on p.id = dp.created_by
  where dp.thread_id = p_thread_id
  order by dp.created_at;
end;
$$;

create or replace function rpc_post_reply(
  p_thread_id      uuid,
  p_institution_id uuid,
  p_person_id      uuid,
  p_content        text
) returns uuid language plpgsql security definer as $$
declare v_id uuid;
begin
  -- Check not locked
  if exists(select 1 from discussion_threads where id=p_thread_id and is_locked) then
    raise exception 'Thread is locked';
  end if;
  insert into discussion_posts(thread_id,institution_id,created_by,content)
  values(p_thread_id,p_institution_id,p_person_id,p_content)
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function rpc_toggle_thread_pin(
  p_thread_id uuid
) returns jsonb language plpgsql security definer as $$
begin
  update discussion_threads set is_pinned = not is_pinned where id = p_thread_id;
  return jsonb_build_object('success',true);
end;
$$;

create or replace function rpc_toggle_thread_lock(
  p_thread_id uuid
) returns jsonb language plpgsql security definer as $$
begin
  update discussion_threads set is_locked = not is_locked where id = p_thread_id;
  return jsonb_build_object('success',true);
end;
$$;
