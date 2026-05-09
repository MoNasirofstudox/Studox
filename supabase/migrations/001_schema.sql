-- ============================================================
-- STUDOX CATHEDRAL SCHEMA — MIGRATION 001
-- Full institutional infrastructure schema
-- Apply in Supabase SQL editor
-- ============================================================

-- ─── Extensions ──────────────────────────────────────────────
create extension if not exists "pgcrypto";

-- ─── Custom Types ─────────────────────────────────────────────
create type institution_type as enum ('university', 'polytechnic', 'college_of_education');
create type workflow_direction as enum ('forward', 'backward', 'interrupt');
create type authority_source_type as enum ('direct', 'delegated');
create type committee_type as enum ('academic_board', 'pre_academic_board');
create type committee_role as enum ('chair', 'secretary', 'member');
create type batch_decision as enum ('approved', 'rejected', 'deferred');

-- ============================================================
-- LAYER 1 — REGISTRY (Canonical Truth)
-- ============================================================

-- Institutions
create table institutions (
  id                uuid primary key default gen_random_uuid(),
  name              text not null,
  slug              text not null unique,
  type              institution_type not null,
  state             text,
  email             text,
  subscription_tier text not null default 'free',
  is_active         boolean not null default false, -- false until onboarding complete
  onboarding_step   int not null default 1,         -- 1-4
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

-- Persons (all humans — replaces profiles + auth.users link)
create table persons (
  id          uuid primary key references auth.users(id) on delete cascade,
  email       text not null unique,
  first_name  text not null,
  last_name   text not null,
  global_role text not null default 'user' check (global_role in ('super_admin', 'user')),
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- Academic Sessions
create table academic_sessions (
  id             uuid primary key default gen_random_uuid(),
  institution_id uuid not null references institutions(id),
  name           text not null,
  start_date     date not null,
  end_date       date not null,
  is_active      boolean not null default true,
  created_at     timestamptz not null default now()
);

-- Semesters
create table semesters (
  id             uuid primary key default gen_random_uuid(),
  institution_id uuid not null references institutions(id),
  session_id     uuid not null references academic_sessions(id),
  type           text not null check (type in ('first', 'second', 'third')),
  start_date     date,
  end_date       date,
  is_current     boolean not null default false,
  created_at     timestamptz not null default now()
);

-- Faculties
create table faculties (
  id             uuid primary key default gen_random_uuid(),
  institution_id uuid not null references institutions(id),
  name           text not null,
  code           text not null,
  is_active      boolean not null default true,
  created_at     timestamptz not null default now(),
  unique(institution_id, code)
);

-- Departments
create table departments (
  id             uuid primary key default gen_random_uuid(),
  institution_id uuid not null references institutions(id),
  faculty_id     uuid references faculties(id),
  name           text not null,
  code           text not null,
  is_active      boolean not null default true,
  created_at     timestamptz not null default now(),
  unique(institution_id, code)
);

-- Programs
create table programs (
  id              uuid primary key default gen_random_uuid(),
  institution_id  uuid not null references institutions(id),
  department_id   uuid not null references departments(id),
  name            text not null,
  code            text not null,
  duration_years  int not null default 4,
  is_active       boolean not null default true,
  created_at      timestamptz not null default now()
);

-- Courses
create table courses (
  id              uuid primary key default gen_random_uuid(),
  institution_id  uuid not null references institutions(id),
  department_id   uuid not null references departments(id),
  name            text not null,
  code            text not null,
  level           int not null,
  credit_units    int not null default 3,
  is_active       boolean not null default true,
  created_at      timestamptz not null default now(),
  unique(institution_id, code)
);

-- Course Offerings
create table course_offerings (
  id              uuid primary key default gen_random_uuid(),
  institution_id  uuid not null references institutions(id),
  semester_id     uuid not null references semesters(id),
  course_id       uuid not null references courses(id),
  lecturer_id     uuid references persons(id),
  is_active       boolean not null default true,
  created_at      timestamptz not null default now(),
  unique(semester_id, course_id)
);

-- Student Enrollments
create table student_enrollments (
  id              uuid primary key default gen_random_uuid(),
  institution_id  uuid not null references institutions(id),
  student_id      uuid not null references persons(id),
  program_id      uuid not null references programs(id),
  current_level   int not null,
  matric_number   text,
  jamb_number     text,
  status          text not null default 'active'
                  check (status in ('active', 'suspended', 'graduated', 'withdrawn')),
  admitted_at     timestamptz not null default now(),
  created_at      timestamptz not null default now(),
  unique(institution_id, student_id, program_id)
);

-- Course Registrations
create table course_registrations (
  id              uuid primary key default gen_random_uuid(),
  institution_id  uuid not null references institutions(id),
  enrollment_id   uuid not null references student_enrollments(id),
  offering_id     uuid not null references course_offerings(id),
  student_id      uuid not null references persons(id),
  registered_at   timestamptz not null default now(),
  is_active       boolean not null default true,
  unique(enrollment_id, offering_id)
);

-- ============================================================
-- LAYER 2 — COREDESK (Governance)
-- ============================================================

-- Offices — permanent authority units, outlive any person
create table offices (
  id              uuid primary key default gen_random_uuid(),
  institution_id  uuid not null references institutions(id),
  office_type     text not null,           -- e.g. 'registrar', 'head_of_department'
  name            text not null,           -- human label e.g. "HOD, Computer Science"
  faculty_id      uuid references faculties(id),
  department_id   uuid references departments(id),
  is_active       boolean not null default true,
  created_at      timestamptz not null default now()
);

-- Office Assignments — time-bound person → office link
create table office_assignments (
  id              uuid primary key default gen_random_uuid(),
  office_id       uuid not null references offices(id),
  person_id       uuid not null references persons(id),
  assigned_by     uuid not null references persons(id),
  started_at      timestamptz not null default now(),
  ended_at        timestamptz,             -- null = currently active
  is_active       boolean not null default true,
  created_at      timestamptz not null default now()
);

-- Office Delegations — scoped, expiring authority grants
create table office_delegations (
  id                 uuid primary key default gen_random_uuid(),
  office_id          uuid not null references offices(id),
  delegate_person_id uuid not null references persons(id),
  granted_by         uuid not null references persons(id),
  delegation_level   int not null check (delegation_level between 1 and 4),
  allowed_actions    text[],               -- null = all actions for this level
  reason             text,
  expires_at         timestamptz not null,
  is_active          boolean not null default true,
  revoked_at         timestamptz,
  revoked_by         uuid references persons(id),
  revoke_reason      text,
  created_at         timestamptz not null default now()
);

-- Capability Grants — what each office_type can do on what scope
create table capability_grants (
  id              uuid primary key default gen_random_uuid(),
  institution_id  uuid not null references institutions(id),
  office_type     text not null,
  action          text not null,
  scope_type      text not null check (scope_type in ('institution', 'faculty', 'department', 'offering')),
  created_at      timestamptz not null default now(),
  unique(institution_id, office_type, action)
);

-- ============================================================
-- LAYER 0 — FLOW (Enforcement Engine)
-- ============================================================

-- Audit Log — immutable, every write action
create table audit_log (
  id               uuid primary key default gen_random_uuid(),
  institution_id   uuid not null references institutions(id),
  office_id        uuid not null references offices(id),
  person_id        uuid not null references persons(id),
  authority_source authority_source_type not null,
  delegation_id    uuid references office_delegations(id),
  action           text not null,
  entity_type      text not null,
  entity_id        uuid not null,
  payload          jsonb,
  ip_address       inet,
  created_at       timestamptz not null default now()
  -- enforced immutable via RLS: no UPDATE, no DELETE
);

-- System Events — emitted after successful flow actions
create table system_events (
  id               uuid primary key default gen_random_uuid(),
  institution_id   uuid not null references institutions(id),
  event_type       text not null,
  entity_type      text not null,
  entity_id        uuid not null,
  triggered_by     uuid not null references persons(id),
  triggered_office uuid not null references offices(id),
  payload          jsonb,
  created_at       timestamptz not null default now()
);

-- ============================================================
-- WORKFLOW ENGINE — Configuration-driven state machine
-- ============================================================

-- Templates — one per institution_type per workflow_type
create table workflow_templates (
  id               uuid primary key default gen_random_uuid(),
  institution_type institution_type not null,
  workflow_type    text not null,
  name             text not null,
  description      text,
  is_active        boolean not null default true,
  created_at       timestamptz not null default now(),
  unique(institution_type, workflow_type)
);

-- Stages — ordered steps within a template
create table workflow_stages (
  id                    uuid primary key default gen_random_uuid(),
  template_id           uuid not null references workflow_templates(id),
  stage_key             text not null,
  name                  text not null,
  stage_order           int not null,
  required_office_type  text,            -- null for terminal stages
  qa_can_interrupt      boolean not null default false,
  is_committee_stage    boolean not null default false,
  created_at            timestamptz not null default now(),
  unique(template_id, stage_key)
);

-- Transitions — valid state movements
create table workflow_transitions (
  id              uuid primary key default gen_random_uuid(),
  template_id     uuid not null references workflow_templates(id),
  from_stage_key  text not null,
  to_stage_key    text not null,
  direction       workflow_direction not null,
  trigger_action  text not null,
  created_at      timestamptz not null default now()
);

-- ============================================================
-- RESULT BATCH — Core object, everything revolves around this
-- ============================================================

create table result_batches (
  id                  uuid primary key default gen_random_uuid(),
  institution_id      uuid not null references institutions(id),
  semester_id         uuid not null references semesters(id),
  department_id       uuid not null references departments(id),
  current_stage       text not null default 'draft',
  is_locked           boolean not null default false,
  qa_flagged          boolean not null default false,
  qa_flag_reason      text,
  qa_flagged_at       timestamptz,
  qa_flagged_by_office uuid references offices(id),
  created_by_office   uuid not null references offices(id),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  unique(semester_id, department_id)
);

-- Stage History — every transition on a batch
create table batch_stage_history (
  id               uuid primary key default gen_random_uuid(),
  batch_id         uuid not null references result_batches(id),
  from_stage       text,
  to_stage         text not null,
  acting_office_id uuid not null references offices(id),
  acting_person_id uuid not null references persons(id),
  authority_source authority_source_type not null,
  note             text,
  created_at       timestamptz not null default now()
);

-- Batch Annotations — notes attached to a batch at any stage
create table batch_annotations (
  id               uuid primary key default gen_random_uuid(),
  batch_id         uuid not null references result_batches(id),
  institution_id   uuid not null references institutions(id),
  content          text not null,
  created_by_office uuid not null references offices(id),
  created_by_person uuid not null references persons(id),
  created_at       timestamptz not null default now()
);

-- Results — individual student scores within a batch
create table results (
  id                   uuid primary key default gen_random_uuid(),
  institution_id       uuid not null references institutions(id),
  batch_id             uuid not null references result_batches(id),
  registration_id      uuid not null references course_registrations(id),
  student_id           uuid not null references persons(id),
  offering_id          uuid not null references course_offerings(id),
  ca_score             numeric(5,2) check (ca_score >= 0 and ca_score <= 40),
  exam_score           numeric(5,2) check (exam_score >= 0 and exam_score <= 60),
  total_score          numeric(5,2) generated always as (
                         coalesce(ca_score, 0) + coalesce(exam_score, 0)
                       ) stored,
  grade                text,
  grade_point          numeric(3,1),
  status               text not null default 'draft'
                       check (status in ('draft', 'submitted', 'verified', 'approved', 'published', 'rejected')),
  entered_by_office    uuid references offices(id),
  entered_by_person    uuid references persons(id),
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  unique(batch_id, registration_id)
);

-- Grade Scales
create table grade_scales (
  id              uuid primary key default gen_random_uuid(),
  institution_id  uuid not null references institutions(id),
  min_score       int not null,
  max_score       int not null,
  grade           text not null,
  grade_point     numeric(3,1) not null,
  created_at      timestamptz not null default now()
);

-- ============================================================
-- COMMITTEE MODEL
-- ============================================================

create table committees (
  id                  uuid primary key default gen_random_uuid(),
  institution_id      uuid not null references institutions(id),
  name                text not null,
  committee_type      committee_type not null,
  secretary_office_id uuid references offices(id),
  is_active           boolean not null default true,
  created_at          timestamptz not null default now()
);

create table committee_members (
  id                uuid primary key default gen_random_uuid(),
  committee_id      uuid not null references committees(id),
  person_id         uuid not null references persons(id),
  office_id         uuid not null references offices(id),
  role_in_committee committee_role not null,
  joined_at         timestamptz not null default now(),
  ended_at          timestamptz,
  is_active         boolean not null default true
);

create table committee_sessions (
  id                  uuid primary key default gen_random_uuid(),
  committee_id        uuid not null references committees(id),
  institution_id      uuid not null references institutions(id),
  session_date        date not null,
  session_ref         text,                -- e.g. "AB/2025/004"
  agenda              text,
  recorded_by_office  uuid not null references offices(id),
  recorded_by_person  uuid not null references persons(id),
  submitted_at        timestamptz,         -- null = draft, set when submitted
  created_at          timestamptz not null default now()
);

create table session_attendance (
  id           uuid primary key default gen_random_uuid(),
  session_id   uuid not null references committee_sessions(id),
  person_id    uuid not null references persons(id),
  office_id    uuid not null references offices(id),
  present      boolean not null default true
);

create table committee_resolutions (
  id                  uuid primary key default gen_random_uuid(),
  session_id          uuid not null references committee_sessions(id),
  institution_id      uuid not null references institutions(id),
  batch_id            uuid references result_batches(id),
  entity_type         text not null default 'result_batch',
  entity_id           uuid not null,
  decision            batch_decision not null,
  resolution_text     text not null,
  recorded_by_office  uuid not null references offices(id),
  recorded_by_person  uuid not null references persons(id),
  triggers_action     text,                -- e.g. 'result.board_approve'
  created_at          timestamptz not null default now()
);

-- ============================================================
-- PAYDESK
-- ============================================================

create table fee_schedules (
  id              uuid primary key default gen_random_uuid(),
  institution_id  uuid not null references institutions(id),
  session_id      uuid not null references academic_sessions(id),
  program_id      uuid references programs(id),   -- null = all programs
  level           int,                             -- null = all levels
  name            text not null,
  is_active       boolean not null default true,
  created_at      timestamptz not null default now()
);

create table fee_items (
  id            uuid primary key default gen_random_uuid(),
  schedule_id   uuid not null references fee_schedules(id),
  name          text not null,
  amount        numeric(12,2) not null,
  item_order    int not null default 0,
  created_at    timestamptz not null default now()
);

create table student_invoices (
  id              uuid primary key default gen_random_uuid(),
  institution_id  uuid not null references institutions(id),
  student_id      uuid not null references persons(id),
  enrollment_id   uuid not null references student_enrollments(id),
  session_id      uuid not null references academic_sessions(id),
  schedule_id     uuid references fee_schedules(id),
  total_amount    numeric(12,2) not null,
  paid_amount     numeric(12,2) not null default 0,
  status          text not null default 'unpaid' check (status in ('unpaid', 'partial', 'paid')),
  generated_at    timestamptz not null default now(),
  created_at      timestamptz not null default now()
);

create table payments (
  id              uuid primary key default gen_random_uuid(),
  invoice_id      uuid not null references student_invoices(id),
  institution_id  uuid not null references institutions(id),
  student_id      uuid not null references persons(id),
  amount          numeric(12,2) not null,
  method          text not null check (method in ('manual', 'paystack', 'flutterwave')),
  reference       text,
  verified_by     uuid references persons(id),
  source          text not null check (source in ('manual', 'online')),
  paid_at         timestamptz not null default now(),
  created_at      timestamptz not null default now()
);

create table financial_clearances (
  id               uuid primary key default gen_random_uuid(),
  institution_id   uuid not null references institutions(id),
  student_id       uuid not null references persons(id),
  session_id       uuid not null references academic_sessions(id),
  is_cleared       boolean not null default false,
  override_by      uuid references persons(id),
  override_reason  text,
  cleared_at       timestamptz,
  created_at       timestamptz not null default now(),
  unique(institution_id, student_id, session_id)
);

-- ============================================================
-- DESK (Course Materials, Assignments, Discussions)
-- ============================================================

create table course_materials (
  id              uuid primary key default gen_random_uuid(),
  offering_id     uuid not null references course_offerings(id),
  institution_id  uuid not null references institutions(id),
  title           text not null,
  type            text not null check (type in ('file', 'link')),
  url             text,
  storage_path    text,
  week_label      text,
  uploaded_by     uuid not null references persons(id),
  created_at      timestamptz not null default now()
);

create table assignments (
  id              uuid primary key default gen_random_uuid(),
  offering_id     uuid not null references course_offerings(id),
  institution_id  uuid not null references institutions(id),
  title           text not null,
  description     text,
  due_at          timestamptz not null,
  max_score       numeric(5,2) not null default 100,
  created_by      uuid not null references persons(id),
  created_at      timestamptz not null default now()
);

create table assignment_submissions (
  id              uuid primary key default gen_random_uuid(),
  assignment_id   uuid not null references assignments(id),
  student_id      uuid not null references persons(id),
  institution_id  uuid not null references institutions(id),
  text_content    text,
  file_url        text,
  storage_path    text,
  submitted_at    timestamptz not null default now(),
  is_late         boolean not null default false,
  unique(assignment_id, student_id)
);

create table assignment_grades (
  id            uuid primary key default gen_random_uuid(),
  submission_id uuid not null references assignment_submissions(id) unique,
  score         numeric(5,2) not null,
  comment       text,
  graded_by     uuid not null references persons(id),
  graded_at     timestamptz not null default now()
);

create table discussion_threads (
  id              uuid primary key default gen_random_uuid(),
  offering_id     uuid not null references course_offerings(id),
  institution_id  uuid not null references institutions(id),
  title           text not null,
  created_by      uuid not null references persons(id),
  is_pinned       boolean not null default false,
  is_locked       boolean not null default false,
  created_at      timestamptz not null default now()
);

create table discussion_posts (
  id              uuid primary key default gen_random_uuid(),
  thread_id       uuid not null references discussion_threads(id),
  institution_id  uuid not null references institutions(id),
  content         text not null,
  created_by      uuid not null references persons(id),
  created_at      timestamptz not null default now()
);

-- ============================================================
-- SCHEDOX (Calendar & Timetable)
-- ============================================================

create table calendar_events (
  id              uuid primary key default gen_random_uuid(),
  institution_id  uuid not null references institutions(id),
  title           text not null,
  type            text not null check (type in ('exam', 'registration', 'holiday', 'event', 'deadline')),
  start_date      date not null,
  end_date        date,
  description     text,
  created_by      uuid not null references persons(id),
  created_at      timestamptz not null default now()
);

create table rooms (
  id              uuid primary key default gen_random_uuid(),
  institution_id  uuid not null references institutions(id),
  name            text not null,
  capacity        int,
  type            text check (type in ('classroom', 'lab', 'hall', 'office')),
  is_active       boolean not null default true,
  created_at      timestamptz not null default now()
);

create table timetable_slots (
  id              uuid primary key default gen_random_uuid(),
  institution_id  uuid not null references institutions(id),
  offering_id     uuid not null references course_offerings(id),
  department_id   uuid references departments(id),
  room_id         uuid references rooms(id),
  day             text not null check (day in ('Monday','Tuesday','Wednesday','Thursday','Friday','Saturday')),
  start_time      time not null,
  end_time        time not null,
  created_at      timestamptz not null default now()
);

-- ============================================================
-- INDEXES
-- ============================================================

create index idx_offices_institution on offices(institution_id);
create index idx_office_assignments_person on office_assignments(person_id) where is_active = true;
create index idx_office_assignments_office on office_assignments(office_id) where is_active = true;
create index idx_office_delegations_delegate on office_delegations(delegate_person_id) where is_active = true;
create index idx_capability_grants_lookup on capability_grants(institution_id, office_type, action);
create index idx_audit_log_institution on audit_log(institution_id, created_at desc);
create index idx_audit_log_entity on audit_log(entity_type, entity_id);
create index idx_result_batches_institution on result_batches(institution_id, current_stage);
create index idx_results_batch on results(batch_id);
create index idx_results_student on results(student_id);
create index idx_course_registrations_student on course_registrations(student_id);
create index idx_student_enrollments_student on student_enrollments(student_id);
create index idx_course_offerings_semester on course_offerings(semester_id);

-- ============================================================
-- RLS — Row Level Security
-- ============================================================

alter table institutions           enable row level security;
alter table persons                enable row level security;
alter table offices                enable row level security;
alter table office_assignments     enable row level security;
alter table office_delegations     enable row level security;
alter table capability_grants      enable row level security;
alter table audit_log              enable row level security;
alter table system_events          enable row level security;
alter table result_batches         enable row level security;
alter table results                enable row level security;
alter table batch_stage_history    enable row level security;
alter table committee_resolutions  enable row level security;

-- Persons: can read own record
create policy "persons_self_read" on persons for select using (auth.uid() = id);

-- Audit log: insert only, no update/delete
create policy "audit_log_insert" on audit_log for insert with check (true);
create policy "audit_log_select" on audit_log for select using (true);

-- Offices: read if member of institution (enforced via Flow at write time)
create policy "offices_read" on offices for select using (true);

-- Basic open read for now — Flow handles write authorization
-- Tighten per-module after Flow is proven
create policy "open_read_assignments" on office_assignments for select using (true);
create policy "open_read_delegations" on office_delegations for select using (true);
create policy "open_read_capabilities" on capability_grants for select using (true);
create policy "open_read_batches" on result_batches for select using (true);
create policy "open_read_results" on results for select using (true);
create policy "open_read_history" on batch_stage_history for select using (true);
create policy "open_read_resolutions" on committee_resolutions for select using (true);
create policy "open_read_events" on system_events for select using (true);
create policy "open_read_institutions" on institutions for select using (true);
