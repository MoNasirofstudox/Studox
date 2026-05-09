-- ============================================================
-- STUDOX CATHEDRAL — MIGRATION 002
-- Flow enforcement engine — thick Postgres RPCs
-- ============================================================

-- ─── Helper: resolve institution from entity ─────────────────
create or replace function flow_get_institution_id(
  p_entity_type text,
  p_entity_id   uuid
) returns uuid language plpgsql security definer as $$
declare
  v_id uuid;
begin
  case p_entity_type
    when 'result_batch' then
      select institution_id into v_id from result_batches where id = p_entity_id;
    when 'office' then
      select institution_id into v_id from offices where id = p_entity_id;
    when 'result' then
      select institution_id into v_id from results where id = p_entity_id;
    when 'committee_session' then
      select institution_id into v_id from committee_sessions where id = p_entity_id;
    when 'institution' then
      v_id := p_entity_id;
    else
      raise exception 'Unknown entity type: %', p_entity_type;
  end case;
  return v_id;
end;
$$;

-- ─── Core: resolve authority ──────────────────────────────────
-- Returns acting office context or raises UNAUTHORIZED
create or replace function flow_resolve_authority(
  p_person_id   uuid,
  p_action      text,
  p_entity_type text,
  p_entity_id   uuid
) returns table (
  office_id        uuid,
  authority_source text,
  delegation_id    uuid
) language plpgsql security definer as $$
declare
  v_institution_id uuid;
  v_office_id      uuid;
  v_office_type    text;
  v_delegation     record;
begin
  -- Get institution scope
  v_institution_id := flow_get_institution_id(p_entity_type, p_entity_id);

  -- 1. Check direct office assignment
  select oa.office_id, o.office_type
  into v_office_id, v_office_type
  from office_assignments oa
  join offices o on o.id = oa.office_id
  where oa.person_id = p_person_id
    and oa.is_active = true
    and (oa.ended_at is null or oa.ended_at > now())
    and o.institution_id = v_institution_id
    and o.is_active = true
  order by oa.started_at desc
  limit 1;

  if v_office_id is not null then
    -- Check capability grant for this office_type + action
    if exists (
      select 1 from capability_grants
      where institution_id = v_institution_id
        and office_type = v_office_type
        and action = p_action
    ) then
      return query select v_office_id, 'direct'::text, null::uuid;
      return;
    end if;
  end if;

  -- 2. Check active delegations
  select od.id, od.office_id
  into v_delegation
  from office_delegations od
  join offices o on o.id = od.office_id
  where od.delegate_person_id = p_person_id
    and od.is_active = true
    and od.expires_at > now()
    and o.institution_id = v_institution_id
    and (
      od.allowed_actions is null
      or p_action = any(od.allowed_actions)
    )
  order by od.delegation_level desc
  limit 1;

  if v_delegation.office_id is not null then
    return query select v_delegation.office_id, 'delegated'::text, v_delegation.id;
    return;
  end if;

  -- 3. No authority found
  raise exception 'UNAUTHORIZED: person % has no authority to perform action "%" on %:%',
    p_person_id, p_action, p_entity_type, p_entity_id
    using errcode = 'insufficient_privilege';
end;
$$;

-- ─── Core: execute with audit ─────────────────────────────────
-- Every write action must call this
create or replace function flow_execute(
  p_person_id   uuid,
  p_action      text,
  p_entity_type text,
  p_entity_id   uuid,
  p_payload     jsonb default '{}'
) returns jsonb language plpgsql security definer as $$
declare
  v_auth           record;
  v_institution_id uuid;
begin
  -- Resolve authority (raises if unauthorized)
  select * into v_auth
  from flow_resolve_authority(p_person_id, p_action, p_entity_type, p_entity_id);

  v_institution_id := flow_get_institution_id(p_entity_type, p_entity_id);

  -- Write immutable audit log
  insert into audit_log (
    institution_id, office_id, person_id,
    authority_source, delegation_id,
    action, entity_type, entity_id, payload
  ) values (
    v_institution_id,
    v_auth.office_id,
    p_person_id,
    v_auth.authority_source::authority_source_type,
    v_auth.delegation_id,
    p_action,
    p_entity_type,
    p_entity_id,
    p_payload
  );

  -- Emit system event
  insert into system_events (
    institution_id, event_type, entity_type, entity_id,
    triggered_by, triggered_office, payload
  ) values (
    v_institution_id,
    p_action,
    p_entity_type, p_entity_id,
    p_person_id, v_auth.office_id, p_payload
  );

  return jsonb_build_object(
    'success',          true,
    'office_id',        v_auth.office_id,
    'authority_source', v_auth.authority_source
  );
end;
$$;

-- ─── Get next stage from workflow ─────────────────────────────
create or replace function flow_get_next_stage(
  p_institution_id uuid,
  p_current_stage  text,
  p_direction      workflow_direction
) returns text language plpgsql security definer as $$
declare
  v_next_stage text;
  v_inst_type  institution_type;
begin
  select type into v_inst_type from institutions where id = p_institution_id;

  select wt.to_stage_key into v_next_stage
  from workflow_transitions wt
  join workflow_stages ws on ws.template_id = wt.template_id and ws.stage_key = wt.from_stage_key
  join workflow_templates tmpl on tmpl.id = wt.template_id
  where tmpl.institution_type = v_inst_type
    and tmpl.workflow_type = 'result_approval'
    and wt.from_stage_key = p_current_stage
    and wt.direction = p_direction
  limit 1;

  if v_next_stage is null then
    raise exception 'No % transition from stage "%" for institution type %',
      p_direction, p_current_stage, v_inst_type;
  end if;

  return v_next_stage;
end;
$$;

-- ─── Transition batch stage ───────────────────────────────────
create or replace function flow_transition_batch(
  p_batch_id       uuid,
  p_acting_office  uuid,
  p_acting_person  uuid,
  p_authority_source authority_source_type,
  p_to_stage       text,
  p_note           text default null
) returns void language plpgsql security definer as $$
declare
  v_from_stage text;
begin
  select current_stage into v_from_stage from result_batches where id = p_batch_id;

  update result_batches
  set current_stage = p_to_stage,
      updated_at = now()
  where id = p_batch_id;

  insert into batch_stage_history (
    batch_id, from_stage, to_stage,
    acting_office_id, acting_person_id, authority_source, note
  ) values (
    p_batch_id, v_from_stage, p_to_stage,
    p_acting_office, p_acting_person, p_authority_source, p_note
  );
end;
$$;

-- ─── Result Batch: Submit (DEO → Central Exams) ───────────────
create or replace function rpc_submit_batch(
  p_person_id uuid,
  p_batch_id  uuid,
  p_note      text default null
) returns jsonb language plpgsql security definer as $$
declare
  v_auth  record;
  v_batch record;
  v_next  text;
begin
  select * into v_auth
  from flow_execute(p_person_id, 'result.submit', 'result_batch', p_batch_id,
    jsonb_build_object('note', p_note));

  select * into v_batch from result_batches where id = p_batch_id;
  if v_batch.current_stage != 'draft' then
    raise exception 'Batch must be in draft state to submit. Current: %', v_batch.current_stage;
  end if;

  v_next := flow_get_next_stage(v_batch.institution_id, 'draft', 'forward');

  perform flow_transition_batch(
    p_batch_id, v_auth.office_id, p_person_id,
    v_auth.authority_source::authority_source_type, v_next, p_note
  );

  return jsonb_build_object('success', true, 'new_stage', v_next);
end;
$$;

-- ─── Result Batch: Forward (generic forward transition) ────────
create or replace function rpc_forward_batch(
  p_person_id uuid,
  p_batch_id  uuid,
  p_note      text default null
) returns jsonb language plpgsql security definer as $$
declare
  v_auth  record;
  v_batch record;
  v_next  text;
begin
  select * into v_auth
  from flow_execute(p_person_id, 'result.forward', 'result_batch', p_batch_id,
    jsonb_build_object('note', p_note));

  select * into v_batch from result_batches where id = p_batch_id;

  v_next := flow_get_next_stage(v_batch.institution_id, v_batch.current_stage, 'forward');

  perform flow_transition_batch(
    p_batch_id, v_auth.office_id, p_person_id,
    v_auth.authority_source::authority_source_type, v_next, p_note
  );

  return jsonb_build_object('success', true, 'new_stage', v_next);
end;
$$;

-- ─── Result Batch: Reject (backward transition) ───────────────
create or replace function rpc_reject_batch(
  p_person_id uuid,
  p_batch_id  uuid,
  p_reason    text
) returns jsonb language plpgsql security definer as $$
declare
  v_auth  record;
  v_batch record;
  v_prev  text;
begin
  if p_reason is null or trim(p_reason) = '' then
    raise exception 'Rejection reason is required';
  end if;

  select * into v_auth
  from flow_execute(p_person_id, 'result.reject', 'result_batch', p_batch_id,
    jsonb_build_object('reason', p_reason));

  select * into v_batch from result_batches where id = p_batch_id;

  v_prev := flow_get_next_stage(v_batch.institution_id, v_batch.current_stage, 'backward');

  -- Unlock batch when returned to draft
  if v_prev = 'draft' then
    update result_batches set is_locked = false where id = p_batch_id;
    update results set status = 'draft' where batch_id = p_batch_id;
  end if;

  perform flow_transition_batch(
    p_batch_id, v_auth.office_id, p_person_id,
    v_auth.authority_source::authority_source_type, v_prev, p_reason
  );

  return jsonb_build_object('success', true, 'new_stage', v_prev);
end;
$$;

-- ─── QA: Flag batch (interrupt — can happen at any stage) ─────
create or replace function rpc_qa_flag_batch(
  p_person_id    uuid,
  p_batch_id     uuid,
  p_reason       text,
  p_force_return boolean default false
) returns jsonb language plpgsql security definer as $$
declare
  v_auth   record;
  v_batch  record;
  v_return text;
begin
  if p_reason is null or trim(p_reason) = '' then
    raise exception 'QA flag reason is required';
  end if;

  select * into v_auth
  from flow_execute(p_person_id, 'result.qa_interrupt', 'result_batch', p_batch_id,
    jsonb_build_object('reason', p_reason, 'force_return', p_force_return));

  select * into v_batch from result_batches where id = p_batch_id;

  update result_batches
  set qa_flagged = true,
      qa_flag_reason = p_reason,
      qa_flagged_at = now(),
      qa_flagged_by_office = v_auth.office_id,
      updated_at = now()
  where id = p_batch_id;

  -- Optionally force-return to dept_submitted
  if p_force_return then
    update result_batches set current_stage = 'dept_submitted', updated_at = now() where id = p_batch_id;
    insert into batch_stage_history (batch_id, from_stage, to_stage, acting_office_id, acting_person_id, authority_source, note)
    values (p_batch_id, v_batch.current_stage, 'dept_submitted', v_auth.office_id, p_person_id, v_auth.authority_source::authority_source_type, 'QA force return: ' || p_reason);
  end if;

  return jsonb_build_object('success', true, 'flagged', true, 'force_returned', p_force_return);
end;
$$;

-- ─── QA: Clear flag ───────────────────────────────────────────
create or replace function rpc_qa_clear_batch(
  p_person_id uuid,
  p_batch_id  uuid,
  p_note      text default null
) returns jsonb language plpgsql security definer as $$
declare
  v_auth record;
begin
  select * into v_auth
  from flow_execute(p_person_id, 'result.qa_clear', 'result_batch', p_batch_id,
    jsonb_build_object('note', p_note));

  update result_batches
  set qa_flagged = false,
      qa_flag_reason = null,
      updated_at = now()
  where id = p_batch_id;

  return jsonb_build_object('success', true);
end;
$$;

-- ─── Board: Record resolution (Secretary only) ────────────────
create or replace function rpc_record_resolution(
  p_person_id       uuid,
  p_session_id      uuid,
  p_batch_id        uuid,
  p_decision        batch_decision,
  p_resolution_text text
) returns jsonb language plpgsql security definer as $$
declare
  v_auth    record;
  v_session record;
  v_batch   record;
  v_action  text;
  v_next    text;
begin
  -- Secretary records under the committee's office
  select * into v_auth
  from flow_execute(p_person_id, 'result.board_approve', 'result_batch', p_batch_id,
    jsonb_build_object('decision', p_decision, 'resolution', p_resolution_text));

  select * into v_session from committee_sessions where id = p_session_id;
  select * into v_batch from result_batches where id = p_batch_id;

  -- Insert resolution
  insert into committee_resolutions (
    session_id, institution_id, batch_id,
    entity_type, entity_id,
    decision, resolution_text,
    recorded_by_office, recorded_by_person,
    triggers_action
  ) values (
    p_session_id, v_session.institution_id, p_batch_id,
    'result_batch', p_batch_id,
    p_decision, p_resolution_text,
    v_auth.office_id, p_person_id,
    case p_decision
      when 'approved' then 'result.board_approve'
      when 'rejected' then 'result.reject'
      else null
    end
  );

  -- Transition batch based on decision
  if p_decision = 'approved' then
    v_next := flow_get_next_stage(v_batch.institution_id, v_batch.current_stage, 'forward');
    perform flow_transition_batch(
      p_batch_id, v_auth.office_id, p_person_id,
      v_auth.authority_source::authority_source_type,
      v_next, p_resolution_text
    );
  elsif p_decision = 'rejected' then
    v_next := flow_get_next_stage(v_batch.institution_id, v_batch.current_stage, 'backward');
    perform flow_transition_batch(
      p_batch_id, v_auth.office_id, p_person_id,
      v_auth.authority_source::authority_source_type,
      v_next, p_resolution_text
    );
  end if;
  -- 'deferred' = no transition, stays at current stage

  return jsonb_build_object('success', true, 'decision', p_decision);
end;
$$;

-- ─── Results: Upsert score (Lecturer only, batch must be draft) 
create or replace function rpc_upsert_result(
  p_person_id      uuid,
  p_registration_id uuid,
  p_ca_score       numeric,
  p_exam_score     numeric
) returns jsonb language plpgsql security definer as $$
declare
  v_auth   record;
  v_reg    record;
  v_batch  record;
  v_grade  record;
begin
  -- Get registration and its batch
  select cr.*, co.institution_id
  into v_reg
  from course_registrations cr
  join course_offerings co on co.id = cr.offering_id
  where cr.id = p_registration_id;

  -- Find the active batch for this registration's department/semester
  select rb.*
  into v_batch
  from result_batches rb
  join course_offerings co on co.semester_id = rb.semester_id
  join courses c on c.id = co.course_id and c.department_id = rb.department_id
  where co.id = v_reg.offering_id
    and rb.institution_id = v_reg.institution_id
    and rb.current_stage = 'draft'
  limit 1;

  if v_batch.id is null then
    raise exception 'No active draft batch found for this course registration';
  end if;

  -- Authorize against the batch
  select * into v_auth
  from flow_execute(p_person_id, 'result.enter', 'result_batch', v_batch.id,
    jsonb_build_object('registration_id', p_registration_id, 'ca', p_ca_score, 'exam', p_exam_score));

  -- Look up grade from scale
  select grade, grade_point into v_grade
  from grade_scales
  where institution_id = v_reg.institution_id
    and (p_ca_score + p_exam_score) between min_score and max_score
  limit 1;

  insert into results (
    institution_id, batch_id, registration_id, student_id, offering_id,
    ca_score, exam_score, grade, grade_point, status,
    entered_by_office, entered_by_person
  ) values (
    v_reg.institution_id, v_batch.id, p_registration_id, v_reg.student_id, v_reg.offering_id,
    p_ca_score, p_exam_score, v_grade.grade, v_grade.grade_point, 'draft',
    v_auth.office_id, p_person_id
  )
  on conflict (batch_id, registration_id) do update
  set ca_score = excluded.ca_score,
      exam_score = excluded.exam_score,
      grade = excluded.grade,
      grade_point = excluded.grade_point,
      updated_at = now();

  return jsonb_build_object('success', true);
end;
$$;

-- ─── Results: Publish (Registrar only) ────────────────────────
create or replace function rpc_publish_batch(
  p_person_id uuid,
  p_batch_id  uuid
) returns jsonb language plpgsql security definer as $$
declare
  v_auth  record;
  v_batch record;
begin
  select * into v_auth
  from flow_execute(p_person_id, 'result.publish', 'result_batch', p_batch_id, '{}');

  select * into v_batch from result_batches where id = p_batch_id;

  if v_batch.current_stage != 'registrar_final' then
    raise exception 'Batch must be at registrar_final stage to publish. Current: %', v_batch.current_stage;
  end if;

  -- Update all results to published
  update results
  set status = 'published', updated_at = now()
  where batch_id = p_batch_id;

  -- Transition to published
  perform flow_transition_batch(
    p_batch_id, v_auth.office_id, p_person_id,
    v_auth.authority_source::authority_source_type,
    'published', 'Results published to students'
  );

  return jsonb_build_object('success', true);
end;
$$;

-- ─── Onboarding: Create institution + seed offices ────────────
create or replace function rpc_create_institution(
  p_admin_id   uuid,
  p_name       text,
  p_slug       text,
  p_type       institution_type,
  p_state      text,
  p_email      text default null
) returns jsonb language plpgsql security definer as $$
declare
  v_inst_id uuid;
  v_office_id uuid;
  v_office_types text[];
begin
  -- Only super_admin can create institutions
  if not exists (select 1 from persons where id = p_admin_id and global_role = 'super_admin') then
    raise exception 'Only super admins can create institutions';
  end if;

  -- Create institution
  insert into institutions (name, slug, type, state, email, onboarding_step)
  values (p_name, p_slug, p_type, p_state, p_email, 2)
  returning id into v_inst_id;

  -- Seed office types based on institution type
  if p_type = 'university' then
    v_office_types := array[
      'registrar', 'deputy_registrar_academics', 'central_exams_office',
      'quality_assurance', 'academic_board_secretary', 'pre_academic_board_secretary',
      'bursary'
    ];
  elsif p_type = 'polytechnic' then
    v_office_types := array[
      'registrar', 'academic_secretary', 'exams_records_officer', 'bursary'
    ];
  else -- college_of_education
    v_office_types := array[
      'registrar', 'academic_secretary', 'exams_officer', 'dean_of_studies', 'bursary'
    ];
  end if;

  -- Create institution-level offices
  for i in 1..array_length(v_office_types, 1) loop
    insert into offices (institution_id, office_type, name)
    values (
      v_inst_id,
      v_office_types[i],
      initcap(replace(v_office_types[i], '_', ' '))
    );
  end loop;

  -- Seed capability grants for university
  if p_type = 'university' then
    insert into capability_grants (institution_id, office_type, action, scope_type) values
      -- Registrar
      (v_inst_id, 'registrar', 'result.publish',              'institution'),
      (v_inst_id, 'registrar', 'result.forward',              'institution'),
      (v_inst_id, 'registrar', 'office.assign',               'institution'),
      (v_inst_id, 'registrar', 'delegation.grant',            'institution'),
      (v_inst_id, 'registrar', 'enrollment.manage',           'institution'),
      -- Deputy Registrar
      (v_inst_id, 'deputy_registrar_academics', 'result.forward', 'institution'),
      (v_inst_id, 'deputy_registrar_academics', 'result.reject',  'institution'),
      -- Central Exams
      (v_inst_id, 'central_exams_office', 'result.forward',   'institution'),
      (v_inst_id, 'central_exams_office', 'result.reject',    'institution'),
      -- QA
      (v_inst_id, 'quality_assurance', 'result.qa_interrupt', 'institution'),
      (v_inst_id, 'quality_assurance', 'result.qa_clear',     'institution'),
      -- Board secretaries
      (v_inst_id, 'academic_board_secretary',     'result.board_approve', 'institution'),
      (v_inst_id, 'pre_academic_board_secretary', 'result.board_approve', 'institution'),
      -- Dean
      (v_inst_id, 'dean', 'result.forward', 'faculty'),
      (v_inst_id, 'dean', 'result.reject',  'faculty'),
      -- HOD
      (v_inst_id, 'head_of_department', 'result.submit',   'department'),
      (v_inst_id, 'head_of_department', 'result.reject',   'department'),
      (v_inst_id, 'head_of_department', 'office.assign',   'department'),
      -- Exam Officer
      (v_inst_id, 'departmental_exam_officer', 'result.verify', 'department'),
      (v_inst_id, 'departmental_exam_officer', 'result.reject', 'department'),
      -- Lecturer
      (v_inst_id, 'lecturer', 'result.enter',  'offering'),
      (v_inst_id, 'lecturer', 'result.submit', 'offering'),
      -- Bursary
      (v_inst_id, 'bursary', 'payment.record',   'institution'),
      (v_inst_id, 'bursary', 'payment.verify',   'institution'),
      (v_inst_id, 'bursary', 'clearance.grant',  'institution');
  end if;

  -- Seed university workflow template (if not already seeded)
  perform rpc_seed_university_workflow(v_inst_id);

  return jsonb_build_object('success', true, 'institution_id', v_inst_id);
end;
$$;

-- ─── Seed university workflow template ────────────────────────
create or replace function rpc_seed_university_workflow(
  p_institution_id uuid
) returns void language plpgsql security definer as $$
declare
  v_template_id uuid;
begin
  -- Only seed once
  if exists (select 1 from workflow_templates where institution_type = 'university' and workflow_type = 'result_approval') then
    return;
  end if;

  insert into workflow_templates (institution_type, workflow_type, name)
  values ('university', 'result_approval', 'University Result Approval Chain')
  returning id into v_template_id;

  insert into workflow_stages (template_id, stage_key, name, stage_order, required_office_type, qa_can_interrupt, is_committee_stage) values
    (v_template_id, 'draft',              'Draft',                        1,  'lecturer',                     false, false),
    (v_template_id, 'dept_submitted',     'Department Submitted',         2,  'departmental_exam_officer',    true,  false),
    (v_template_id, 'central_review',     'Central Exams Review',         3,  'central_exams_office',         true,  false),
    (v_template_id, 'faculty_review',     'Faculty Review',               4,  'dean',                         true,  false),
    (v_template_id, 'pre_academic_board', 'Pre-Academic Board',           5,  'pre_academic_board_secretary', true,  true),
    (v_template_id, 'registrar_review',   'Deputy Registrar Review',      6,  'deputy_registrar_academics',   true,  false),
    (v_template_id, 'qa_review',          'QA Review',                    7,  'quality_assurance',            false, false),
    (v_template_id, 'academic_board',     'Academic Board',               8,  'academic_board_secretary',     false, true),
    (v_template_id, 'registrar_final',    'Registrar Final Approval',     9,  'registrar',                    false, false),
    (v_template_id, 'published',          'Published',                    10, null,                           false, false);

  insert into workflow_transitions (template_id, from_stage_key, to_stage_key, direction, trigger_action) values
    -- Forward chain
    (v_template_id, 'draft',              'dept_submitted',     'forward',   'result.submit'),
    (v_template_id, 'dept_submitted',     'central_review',     'forward',   'result.forward'),
    (v_template_id, 'central_review',     'faculty_review',     'forward',   'result.forward'),
    (v_template_id, 'faculty_review',     'pre_academic_board', 'forward',   'result.forward'),
    (v_template_id, 'pre_academic_board', 'registrar_review',   'forward',   'result.board_approve'),
    (v_template_id, 'registrar_review',   'qa_review',          'forward',   'result.forward'),
    (v_template_id, 'qa_review',          'academic_board',     'forward',   'result.qa_clear'),
    (v_template_id, 'academic_board',     'registrar_final',    'forward',   'result.board_approve'),
    (v_template_id, 'registrar_final',    'published',          'forward',   'result.publish'),
    -- Backward chain
    (v_template_id, 'dept_submitted',     'draft',              'backward',  'result.reject'),
    (v_template_id, 'central_review',     'dept_submitted',     'backward',  'result.reject'),
    (v_template_id, 'faculty_review',     'central_review',     'backward',  'result.reject'),
    (v_template_id, 'pre_academic_board', 'faculty_review',     'backward',  'result.reject'),
    (v_template_id, 'registrar_review',   'faculty_review',     'backward',  'result.reject'),
    (v_template_id, 'qa_review',          'dept_submitted',     'backward',  'result.qa_fail'),
    (v_template_id, 'academic_board',     'faculty_review',     'backward',  'result.reject'),
    -- QA interrupts
    (v_template_id, 'central_review',     'dept_submitted',     'interrupt', 'result.qa_interrupt'),
    (v_template_id, 'faculty_review',     'dept_submitted',     'interrupt', 'result.qa_interrupt'),
    (v_template_id, 'pre_academic_board', 'dept_submitted',     'interrupt', 'result.qa_interrupt'),
    (v_template_id, 'registrar_review',   'dept_submitted',     'interrupt', 'result.qa_interrupt');
end;
$$;

-- ─── Grant delegation ─────────────────────────────────────────
create or replace function rpc_grant_delegation(
  p_granting_person uuid,
  p_office_id       uuid,
  p_delegate_person uuid,
  p_level           int,
  p_allowed_actions text[] default null,
  p_expires_at      timestamptz,
  p_reason          text
) returns jsonb language plpgsql security definer as $$
declare
  v_office record;
begin
  -- Granting person must hold or have authority over the office
  if not exists (
    select 1 from office_assignments
    where office_id = p_office_id and person_id = p_granting_person and is_active = true
  ) then
    -- Check if registrar is granting
    select * into v_office from offices where id = p_office_id;
    if not exists (
      select 1 from office_assignments oa
      join offices o on o.id = oa.office_id
      join capability_grants cg on cg.office_type = o.office_type and cg.action = 'delegation.grant'
      where oa.person_id = p_granting_person and oa.is_active = true
        and o.institution_id = v_office.institution_id
    ) then
      raise exception 'UNAUTHORIZED: you do not have authority to grant delegations from this office';
    end if;
  end if;

  if p_expires_at <= now() then
    raise exception 'Delegation expiry must be in the future';
  end if;

  insert into office_delegations (
    office_id, delegate_person_id, granted_by,
    delegation_level, allowed_actions, expires_at, reason
  ) values (
    p_office_id, p_delegate_person, p_granting_person,
    p_level, p_allowed_actions, p_expires_at, p_reason
  );

  -- Log to audit
  insert into audit_log (
    institution_id, office_id, person_id, authority_source,
    action, entity_type, entity_id, payload
  )
  select
    o.institution_id, p_office_id, p_granting_person, 'direct',
    'delegation.grant', 'office', p_office_id,
    jsonb_build_object('delegate', p_delegate_person, 'level', p_level, 'expires', p_expires_at)
  from offices o where o.id = p_office_id;

  return jsonb_build_object('success', true);
end;
$$;

-- ─── Revoke delegation ────────────────────────────────────────
create or replace function rpc_revoke_delegation(
  p_revoking_person  uuid,
  p_delegation_id    uuid,
  p_reason           text
) returns jsonb language plpgsql security definer as $$
declare
  v_del record;
begin
  select * into v_del from office_delegations where id = p_delegation_id;
  if not found then raise exception 'Delegation not found'; end if;

  update office_delegations
  set is_active = false, revoked_at = now(), revoked_by = p_revoking_person, revoke_reason = p_reason
  where id = p_delegation_id;

  insert into audit_log (
    institution_id, office_id, person_id, authority_source,
    action, entity_type, entity_id, payload
  )
  select
    o.institution_id, v_del.office_id, p_revoking_person, 'direct',
    'delegation.revoke', 'office', v_del.office_id,
    jsonb_build_object('delegation_id', p_delegation_id, 'reason', p_reason)
  from offices o where o.id = v_del.office_id;

  return jsonb_build_object('success', true);
end;
$$;

-- ─── Get my offices (for acting context selector) ─────────────
create or replace function rpc_get_my_offices(
  p_person_id uuid
) returns table (
  office_id        uuid,
  office_type      text,
  office_name      text,
  institution_id   uuid,
  institution_name text,
  institution_type institution_type,
  faculty_id       uuid,
  department_id    uuid,
  authority_source text,
  delegation_id    uuid,
  expires_at       timestamptz
) language plpgsql security definer as $$
begin
  -- Direct assignments
  return query
  select
    o.id, o.office_type, o.name,
    i.id, i.name, i.type,
    o.faculty_id, o.department_id,
    'direct'::text, null::uuid, null::timestamptz
  from office_assignments oa
  join offices o on o.id = oa.office_id
  join institutions i on i.id = o.institution_id
  where oa.person_id = p_person_id
    and oa.is_active = true
    and (oa.ended_at is null or oa.ended_at > now())
    and o.is_active = true;

  -- Delegations
  return query
  select
    o.id, o.office_type, o.name || ' (delegated)',
    i.id, i.name, i.type,
    o.faculty_id, o.department_id,
    'delegated'::text, od.id, od.expires_at
  from office_delegations od
  join offices o on o.id = od.office_id
  join institutions i on i.id = o.institution_id
  where od.delegate_person_id = p_person_id
    and od.is_active = true
    and od.expires_at > now();
end;
$$;
