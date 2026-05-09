# Studox OS

Academic management platform — React + Supabase.

## Stack

- **Frontend**: React 19, React Router 7, Tailwind CSS 3, Vite
- **Backend**: Supabase (PostgreSQL, RLS, RPCs, Edge Functions, Storage, pg_net)
- **Email**: Resend API
- **Payments**: Paystack
- **Push**: Web Push Protocol (VAPID)

---

## Setup

### 1. Environment variables

Copy `.env.example` to `.env` and fill in:

```bash
cp .env.example .env
```

Required:
- `VITE_SUPABASE_URL` — from Supabase dashboard → Settings → API
- `VITE_SUPABASE_ANON_KEY` — from same
- `VITE_VAPID_PUBLIC_KEY` — generate below

Generate VAPID keys:
```bash
npx web-push generate-vapid-keys
```

### 2. Database migrations

Run in order via Supabase dashboard SQL editor or CLI:

```bash
supabase db push
```

Files in `supabase/migrations/`:
| File | Contents |
|------|----------|
| `001_schema.sql` | All tables, enums, indexes |
| `002_flow_rpcs.sql` | Core governance RPCs |
| `003_boarddesk_paydesk_rpcs.sql` | Board + payment RPCs |
| `004_schedox_desk_rpcs.sql` | Timetable + course desk RPCs |
| `005_student_notifications_rpcs.sql` | Student portal + event RPCs |
| `006_fixes.sql` | Corrected RPCs |
| `007_storage_email_schema.sql` | Email queue, push tokens, storage meta |
| `008_notification_triggers.sql` | DB triggers for email + push |

### 3. Storage buckets

Run `supabase/storage_setup.sql` in the SQL editor to create buckets and RLS policies.

Buckets created:
- `course-materials` — lecture notes, slides, videos (max 25MB)
- `submissions` — student assignment files (max 25MB)

### 4. Edge Functions

Deploy both functions:

```bash
supabase functions deploy send-notification
supabase functions deploy paystack-webhook
```

Set required secrets:

```bash
supabase secrets set RESEND_API_KEY=re_xxxxxxxxxxxx
supabase secrets set VAPID_PUBLIC_KEY=your-vapid-public-key
supabase secrets set VAPID_PRIVATE_KEY=your-vapid-private-key
supabase secrets set VAPID_SUBJECT=mailto:admin@yourdomain.com
supabase secrets set PAYSTACK_SECRET_KEY=sk_live_xxxxxxxxxxxx
```

The `send-notification` function runs on a 2-minute cron to drain the email queue.

### 5. pg_net config (for real-time push from DB triggers)

Run once in SQL editor:

```sql
alter database postgres set app.supabase_url = 'https://your-project.supabase.co';
alter database postgres set app.service_role_key = 'your-service-role-key';
```

This allows the DB trigger in `008_notification_triggers.sql` to call the edge function via `pg_net` for immediate push delivery.

### 6. Paystack webhook

In the Paystack dashboard → Settings → Webhooks:
- Add URL: `https://your-project.supabase.co/functions/v1/paystack-webhook`
- Events: `charge.success`, `transfer.success`

When creating a Paystack payment link or initialising a transaction from the frontend, pass metadata:

```json
{
  "invoice_id": "uuid-of-student-invoice",
  "person_id":  "uuid-of-student-person"
}
```

### 7. Run locally

```bash
npm install
npm run dev
```

---

## Notification flow

```
User action (publish results / grade / payment / clearance)
    │
    ▼
Supabase RPC (write to DB)
    │
    ▼
Postgres trigger (008_notification_triggers.sql)
    ├── INSERT into email_queue          ← triggers email drain on next cron
    └── net.http_post → send-notification ← triggers immediate push via pg_net
            │
            ▼
    send-notification edge function
            ├── Resend API  → email delivered
            └── Web Push   → browser notification
```

---

## File upload paths

| Bucket | Path pattern |
|--------|-------------|
| `course-materials` | `{institution_id}/{offering_id}/{uuid}-{filename}` |
| `submissions` | `{institution_id}/{assignment_id}/{student_id}/{uuid}-{filename}` |

Signed URLs are generated with 1-year expiry and stored in the `url` column of `course_materials` and `file_url` column of `assignment_submissions`.

---

## Desks

| Route | Desk | Access |
|-------|------|--------|
| `/` | Hub | All authenticated |
| `/coredesk` | Coredesk | Office-assigned staff |
| `/acadex` | Acadex | Academic governance roles |
| `/boarddesk` | Boarddesk | Board secretaries |
| `/paydesk` | Paydesk | Bursary office |
| `/schedox` | Schedox | Admin, HOD, lecturers |
| `/desk` | Course Desk | Lecturers + registered students |
| `/student` | Student Portal | Enrolled students |
